const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'smpp_admin',
  user: process.env.DB_USER || 'smpp_user',
  password: process.env.DB_PASSWORD || 'smpp_password_2024',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Função para conectar
async function connect() {
  try {
    const client = await pool.connect();
    console.log('Conectado ao PostgreSQL');
    client.release();
    return true;
  } catch (err) {
    console.error('Erro ao conectar ao PostgreSQL:', err);
    throw err;
  }
}

// Função para executar queries
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query executada', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Erro na query:', error);
    throw error;
  }
}

// Função para executar transações
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

// Função para fechar conexões
async function close() {
  await pool.end();
}

module.exports = {
  pool,
  connect,
  query,
  transaction,
  close
};