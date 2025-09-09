const db = require('../config/database');

class Platform {
  constructor(data) {
    this.id = data.id;
    this.code = data.code;
    this.name = data.name;
    this.description = data.description;
    this.status = data.status || 'active';
    this.price = data.price || 0;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.settings = data.settings || {};
    this.webhook_url = data.webhook_url;
    this.auto_forward = data.auto_forward || false;
  }

  // Criar plataforma
  static async create(platformData) {
    const {
      code,
      name,
      description,
      status = 'active',
      price = 0,
      settings = {},
      webhook_url = null,
      auto_forward = false
    } = platformData;

    const query = `
      INSERT INTO platforms (code, name, description, status, price, settings, webhook_url, auto_forward, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `;

    const values = [code, name, description, status, price, settings, webhook_url, auto_forward];
    const result = await db.query(query, values);
    return new Platform(result.rows[0]);
  }

  // Buscar por ID
  static async findById(id) {
    const query = 'SELECT * FROM platforms WHERE id = $1';
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new Platform(result.rows[0]);
  }

  // Buscar por código
  static async findByCode(code) {
    const query = 'SELECT * FROM platforms WHERE code = $1';
    const result = await db.query(query, [code]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new Platform(result.rows[0]);
  }

  // Listar todas as plataformas
  static async findAll(limit = 50, offset = 0) {
    const query = `
      SELECT * FROM platforms 
      ORDER BY name ASC 
      LIMIT $1 OFFSET $2
    `;
    
    const result = await db.query(query, [limit, offset]);
    return result.rows.map(row => new Platform(row));
  }

  // Buscar plataformas ativas
  static async findActive() {
    const query = 'SELECT * FROM platforms WHERE status = $1 ORDER BY name ASC';
    const result = await db.query(query, ['active']);
    return result.rows.map(row => new Platform(row));
  }

  // Buscar com filtros
  static async findWithFilters(filters = {}, limit = 50, offset = 0) {
    let query = 'SELECT * FROM platforms WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.search) {
      query += ` AND (name ILIKE $${paramCount} OR code ILIKE $${paramCount + 1} OR description ILIKE $${paramCount + 2})`;
      const searchTerm = `%${filters.search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
      paramCount += 3;
    }

    query += ` ORDER BY name ASC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const result = await db.query(query, values);
    return result.rows.map(row => new Platform(row));
  }

  // Contar plataformas
  static async count(filters = {}) {
    let query = 'SELECT COUNT(*) FROM platforms WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.search) {
      query += ` AND (name ILIKE $${paramCount} OR code ILIKE $${paramCount + 1} OR description ILIKE $${paramCount + 2})`;
      const searchTerm = `%${filters.search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
    }

    const result = await db.query(query, values);
    return parseInt(result.rows[0].count);
  }

  // Atualizar plataforma
  async update(updateData) {
    const allowedFields = ['name', 'description', 'status', 'price', 'settings', 'webhook_url', 'auto_forward'];
    const updates = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updates.length === 0) {
      return this;
    }

    updates.push(`updated_at = NOW()`);
    values.push(this.id);

    const query = `
      UPDATE platforms 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return new Platform(result.rows[0]);
  }

  // Ativar plataforma
  async activate() {
    return await this.update({ status: 'active' });
  }

  // Desativar plataforma
  async deactivate() {
    return await this.update({ status: 'inactive' });
  }

  // Atualizar preço
  async updatePrice(price) {
    return await this.update({ price });
  }

  // Atualizar configurações
  async updateSettings(settings) {
    return await this.update({ settings });
  }

  // Atualizar webhook
  async updateWebhook(webhookUrl) {
    return await this.update({ webhook_url: webhookUrl });
  }

  // Deletar plataforma
  async delete() {
    const query = 'DELETE FROM platforms WHERE id = $1';
    await db.query(query, [this.id]);
    return true;
  }

  // Estatísticas da plataforma
  async getStats(dateFrom = null, dateTo = null) {
    let query = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN status = 'received' THEN 1 END) as received,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM messages 
      WHERE platform = $1
    `;
    
    const values = [this.code];
    let paramCount = 2;

    if (dateFrom) {
      query += ` AND created_at >= $${paramCount}`;
      values.push(dateFrom);
      paramCount++;
    }

    if (dateTo) {
      query += ` AND created_at <= $${paramCount}`;
      values.push(dateTo);
      paramCount++;
    }

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Inicializar plataformas padrão
  static async initializeDefaultPlatforms() {
    const defaultPlatforms = [
      { code: 'wa', name: 'WhatsApp', description: 'Mensagens do WhatsApp', price: 0.50 },
      { code: 'tg', name: 'Telegram', description: 'Mensagens do Telegram', price: 0.30 },
      { code: 'ig', name: 'Instagram', description: 'Mensagens do Instagram', price: 0.40 },
      { code: 'fb', name: 'Facebook', description: 'Mensagens do Facebook', price: 0.35 },
      { code: 'tw', name: 'Twitter (X)', description: 'Mensagens do Twitter/X', price: 0.25 },
      { code: 'go', name: 'Google / Gmail', description: 'Mensagens do Google/Gmail', price: 0.20 },
      { code: 'tt', name: 'TikTok', description: 'Mensagens do TikTok', price: 0.45 },
      { code: 'kw', name: 'Kwai', description: 'Mensagens do Kwai', price: 0.35 },
      { code: 'ol', name: 'OLX', description: 'Mensagens do OLX', price: 0.30 },
      { code: 'if', name: 'iFood', description: 'Mensagens do iFood', price: 0.25 },
      { code: '99', name: '99 (App de Transporte)', description: 'Mensagens do 99', price: 0.30 },
      { code: 'ub', name: 'Uber', description: 'Mensagens do Uber', price: 0.30 },
      { code: 'pp', name: 'PicPay', description: 'Mensagens do PicPay', price: 0.40 },
      { code: 'me', name: 'Mercado Livre', description: 'Mensagens do Mercado Livre', price: 0.35 },
      { code: 'nu', name: 'Nubank', description: 'Mensagens do Nubank', price: 0.50 },
      { code: 'in', name: 'Banco Inter', description: 'Mensagens do Banco Inter', price: 0.45 },
      { code: 'ma', name: 'Magalu (Magazine Luiza)', description: 'Mensagens do Magalu', price: 0.30 },
      { code: 'ae', name: 'AliExpress', description: 'Mensagens do AliExpress', price: 0.25 },
      { code: 'am', name: 'Amazon', description: 'Mensagens do Amazon', price: 0.30 },
      { code: 'li', name: 'LinkedIn', description: 'Mensagens do LinkedIn', price: 0.40 }
    ];

    const results = [];
    
    for (const platformData of defaultPlatforms) {
      try {
        // Verificar se já existe
        const existing = await Platform.findByCode(platformData.code);
        if (!existing) {
          const platform = await Platform.create(platformData);
          results.push(platform);
        }
      } catch (error) {
        console.error(`Erro ao criar plataforma ${platformData.code}:`, error);
      }
    }

    return results;
  }

  // Converter para objeto público
  toPublic() {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      description: this.description,
      status: this.status,
      price: this.price,
      created_at: this.created_at,
      updated_at: this.updated_at,
      settings: this.settings,
      webhook_url: this.webhook_url,
      auto_forward: this.auto_forward
    };
  }
}

module.exports = Platform;