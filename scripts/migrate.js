const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../src/config/db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        file_name TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
    const files = (await fs.readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();

    for (const file of files) {
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE file_name = $1', [file]);
      if (exists.rowCount > 0) {
        continue;
      }

      const migrationSql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      await client.query('BEGIN');
      await client.query(migrationSql);
      await client.query('INSERT INTO schema_migrations(file_name) VALUES($1)', [file]);
      await client.query('COMMIT');
      console.log(`Applied migration: ${file}`);
    }

    console.log('Migrations complete.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
