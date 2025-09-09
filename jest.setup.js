// Configurações globais do Jest

// Configurar timezone
process.env.TZ = 'UTC';

// Configurar variáveis de ambiente para testes
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'smpp_admin_test';
process.env.DB_USER = 'smpp_user_test';
process.env.DB_PASSWORD = 'test_password';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.WEBHOOK_SECRET = 'test_webhook_secret';

// Configurar timeout para testes
jest.setTimeout(10000);

// Mock do console para testes
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Mock do Socket.IO
jest.mock('socket.io', () => ({
  Server: jest.fn(() => ({
    on: jest.fn(),
    emit: jest.fn(),
    close: jest.fn()
  }))
}));

// Mock do Redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    incr: jest.fn(),
    keys: jest.fn(),
    publish: jest.fn(),
    subscribe: jest.fn()
  }))
}));

// Mock do SMPP
jest.mock('smpp', () => ({
  connect: jest.fn(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn()
  }))
}));