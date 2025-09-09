import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/authService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      const userData = await authService.getProfile();
      setUser(userData);
    } catch (error) {
      console.error('Erro ao verificar autenticação:', error);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authService.login(email, password);
      const { user: userData, token } = response;
      
      localStorage.setItem('token', token);
      setUser(userData);
      
      return { success: true, user: userData };
    } catch (error) {
      console.error('Erro no login:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || 'Erro ao fazer login' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const updateProfile = async (profileData) => {
    try {
      const updatedUser = await authService.updateProfile(profileData);
      setUser(updatedUser);
      return { success: true, user: updatedUser };
    } catch (error) {
      console.error('Erro ao atualizar perfil:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || 'Erro ao atualizar perfil' 
      };
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      await authService.changePassword(currentPassword, newPassword);
      return { success: true };
    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || 'Erro ao alterar senha' 
      };
    }
  };

  const generateApiKey = async () => {
    try {
      const response = await authService.generateApiKey();
      return { success: true, apiKey: response.api_key };
    } catch (error) {
      console.error('Erro ao gerar API key:', error);
      return { 
        success: false, 
        error: error.response?.data?.error || 'Erro ao gerar API key' 
      };
    }
  };

  const value = {
    user,
    loading,
    login,
    logout,
    updateProfile,
    changePassword,
    generateApiKey,
    isAdmin: user?.role === 'admin',
    isClient: user?.role === 'client'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};