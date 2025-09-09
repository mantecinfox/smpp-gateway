import api from './api';

export const authService = {
  // Login
  async login(email, password) {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  // Registrar
  async register(userData) {
    const response = await api.post('/auth/register', userData);
    return response.data;
  },

  // Obter perfil
  async getProfile() {
    const response = await api.get('/auth/profile');
    return response.data.user;
  },

  // Atualizar perfil
  async updateProfile(profileData) {
    const response = await api.put('/auth/profile', profileData);
    return response.data.user;
  },

  // Alterar senha
  async changePassword(currentPassword, newPassword) {
    const response = await api.put('/auth/change-password', {
      currentPassword,
      newPassword
    });
    return response.data;
  },

  // Gerar API key
  async generateApiKey() {
    const response = await api.post('/auth/generate-api-key');
    return response.data;
  },

  // Logout
  async logout() {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  // Verificar token
  async verifyToken() {
    const response = await api.get('/auth/verify');
    return response.data;
  }
};