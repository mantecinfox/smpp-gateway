const db = require('../config/database');

class Did {
  constructor(data) {
    this.id = data.id;
    this.number = data.number;
    this.user_id = data.user_id;
    this.status = data.status || 'available';
    this.platforms = data.platforms || [];
    this.price = data.price || 0;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.assigned_at = data.assigned_at;
    this.expires_at = data.expires_at;
    this.notes = data.notes;
  }

  // Criar DID
  static async create(didData) {
    const {
      number,
      user_id = null,
      status = 'available',
      platforms = [],
      price = 0,
      notes = null
    } = didData;

    const query = `
      INSERT INTO dids (number, user_id, status, platforms, price, notes, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;

    const values = [number, user_id, status, platforms, price, notes];
    const result = await db.query(query, values);
    return new Did(result.rows[0]);
  }

  // Criar múltiplos DIDs
  static async createMultiple(numbers, options = {}) {
    const {
      user_id = null,
      status = 'available',
      platforms = [],
      price = 0,
      notes = null
    } = options;

    const values = numbers.map((number, index) => 
      `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, $${index * 6 + 4}, $${index * 6 + 5}, $${index * 6 + 6}, NOW())`
    ).join(', ');

    const query = `
      INSERT INTO dids (number, user_id, status, platforms, price, notes, created_at)
      VALUES ${values}
      RETURNING *
    `;

    const flatValues = numbers.flatMap(number => [number, user_id, status, platforms, price, notes]);
    const result = await db.query(query, flatValues);
    return result.rows.map(row => new Did(row));
  }

  // Buscar por ID
  static async findById(id) {
    const query = 'SELECT * FROM dids WHERE id = $1';
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new Did(result.rows[0]);
  }

  // Buscar por número
  static async findByNumber(number) {
    const query = 'SELECT * FROM dids WHERE number = $1';
    const result = await db.query(query, [number]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new Did(result.rows[0]);
  }

  // Buscar por usuário
  static async findByUserId(userId) {
    const query = 'SELECT * FROM dids WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await db.query(query, [userId]);
    return result.rows.map(row => new Did(row));
  }

  // Buscar DIDs disponíveis
  static async findAvailable(limit = 50, offset = 0) {
    const query = `
      SELECT * FROM dids 
      WHERE status = 'available' 
      ORDER BY created_at ASC 
      LIMIT $1 OFFSET $2
    `;
    
    const result = await db.query(query, [limit, offset]);
    return result.rows.map(row => new Did(row));
  }

  // Buscar DIDs com filtros
  static async findWithFilters(filters = {}, limit = 50, offset = 0) {
    let query = 'SELECT * FROM dids WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.user_id) {
      query += ` AND user_id = $${paramCount}`;
      values.push(filters.user_id);
      paramCount++;
    }

    if (filters.platform) {
      query += ` AND platforms @> $${paramCount}`;
      values.push(JSON.stringify([filters.platform]));
      paramCount++;
    }

    if (filters.search) {
      query += ` AND number ILIKE $${paramCount}`;
      values.push(`%${filters.search}%`);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const result = await db.query(query, values);
    return result.rows.map(row => new Did(row));
  }

  // Contar DIDs com filtros
  static async countWithFilters(filters = {}) {
    let query = 'SELECT COUNT(*) FROM dids WHERE 1=1';
    const values = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.user_id) {
      query += ` AND user_id = $${paramCount}`;
      values.push(filters.user_id);
      paramCount++;
    }

    if (filters.platform) {
      query += ` AND platforms @> $${paramCount}`;
      values.push(JSON.stringify([filters.platform]));
      paramCount++;
    }

    if (filters.search) {
      query += ` AND number ILIKE $${paramCount}`;
      values.push(`%${filters.search}%`);
    }

    const result = await db.query(query, values);
    return parseInt(result.rows[0].count);
  }

  // Atribuir DID a usuário
  async assignToUser(userId, platforms = [], expiresAt = null) {
    const query = `
      UPDATE dids 
      SET 
        user_id = $1,
        status = 'assigned',
        platforms = $2,
        assigned_at = NOW(),
        expires_at = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;

    const result = await db.query(query, [userId, platforms, expiresAt, this.id]);
    return new Did(result.rows[0]);
  }

  // Liberar DID
  async release() {
    const query = `
      UPDATE dids 
      SET 
        user_id = NULL,
        status = 'available',
        platforms = '[]',
        assigned_at = NULL,
        expires_at = NULL,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [this.id]);
    return new Did(result.rows[0]);
  }

  // Atualizar plataformas
  async updatePlatforms(platforms) {
    const query = `
      UPDATE dids 
      SET platforms = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.query(query, [platforms, this.id]);
    return new Did(result.rows[0]);
  }

  // Atualizar status
  async updateStatus(status) {
    const query = `
      UPDATE dids 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await db.query(query, [status, this.id]);
    return new Did(result.rows[0]);
  }

  // Atualizar DID
  async update(updateData) {
    const allowedFields = ['status', 'platforms', 'price', 'notes', 'expires_at'];
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
      UPDATE dids 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return new Did(result.rows[0]);
  }

  // Deletar DID
  async delete() {
    const query = 'DELETE FROM dids WHERE id = $1';
    await db.query(query, [this.id]);
    return true;
  }

  // Estatísticas de DIDs
  static async getStats() {
    const query = `
      SELECT 
        status,
        COUNT(*) as total,
        COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as assigned,
        COUNT(CASE WHEN user_id IS NULL THEN 1 END) as available
      FROM dids
      GROUP BY status
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  // DIDs expirados
  static async findExpired() {
    const query = `
      SELECT * FROM dids 
      WHERE expires_at IS NOT NULL 
      AND expires_at < NOW() 
      AND status = 'assigned'
    `;
    
    const result = await db.query(query);
    return result.rows.map(row => new Did(row));
  }

  // DIDs por plataforma
  static async findByPlatform(platform) {
    const query = `
      SELECT * FROM dids 
      WHERE platforms @> $1
      ORDER BY created_at DESC
    `;
    
    const result = await db.query(query, [JSON.stringify([platform])]);
    return result.rows.map(row => new Did(row));
  }

  // Converter para objeto público
  toPublic() {
    return {
      id: this.id,
      number: this.number,
      user_id: this.user_id,
      status: this.status,
      platforms: this.platforms,
      price: this.price,
      created_at: this.created_at,
      updated_at: this.updated_at,
      assigned_at: this.assigned_at,
      expires_at: this.expires_at,
      notes: this.notes
    };
  }
}

module.exports = Did;