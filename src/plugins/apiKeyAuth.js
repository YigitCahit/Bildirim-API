const fp = require('fastify-plugin');
const { env } = require('../config/env');

async function apiKeyAuthPlugin(fastify) {
  const openRoutes = new Set(['/health', '/ready']);

  fastify.decorate('verifyApiKey', async (request) => {
    const routePath = request.routeOptions?.url || request.url;
    if (openRoutes.has(routePath)) {
      return;
    }

    if (env.apiKeys.length === 0) {
      return;
    }

    const apiKey = request.headers['x-api-key'];
    if (!apiKey || !env.apiKeys.includes(apiKey)) {
      const error = new Error('Invalid API key');
      error.statusCode = 401;
      throw error;
    }
  });

  fastify.addHook('preHandler', fastify.verifyApiKey);
}

module.exports = fp(apiKeyAuthPlugin);
