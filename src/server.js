const { buildApp } = require('./app');
const { env } = require('./config/env');
const { pool } = require('./config/db');
const { connection } = require('./config/redis');

async function start() {
  const app = buildApp();

  try {
    await app.listen({ host: env.host, port: env.port });
    app.log.info(`API running on ${env.host}:${env.port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }

  const shutdown = async () => {
    try {
      await app.close();
      await pool.end();
      await connection.quit();
      process.exit(0);
    } catch (error) {
      app.log.error(error);
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
