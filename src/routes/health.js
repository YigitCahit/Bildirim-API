const { query } = require('../config/db');
const { connection } = require('../config/redis');

async function healthRoutes(fastify) {
  fastify.get('/health', async () => ({ ok: true, service: 'bildirim-api' }));

  fastify.get('/ready', async (_request, reply) => {
    try {
      await query('SELECT 1');
      await connection.ping();
      return { ok: true };
    } catch (error) {
      reply.code(503);
      return {
        ok: false,
        message: 'Dependency check failed'
      };
    }
  });
}

module.exports = healthRoutes;
