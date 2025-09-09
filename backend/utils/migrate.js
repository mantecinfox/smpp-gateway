const db = require('../config/database');

async function createTables() {
  try {
    console.log('Criando tabelas do banco de dados...');

    // Tabela de usuários
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'client',
        status VARCHAR(50) DEFAULT 'active',
        api_key VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      )
    `);

    // Tabela de plataformas
    await db.query(`
      CREATE TABLE IF NOT EXISTS platforms (
        id SERIAL PRIMARY KEY,
        code VARCHAR(10) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'active',
        price DECIMAL(10,2) DEFAULT 0,
        settings JSONB DEFAULT '{}',
        webhook_url VARCHAR(500),
        auto_forward BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabela de DIDs
    await db.query(`
      CREATE TABLE IF NOT EXISTS dids (
        id SERIAL PRIMARY KEY,
        number VARCHAR(20) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(50) DEFAULT 'available',
        platforms JSONB DEFAULT '[]',
        price DECIMAL(10,2) DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        assigned_at TIMESTAMP,
        expires_at TIMESTAMP
      )
    `);

    // Tabela de mensagens
    await db.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        did VARCHAR(20) NOT NULL,
        sender VARCHAR(20),
        receiver VARCHAR(20),
        message TEXT NOT NULL,
        platform VARCHAR(10) NOT NULL,
        status VARCHAR(50) DEFAULT 'received',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        smpp_id VARCHAR(50),
        webhook_sent BOOLEAN DEFAULT false,
        webhook_url VARCHAR(500),
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP
      )
    `);

    // Tabela de logs do sistema
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id SERIAL PRIMARY KEY,
        level VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        context JSONB DEFAULT '{}',
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabela de configurações do sistema
    await db.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Tabelas criadas com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao criar tabelas:', error);
    throw error;
  }
}

async function createIndexes() {
  try {
    console.log('Criando índices...');

    // Índices para usuários
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key)');

    // Índices para plataformas
    await db.query('CREATE INDEX IF NOT EXISTS idx_platforms_code ON platforms(code)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_platforms_status ON platforms(status)');

    // Índices para DIDs
    await db.query('CREATE INDEX IF NOT EXISTS idx_dids_number ON dids(number)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_dids_user_id ON dids(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_dids_status ON dids(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_dids_platforms ON dids USING GIN(platforms)');

    // Índices para mensagens
    await db.query('CREATE INDEX IF NOT EXISTS idx_messages_did ON messages(did)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_messages_platform ON messages(platform)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_messages_smpp_id ON messages(smpp_id)');

    // Índices para logs
    await db.query('CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_system_logs_user_id ON system_logs(user_id)');

    console.log('✅ Índices criados com sucesso!');

  } catch (error) {
    console.error('❌ Erro ao criar índices:', error);
    throw error;
  }
}

async function insertDefaultData() {
  try {
    console.log('Inserindo dados padrão...');

    // Verificar se já existe admin
    const adminExists = await db.query('SELECT id FROM users WHERE role = $1', ['admin']);
    
    if (adminExists.rows.length === 0) {
      // Criar usuário admin padrão
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 12);
      const apiKey = require('crypto').randomBytes(32).toString('hex');

      await db.query(`
        INSERT INTO users (email, password, name, role, api_key, status)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, ['admin@smpp.com', hashedPassword, 'Administrador', 'admin', apiKey, 'active']);

      console.log('✅ Usuário admin criado: admin@smpp.com / admin123');
    }

    // Inserir plataformas padrão
    const Platform = require('../models/Platform');
    await Platform.initializeDefaultPlatforms();
    console.log('✅ Plataformas padrão inseridas');

    // Inserir configurações padrão do sistema
    const defaultSettings = [
      { key: 'system_name', value: 'SMPP Admin', description: 'Nome do sistema' },
      { key: 'system_version', value: '1.0.0', description: 'Versão do sistema' },
      { key: 'max_dids_per_user', value: '10', description: 'Máximo de DIDs por usuário' },
      { key: 'message_retention_days', value: '30', description: 'Dias de retenção de mensagens' },
      { key: 'webhook_timeout', value: '10000', description: 'Timeout do webhook em ms' },
      { key: 'max_webhook_retries', value: '3', description: 'Máximo de tentativas de webhook' }
    ];

    for (const setting of defaultSettings) {
      await db.query(`
        INSERT INTO system_settings (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO NOTHING
      `, [setting.key, setting.value, setting.description]);
    }

    console.log('✅ Configurações padrão inseridas');

  } catch (error) {
    console.error('❌ Erro ao inserir dados padrão:', error);
    throw error;
  }
}

async function createSampleDids() {
  try {
    console.log('Criando DIDs de exemplo...');

    // Gerar 500 DIDs de exemplo
    const dids = [];
    for (let i = 1; i <= 500; i++) {
      const number = `5511999${String(i).padStart(4, '0')}`;
      dids.push(number);
    }

    const Did = require('../models/Did');
    await Did.createMultiple(dids, {
      status: 'available',
      platforms: [],
      price: 0.50,
      notes: 'DID de exemplo gerado automaticamente'
    });

    console.log('✅ 500 DIDs de exemplo criados');

  } catch (error) {
    console.error('❌ Erro ao criar DIDs de exemplo:', error);
    throw error;
  }
}

async function runMigration() {
  try {
    console.log('🚀 Iniciando migração do banco de dados...');

    await createTables();
    await createIndexes();
    await insertDefaultData();
    await createSampleDids();

    console.log('✅ Migração concluída com sucesso!');
    console.log('');
    console.log('📋 Resumo:');
    console.log('- Tabelas criadas');
    console.log('- Índices criados');
    console.log('- Dados padrão inseridos');
    console.log('- 500 DIDs de exemplo criados');
    console.log('');
    console.log('🔑 Credenciais padrão:');
    console.log('- Admin: admin@smpp.com / admin123');
    console.log('- API Key: (gerada automaticamente)');

  } catch (error) {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Executar migração se chamado diretamente
if (require.main === module) {
  runMigration();
}

module.exports = {
  createTables,
  createIndexes,
  insertDefaultData,
  createSampleDids,
  runMigration
};