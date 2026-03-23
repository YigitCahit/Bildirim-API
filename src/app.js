const fastify = require('fastify');
const apiKeyAuthPlugin = require('./plugins/apiKeyAuth');
const rateLimitPlugin = require('./plugins/rateLimit');
const healthRoutes = require('./routes/health');
const subscriptionRoutes = require('./routes/subscriptions');
const notificationRoutes = require('./routes/notifications');
const { ApiError } = require('./utils/apiError');

function buildApp() {
  const app = fastify({
    logger: {
      level: 'info'
    }
  });

  app.register(rateLimitPlugin);
  app.register(apiKeyAuthPlugin);
  app.register(healthRoutes);
  app.register(subscriptionRoutes, { prefix: '/api' });
  app.register(notificationRoutes, { prefix: '/api' });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      reply.code(error.statusCode).send({
        error: error.message
      });
      return;
    }

    if (error.validation) {
      reply.code(400).send({
        error: 'Validation error',
        details: error.validation
      });
      return;
    }

    app.log.error(error);
    reply.code(error.statusCode || 500).send({
      error: error.message || 'Internal server error'
    });
  });

  return app;
}

module.exports = { buildApp };
