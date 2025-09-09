const redis = require('redis');
const dotenv = require('dotenv');

dotenv.config();

const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      return new Error('Redis server refused connection');
    }
    if (options.total_retry_time > 1000 * 60 * 60) {
      return new Error('Retry time exhausted');
    }
    if (options.attempt > 10) {
      return undefined;
    }
    return Math.min(options.attempt * 100, 3000);
  }
});

// Função para conectar
async function connect() {
  try {
    await client.connect();
    console.log('Conectado ao Redis');
    return true;
  } catch (err) {
    console.error('Erro ao conectar ao Redis:', err);
    throw err;
  }
}

// Função para desconectar
async function disconnect() {
  try {
    await client.disconnect();
    console.log('Desconectado do Redis');
  } catch (err) {
    console.error('Erro ao desconectar do Redis:', err);
  }
}

// Função para set com TTL
async function setex(key, seconds, value) {
  try {
    return await client.setEx(key, seconds, JSON.stringify(value));
  } catch (error) {
    console.error('Erro ao setex:', error);
    throw error;
  }
}

// Função para get
async function get(key) {
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Erro ao get:', error);
    throw error;
  }
}

// Função para delete
async function del(key) {
  try {
    return await client.del(key);
  } catch (error) {
    console.error('Erro ao delete:', error);
    throw error;
  }
}

// Função para verificar se existe
async function exists(key) {
  try {
    return await client.exists(key);
  } catch (error) {
    console.error('Erro ao exists:', error);
    throw error;
  }
}

// Função para incrementar
async function incr(key) {
  try {
    return await client.incr(key);
  } catch (error) {
    console.error('Erro ao incr:', error);
    throw error;
  }
}

// Função para listar chaves
async function keys(pattern) {
  try {
    return await client.keys(pattern);
  } catch (error) {
    console.error('Erro ao keys:', error);
    throw error;
  }
}

// Função para publicar em canal
async function publish(channel, message) {
  try {
    return await client.publish(channel, JSON.stringify(message));
  } catch (error) {
    console.error('Erro ao publish:', error);
    throw error;
  }
}

// Função para subscrever canal
async function subscribe(channel, callback) {
  try {
    const subscriber = client.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(channel, callback);
    return subscriber;
  } catch (error) {
    console.error('Erro ao subscribe:', error);
    throw error;
  }
}

module.exports = {
  client,
  connect,
  disconnect,
  setex,
  get,
  del,
  exists,
  incr,
  keys,
  publish,
  subscribe
};