const IORedis = require('ioredis');
const { env } = require('./env');

const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null
});

module.exports = { connection };
