const {
  upsertSubscription,
  listSubscriptions,
  deactivateSubscription
} = require('../services/subscriptionService');

async function subscriptionRoutes(fastify) {
  fastify.post(
    '/subscriptions/upsert',
    {
      schema: {
        body: {
          type: 'object',
          required: ['endpoint', 'keys'],
          properties: {
            endpoint: { type: 'string', minLength: 1 },
            contentEncoding: { type: 'string' },
            userAgent: { type: 'string' },
            userId: { type: 'string', format: 'uuid' },
            externalUserId: { type: 'string' },
            keys: {
              type: 'object',
              required: ['p256dh', 'auth'],
              properties: {
                p256dh: { type: 'string', minLength: 1 },
                auth: { type: 'string', minLength: 1 }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const idempotencyKey = request.headers['idempotency-key'];
      const result = await upsertSubscription({
        body: request.body,
        idempotencyKey
      });

      reply.code(result.statusCode).send({
        cached: result.cached,
        data: result.response
      });
    }
  );

  fastify.get('/subscriptions', async (request) => {
    const userId = request.query.userId;
    const activeOnly = request.query.activeOnly !== 'false';
    const subscriptions = await listSubscriptions({ userId, activeOnly });
    return { data: subscriptions };
  });

  fastify.delete('/subscriptions/:id', async (request, reply) => {
    await deactivateSubscription(request.params.id);
    reply.code(204).send();
  });
}

module.exports = subscriptionRoutes;
