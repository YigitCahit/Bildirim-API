const { query, withTransaction } = require('../config/db');
const { ApiError } = require('../utils/apiError');

async function resolveUser(client, { userId, externalUserId }) {
  if (userId) {
    const existing = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (existing.rowCount === 0) {
      throw new ApiError(404, 'User not found');
    }
    return existing.rows[0].id;
  }

  if (externalUserId) {
    const upsert = await client.query(
      `
      INSERT INTO users(external_id)
      VALUES ($1)
      ON CONFLICT (external_id) DO UPDATE SET external_id = EXCLUDED.external_id
      RETURNING id
      `,
      [externalUserId]
    );

    return upsert.rows[0].id;
  }

  return null;
}

async function upsertSubscription({ body, idempotencyKey }) {
  return withTransaction(async (client) => {
    if (idempotencyKey) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`subscription_upsert:${idempotencyKey}`]);
      const existing = await client.query(
        'SELECT status_code, response_body FROM idempotency_records WHERE scope = $1 AND idempotency_key = $2',
        ['subscription_upsert', idempotencyKey]
      );
      if (existing.rowCount > 0) {
        return {
          cached: true,
          statusCode: existing.rows[0].status_code,
          response: existing.rows[0].response_body
        };
      }
    }

    const upsert = await client.query(
      `
      INSERT INTO subscriptions(endpoint, p256dh, auth, content_encoding, user_agent)
      VALUES ($1, $2, $3, COALESCE($4, 'aes128gcm'), $5)
      ON CONFLICT (endpoint, p256dh)
      DO UPDATE SET
        auth = EXCLUDED.auth,
        content_encoding = EXCLUDED.content_encoding,
        user_agent = EXCLUDED.user_agent,
        is_active = TRUE,
        invalidated_at = NULL,
        last_seen_at = NOW(),
        updated_at = NOW()
      RETURNING *
      `,
      [body.endpoint, body.keys.p256dh, body.keys.auth, body.contentEncoding, body.userAgent || null]
    );

    const subscription = upsert.rows[0];

    const userId = await resolveUser(client, {
      userId: body.userId,
      externalUserId: body.externalUserId
    });

    if (userId) {
      await client.query(
        `
        INSERT INTO user_subscriptions(user_id, subscription_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, subscription_id) DO NOTHING
        `,
        [userId, subscription.id]
      );
    }

    const response = {
      id: subscription.id,
      endpoint: subscription.endpoint,
      contentEncoding: subscription.content_encoding,
      isActive: subscription.is_active,
      userId: userId || null,
      updatedAt: subscription.updated_at
    };

    if (idempotencyKey) {
      await client.query(
        `
        INSERT INTO idempotency_records(scope, idempotency_key, resource_id, status_code, response_body)
        VALUES ($1, $2, $3, $4, $5)
        `,
        ['subscription_upsert', idempotencyKey, subscription.id, 200, response]
      );
    }

    return {
      cached: false,
      statusCode: 200,
      response
    };
  });
}

async function listSubscriptions({ userId, activeOnly = true }) {
  if (userId) {
    const { rows } = await query(
      `
      SELECT s.*
      FROM subscriptions s
      INNER JOIN user_subscriptions us ON us.subscription_id = s.id
      WHERE us.user_id = $1
        AND ($2::boolean = FALSE OR s.is_active = TRUE)
      ORDER BY s.created_at DESC
      `,
      [userId, activeOnly]
    );
    return rows;
  }

  const { rows } = await query(
    `
    SELECT *
    FROM subscriptions
    WHERE ($1::boolean = FALSE OR is_active = TRUE)
    ORDER BY created_at DESC
    `,
    [activeOnly]
  );

  return rows;
}

async function deactivateSubscription(subscriptionId) {
  const result = await query(
    `
    UPDATE subscriptions
    SET is_active = FALSE,
        invalidated_at = NOW(),
        updated_at = NOW()
    WHERE id = $1
    RETURNING id
    `,
    [subscriptionId]
  );

  if (result.rowCount === 0) {
    throw new ApiError(404, 'Subscription not found');
  }
}

module.exports = {
  upsertSubscription,
  listSubscriptions,
  deactivateSubscription
};
