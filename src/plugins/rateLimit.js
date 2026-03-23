const fp = require('fastify-plugin');
const rateLimit = require('@fastify/rate-limit');

async function rateLimitPlugin(fastify) {
  await fastify.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute'
  });
}

module.exports = fp(rateLimitPlugin);
