const dotenv = require('dotenv');

dotenv.config();

const smppConfig = {
  host: process.env.SMPP_HOST || '198.54.166.74',
  port: parseInt(process.env.SMPP_PORT) || 2875,
  systemId: process.env.SMPP_SYSTEM_ID || 'WhatsInfo_otp',
  password: process.env.SMPP_PASSWORD || 'juebkiur',
  systemType: process.env.SMPP_SYSTEM_TYPE || '',
  ton: parseInt(process.env.SMPP_TON) || 1,
  npi: parseInt(process.env.SMPP_NPI) || 1,
  addressRange: process.env.SMPP_ADDRESS_RANGE || '',
  bindMode: process.env.SMPP_BIND_MODE || 'transceiver',
  enableConnector: process.env.SMPP_ENABLE_CONNECTOR === '1',
  
  // Configurações de reconexão
  reconnectInterval: 5000, // 5 segundos
  maxReconnectAttempts: 10,
  
  // Configurações de timeout
  connectTimeout: 10000, // 10 segundos
  requestTimeout: 30000, // 30 segundos
  
  // Configurações de rate limiting
  maxMessagesPerSecond: 100,
  maxConcurrentRequests: 50,
  
  // Configurações de logs
  logLevel: 'info', // debug, info, warn, error
  logMessages: true,
  
  // Configurações de retry
  maxRetries: 3,
  retryDelay: 1000, // 1 segundo
};

// Validação da configuração
function validateConfig() {
  const required = ['host', 'port', 'systemId', 'password'];
  const missing = required.filter(key => !smppConfig[key]);
  
  if (missing.length > 0) {
    throw new Error(`Configurações SMPP obrigatórias ausentes: ${missing.join(', ')}`);
  }
  
  if (smppConfig.port < 1 || smppConfig.port > 65535) {
    throw new Error('Porta SMPP inválida');
  }
  
  if (smppConfig.ton < 0 || smppConfig.ton > 7) {
    throw new Error('TON inválido (deve ser 0-7)');
  }
  
  if (smppConfig.npi < 0 || smppConfig.npi > 15) {
    throw new Error('NPI inválido (deve ser 0-15)');
  }
}

// Validar configuração na inicialização
try {
  validateConfig();
  console.log('✅ Configuração SMPP válida');
} catch (error) {
  console.error('❌ Erro na configuração SMPP:', error.message);
  process.exit(1);
}

module.exports = smppConfig;