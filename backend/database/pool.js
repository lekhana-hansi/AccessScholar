const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const configured = Boolean(process.env.DATABASE_URL);
const pool = configured
  ? new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX) || 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ssl: (process.env.DATABASE_URL.includes('sslmode=') || process.env.DATABASE_URL.includes('supabase.co') || process.env.PG_SSL === 'true')
      ? { rejectUnauthorized: false }
      : undefined,
  })
  : null;

if (pool) {
  pool.on('error', (error) => {
    console.error('Unexpected idle PostgreSQL client error.', error);
  });
}

const query = async (text, values) => {
  if (!pool) {
    const error = new Error('DATABASE_URL is not configured.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }
  return pool.query(text, values);
};

const checkConnection = async () => {
  if (!pool) return { configured: false, connected: false };
  await pool.query('SELECT 1');
  return { configured: true, connected: true };
};

const close = async () => {
  if (pool) await pool.end();
};

module.exports = { checkConnection, close, isConfigured: configured, pool, query };
