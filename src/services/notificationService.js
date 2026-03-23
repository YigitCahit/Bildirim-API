const { query, withTransaction } = require('../config/db');
const { ApiError } = require('../utils/apiError');
const { enqueueDeliveryAttempt } = require('../queue/notificationQueue');

async function findTargetSubscriptions(client, target) {
  if (target.userId) {
    const byUser = await client.query(
      `
      SELECT s.id
      FROM subscriptions s
      INNER JOIN user_subscriptions us ON us.subscription_id = s.id
      WHERE us.user_id = $1 AND s.is_active = TRUE
      `,
      [target.userId]
    );
    return byUser.rows.map((row) => row.id);
  }

  if (Array.isArray(target.subscriptionIds) && target.subscriptionIds.length > 0) {
    const byIds = await client.query(
      `
      SELECT id
      FROM subscriptions
      WHERE id = ANY($1::uuid[]) AND is_active = TRUE
      `,
      [target.subscriptionIds]
    );
    return byIds.rows.map((row) => row.id);
  }

  throw new ApiError(400, 'target.userId or target.subscriptionIds is required');
}

async function enqueueNotification({ body, idempotencyKey }) {
  const txResult = await withTransaction(async (client) => {
    if (idempotencyKey) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`notification_enqueue:${idempotencyKey}`]);
      const existing = await client.query(
        'SELECT status_code, response_body FROM idempotency_records WHERE scope = $1 AND idempotency_key = $2',
        ['notification_enqueue', idempotencyKey]
      );
      if (existing.rowCount > 0) {
        return {
          cached: true,
          statusCode: existing.rows[0].status_code,
          response: existing.rows[0].response_body,
          attemptIds: []
        };
      }
    }

    const targetSubscriptionIds = await findTargetSubscriptions(client, body.target);
    if (targetSubscriptionIds.length === 0) {
      throw new ApiError(404, 'No active subscriptions for target');
    }

    const targetType = body.target.userId ? 'user' : 'subscription';

    const insertedNotification = await client.query(
      `
      INSERT INTO notifications(target_type, target_user_id, payload, status)
      VALUES ($1, $2, $3, 'queued')
      RETURNING id, status, created_at
      `,
      [targetType, body.target.userId || null, body.payload]
    );

    const notification = insertedNotification.rows[0];
    const attemptIds = [];

    for (const subscriptionId of targetSubscriptionIds) {
      const attempt = await client.query(
        `
        INSERT INTO delivery_attempts(notification_id, subscription_id, status)
        VALUES ($1, $2, 'queued')
        RETURNING id
        `,
        [notification.id, subscriptionId]
      );
      attemptIds.push(attempt.rows[0].id);
    }

    const response = {
      id: notification.id,
      status: notification.status,
      attempts: attemptIds.length,
      targetType,
      createdAt: notification.created_at
    };

    if (idempotencyKey) {
      await client.query(
        `
        INSERT INTO idempotency_records(scope, idempotency_key, resource_id, status_code, response_body)
        VALUES ($1, $2, $3, $4, $5)
        `,
        ['notification_enqueue', idempotencyKey, notification.id, 202, response]
      );
    }

    return {
      cached: false,
      statusCode: 202,
      response,
      attemptIds
    };
  });

  if (!txResult.cached) {
    for (const attemptId of txResult.attemptIds) {
      await enqueueDeliveryAttempt(attemptId);
    }
  }

  return txResult;
}

async function getNotification(notificationId) {
  const notificationResult = await query(
    `
    SELECT * FROM notifications WHERE id = $1
    `,
    [notificationId]
  );

  if (notificationResult.rowCount === 0) {
    throw new ApiError(404, 'Notification not found');
  }

  const attemptsResult = await query(
    `
    SELECT id, subscription_id, attempt_no, status, error_message, http_status, sent_at, updated_at
    FROM delivery_attempts
    WHERE notification_id = $1
    ORDER BY created_at ASC
    `,
    [notificationId]
  );

  return {
    ...notificationResult.rows[0],
    attempts: attemptsResult.rows
  };
}

async function listUserNotifications(userId, limit = 50) {
  const { rows } = await query(
    `
    SELECT *
    FROM notifications
    WHERE target_user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [userId, limit]
  );

  return rows;
}

module.exports = {
  enqueueNotification,
  getNotification,
  listUserNotifications
};
