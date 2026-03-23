const { Worker } = require('bullmq');
const { env } = require('../config/env');
const { connection } = require('../config/redis');
const { query } = require('../config/db');
const { sendWebPush } = require('../services/pushService');

async function syncNotificationState(notificationId) {
  const { rows } = await query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_count,
      COUNT(*) FILTER (WHERE status IN ('queued', 'processing'))::int AS pending_count
    FROM delivery_attempts
    WHERE notification_id = $1
    `,
    [notificationId]
  );

  const summary = rows[0];
  let nextStatus = 'processing';

  if (summary.sent_count === summary.total) {
    nextStatus = 'sent';
  } else if (summary.pending_count === 0 && summary.sent_count === 0) {
    nextStatus = 'failed';
  }

  await query(
    `
    UPDATE notifications
    SET status = $2,
        updated_at = NOW()
    WHERE id = $1
    `,
    [notificationId, nextStatus]
  );
}

async function processDelivery(attemptId) {
  const attemptResult = await query(
    `
    SELECT
      da.id,
      da.notification_id,
      da.attempt_no,
      s.id AS subscription_id,
      s.endpoint,
      s.p256dh,
      s.auth,
      n.payload
    FROM delivery_attempts da
    INNER JOIN subscriptions s ON s.id = da.subscription_id
    INNER JOIN notifications n ON n.id = da.notification_id
    WHERE da.id = $1
    `,
    [attemptId]
  );

  if (attemptResult.rowCount === 0) {
    return;
  }

  const attempt = attemptResult.rows[0];

  await query(
    `
    UPDATE delivery_attempts
    SET status = 'processing',
        attempt_no = attempt_no + 1,
        updated_at = NOW()
    WHERE id = $1
    `,
    [attemptId]
  );

  try {
    await sendWebPush(
      {
        endpoint: attempt.endpoint,
        p256dh: attempt.p256dh,
        auth: attempt.auth
      },
      attempt.payload
    );

    await query(
      `
      UPDATE delivery_attempts
      SET status = 'sent',
          error_message = NULL,
          http_status = 201,
          sent_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      `,
      [attemptId]
    );

    await syncNotificationState(attempt.notification_id);
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);

    await query(
      `
      UPDATE delivery_attempts
      SET status = 'failed',
          error_message = $2,
          http_status = $3,
          updated_at = NOW()
      WHERE id = $1
      `,
      [attemptId, error.message, statusCode]
    );

    if (statusCode === 404 || statusCode === 410) {
      await query(
        `
        UPDATE subscriptions
        SET is_active = FALSE,
            invalidated_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        `,
        [attempt.subscription_id]
      );
    }

    await syncNotificationState(attempt.notification_id);
    throw error;
  }
}

const worker = new Worker(
  env.queueName,
  async (job) => {
    await processDelivery(job.data.attemptId);
  },
  {
    connection,
    concurrency: 5
  }
);

worker.on('completed', (job) => {
  console.log(`Delivery completed: ${job.id}`);
});

worker.on('failed', (job, err) => {
  console.error(`Delivery failed: ${job?.id}`, err.message);
});

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
