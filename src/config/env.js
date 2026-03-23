const dotenv = require('dotenv');

dotenv.config();

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3000),
  databaseUrl: requireEnv('DATABASE_URL'),
  redisUrl: requireEnv('REDIS_URL'),
  queueName: process.env.QUEUE_NAME || 'notifications',
  defaultTtl: Number(process.env.DEFAULT_TTL || 3600),
  attemptRetentionDays: Number(process.env.ATTEMPT_RETENTION_DAYS || 30),
  apiKeys: (process.env.API_KEYS || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean),
  vapidSubject: requireEnv('VAPID_SUBJECT'),
  vapidPublicKey: requireEnv('VAPID_PUBLIC_KEY'),
  vapidPrivateKey: requireEnv('VAPID_PRIVATE_KEY')
};

module.exports = { env };
