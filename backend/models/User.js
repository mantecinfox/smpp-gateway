const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  constructor(data) {
    this.id = data.id;
    this.email = data.email;
    this.password = data.password;
    this.name = data.name;
    this.role = data.role || 'client';
    this.status = data.status || 'active';
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.last_login = data.last_login;
    this.api_key = data.api_key;
  }

  // Criar usuário
  static async create(userData) {
    const { email, password, name, role = 'client' } = userData;
    
    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Gerar API key
    const apiKey = require('crypto').randomBytes(32).toString('hex');
    
    const query = `
      INSERT INTO users (email, password, name, role, api_key, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [email, hashedPassword, name, role, apiKey, 'active'];
    const result = await db.query(query, values);
    
    return new User(result.rows[0]);
  }

  // Buscar por ID
  static async findById(id) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new User(result.rows[0]);
  }

  // Buscar por email
  static async findByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await db.query(query, [email]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new User(result.rows[0]);
  }

  // Buscar por API key
  static async findByApiKey(apiKey) {
    const query = 'SELECT * FROM users WHERE api_key = $1';
    const result = await db.query(query, [apiKey]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return new User(result.rows[0]);
  }

  // Listar todos os usuários
  static async findAll(limit = 50, offset = 0, role = null) {
    let query = 'SELECT * FROM users';
    const values = [];
    
    if (role) {
      query += ' WHERE role = $1';
      values.push(role);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
    values.push(limit, offset);
    
    const result = await db.query(query, values);
    return result.rows.map(row => new User(row));
  }

  // Atualizar usuário
  async update(updateData) {
    const allowedFields = ['name', 'email', 'status', 'last_login'];
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
      UPDATE users 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return new User(result.rows[0]);
  }

  // Atualizar senha
  async updatePassword(newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    const query = `
      UPDATE users 
      SET password = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [hashedPassword, this.id]);
    return new User(result.rows[0]);
  }

  // Verificar senha
  async checkPassword(password) {
    return await bcrypt.compare(password, this.password);
  }

  // Deletar usuário
  async delete() {
    const query = 'DELETE FROM users WHERE id = $1';
    await db.query(query, [this.id]);
    return true;
  }

  // Contar usuários
  static async count(role = null) {
    let query = 'SELECT COUNT(*) FROM users';
    const values = [];
    
    if (role) {
      query += ' WHERE role = $1';
      values.push(role);
    }
    
    const result = await db.query(query, values);
    return parseInt(result.rows[0].count);
  }

  // Buscar usuários por status
  static async findByStatus(status) {
    const query = 'SELECT * FROM users WHERE status = $1 ORDER BY created_at DESC';
    const result = await db.query(query, [status]);
    return result.rows.map(row => new User(row));
  }

  // Atualizar último login
  async updateLastLogin() {
    const query = `
      UPDATE users 
      SET last_login = NOW()
      WHERE id = $1
    `;
    
    await db.query(query, [this.id]);
  }

  // Gerar nova API key
  async generateNewApiKey() {
    const apiKey = require('crypto').randomBytes(32).toString('hex');
    
    const query = `
      UPDATE users 
      SET api_key = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [apiKey, this.id]);
    return new User(result.rows[0]);
  }

  // Converter para objeto público (sem senha)
  toPublic() {
    const { password, ...publicData } = this;
    return publicData;
  }
}

module.exports = User;