const { Pool } = require('pg');
require('dotenv').config();

// Create singleton connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'energy_user',
  password: process.env.DB_PASSWORD || 'energy_pass',
  database: process.env.DB_NAME || 'energy_ingestion',
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  max: parseInt(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Helper function to execute queries with logging
async function query(text, params = []) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Query executed:', {
        duration: `${duration}ms`,
        rows: result.rowCount,
        command: text.split(' ')[0]
      });
    }
    
    return result;
  } catch (error) {
    console.error('Query error:', {
      error: error.message,
      query: text,
      params
    });
    throw error;
  }
}

// Helper function for transactions
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Test database connection
async function testConnection() {
  try {
    const result = await query('SELECT NOW() as time, version() as version');
    console.log('✅ Database connected:', result.rows[0].time);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Graceful shutdown
async function closePool() {
  await pool.end();
  console.log('Database connection pool closed');
}

module.exports = {
  pool,
  query,
  transaction,
  testConnection,
  closePool
};