const fs = require('fs');
const path = require('path');
const { pool, isConfigured } = require('./pool');

const migrationsPath = path.join(__dirname, 'migrations');

const migrate = async () => {
  if (!isConfigured) {
    throw new Error('Set DATABASE_URL before running database migrations.');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration_name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const files = fs.readdirSync(migrationsPath)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  for (const migrationName of files) {
    const alreadyApplied = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
      [migrationName],
    );
    if (alreadyApplied.rowCount) continue;

    const sql = fs.readFileSync(path.join(migrationsPath, migrationName), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
        [migrationName],
      );
      await client.query('COMMIT');
      console.log(`Applied migration ${migrationName}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${migrationName} failed: ${error.message}`, { cause: error });
    } finally {
      client.release();
    }
  }
};

migrate()
  .catch((error) => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { close } = require('./pool');
    await close();
  });
