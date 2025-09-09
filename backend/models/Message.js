const db = require('../config/database');

class Message {
  constructor(data) {
    this.id = data.id;
    this.did = data.did;
    this.sender = data.sender;
    this.receiver = data.receiver;
    this.message = data.message;
    this.platform = data.platform;
    this.status = data.status || 'received';
    this.user_id = data.user_id;
    this.smpp_id = data.smpp_id;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.processed_at = data.processed_at;
    this.webhook_sent = data.webhook_sent || false;
    this.webhook_url = data.webhook_url;
    this.raw_data = data.raw_data;
  }

  // Criar mensagem
  static async create(messageData) {
    const {
      did,
      sender,
      receiver,
      message,
      platform,
      user_id,
      smpp_id,
      webhook_url,
      raw_data
    } = messageData;

    const query = `
      INSERT INTO messages (
        did, sender, receiver, message, platform, user_id, 
        smpp_id, webhook_url, raw_data, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      RETURNING *
    `;

    const values = [
      did, sender, receiver, message, platform, user_id,
      smpp_id, webhook_url, raw_data, 'received'
    ];

    const result = await db.query(query, values);
    return new Message(result.rows[0]);
  }

  // Buscar por ID
  static async findById(id) {
    const query = 'SELECT * FROM messages WHERE id = $1';
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new Message(result.rows[0]);
  }

  // Buscar por DID
  static async findByDid(did, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM messages 
      WHERE did = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [did, limit, offset]);
    return result.rows.map(row => new Message(row));
  }

  // Buscar por usuário
  static async findByUserId(userId, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM messages 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [userId, limit, offset]);
    return result.rows.map(row => new Message(row));
  }

  // Buscar por plataforma
  static async findByPlatform(platform, limit = 50, offset = 0) {
    const query = `
      SELECT * FROM messages 
      WHERE platform = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `;
    
    const result = await db.query(query, [platform, limit, offset]);
    return result.rows.map(row => new Message(row));
  }

  // Buscar mensagens com filtros
  static async findWithFilters(filters = {}, limit = 50, offset = 0) {
    let query = 'SELECT * FROM messages WHERE 1=1';
    const values = [];
    let paramCount = 1;

    // Filtros
    if (filters.did) {
      query += ` AND did = $${paramCount}`;
      values.push(filters.did);
      paramCount++;
    }

    if (filters.user_id) {
      query += ` AND user_id = $${paramCount}`;
      values.push(filters.user_id);
      paramCount++;
    }

    if (filters.platform) {
      query += ` AND platform = $${paramCount}`;
      values.push(filters.platform);
      paramCount++;
    }

    if (filters.status) {
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.date_from) {
      query += ` AND created_at >= $${paramCount}`;
      values.push(filters.date_from);
      paramCount++;
    }

    if (filters.date_to) {
      query += ` AND created_at <= $${paramCount}`;
      values.push(filters.date_to);
      paramCount++;
    }

    if (filters.search) {
      query += ` AND (message ILIKE $${paramCount} OR sender ILIKE $${paramCount + 1} OR receiver ILIKE $${paramCount + 2})`;
      const searchTerm = `%${filters.search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
      paramCount += 3;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const result = await db.query(query, values);
    return result.rows.map(row => new Message(row));
  }

  // Contar mensagens com filtros
  static async countWithFilters(filters = {}) {
    let query = 'SELECT COUNT(*) FROM messages WHERE 1=1';
    const values = [];
    let paramCount = 1;

    // Aplicar os mesmos filtros
    if (filters.did) {
      query += ` AND did = $${paramCount}`;
      values.push(filters.did);
      paramCount++;
    }

    if (filters.user_id) {
      query += ` AND user_id = $${paramCount}`;
      values.push(filters.user_id);
      paramCount++;
    }

    if (filters.platform) {
      query += ` AND platform = $${paramCount}`;
      values.push(filters.platform);
      paramCount++;
    }

    if (filters.status) {
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.date_from) {
      query += ` AND created_at >= $${paramCount}`;
      values.push(filters.date_from);
      paramCount++;
    }

    if (filters.date_to) {
      query += ` AND created_at <= $${paramCount}`;
      values.push(filters.date_to);
      paramCount++;
    }

    if (filters.search) {
      query += ` AND (message ILIKE $${paramCount} OR sender ILIKE $${paramCount + 1} OR receiver ILIKE $${paramCount + 2})`;
      const searchTerm = `%${filters.search}%`;
      values.push(searchTerm, searchTerm, searchTerm);
    }

    const result = await db.query(query, values);
    return parseInt(result.rows[0].count);
  }

  // Atualizar mensagem
  async update(updateData) {
    const allowedFields = ['status', 'processed_at', 'webhook_sent', 'webhook_url'];
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
      UPDATE messages 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return new Message(result.rows[0]);
  }

  // Marcar como processada
  async markAsProcessed() {
    return await this.update({
      status: 'processed',
      processed_at: new Date()
    });
  }

  // Marcar webhook como enviado
  async markWebhookSent() {
    return await this.update({
      webhook_sent: true
    });
  }

  // Deletar mensagem
  async delete() {
    const query = 'DELETE FROM messages WHERE id = $1';
    await db.query(query, [this.id]);
    return true;
  }

  // Estatísticas por plataforma
  static async getStatsByPlatform(dateFrom = null, dateTo = null) {
    let query = `
      SELECT 
        platform,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'received' THEN 1 END) as received,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM messages
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;

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

    query += ' GROUP BY platform ORDER BY total DESC';

    const result = await db.query(query, values);
    return result.rows;
  }

  // Estatísticas por DID
  static async getStatsByDid(dateFrom = null, dateTo = null) {
    let query = `
      SELECT 
        did,
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'received' THEN 1 END) as received,
        COUNT(CASE WHEN status = 'processed' THEN 1 END) as processed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM messages
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;

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

    query += ' GROUP BY did ORDER BY total DESC';

    const result = await db.query(query, values);
    return result.rows;
  }

  // Mensagens recentes
  static async getRecent(limit = 10) {
    const query = `
      SELECT m.*, u.name as user_name, u.email as user_email
      FROM messages m
      LEFT JOIN users u ON m.user_id = u.id
      ORDER BY m.created_at DESC
      LIMIT $1
    `;
    
    const result = await db.query(query, [limit]);
    return result.rows.map(row => new Message(row));
  }

  // Converter para objeto público
  toPublic() {
    return {
      id: this.id,
      did: this.did,
      sender: this.sender,
      receiver: this.receiver,
      message: this.message,
      platform: this.platform,
      status: this.status,
      user_id: this.user_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
      processed_at: this.processed_at,
      webhook_sent: this.webhook_sent
    };
  }
}

module.exports = Message;