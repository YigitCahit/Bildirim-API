const {
  enqueueNotification,
  getNotification,
  listUserNotifications
} = require('../services/notificationService');

async function notificationRoutes(fastify) {
  fastify.post(
    '/notifications/enqueue',
    {
      schema: {
        body: {
          type: 'object',
          required: ['target', 'payload'],
          properties: {
            target: {
              type: 'object',
              properties: {
                userId: { type: 'string', format: 'uuid' },
                subscriptionIds: {
                  type: 'array',
                  items: { type: 'string', format: 'uuid' }
                }
              }
            },
            payload: {
              type: 'object',
              required: ['title', 'body'],
              properties: {
                title: { type: 'string', minLength: 1 },
                body: { type: 'string', minLength: 1 },
                url: { type: 'string' },
                data: { type: 'object' },
                ttl: { type: 'integer', minimum: 0 },
                urgency: { type: 'string', enum: ['very-low', 'low', 'normal', 'high'] },
                topic: { type: 'string' }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const idempotencyKey = request.headers['idempotency-key'];
      const result = await enqueueNotification({
        body: request.body,
        idempotencyKey
      });

      reply.code(result.statusCode).send({
        cached: result.cached,
        data: result.response
      });
    }
  );

  fastify.get('/notifications/:id', async (request) => {
    const notification = await getNotification(request.params.id);
    return { data: notification };
  });

  fastify.get('/users/:userId/notifications', async (request) => {
    const limit = Number(request.query.limit || 50);
    const notifications = await listUserNotifications(request.params.userId, limit);
    return { data: notifications };
  });
}

module.exports = notificationRoutes;
