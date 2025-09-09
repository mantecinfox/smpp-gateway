const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Validações
const registerValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('name').trim().isLength({ min: 2 })
];

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
];

// Registrar usuário
router.post('/register', registerValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { email, password, name, role = 'client' } = req.body;

    // Verificar se usuário já existe
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'Usuário já existe',
        code: 'USER_EXISTS'
      });
    }

    // Criar usuário
    const user = await User.create({
      email,
      password,
      name,
      role
    });

    // Gerar token
    const token = generateToken(user);

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: user.toPublic(),
      token
    });

  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Login
router.post('/login', loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Buscar usuário
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: 'Credenciais inválidas',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verificar senha
    const isValidPassword = await user.checkPassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Credenciais inválidas',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Verificar se usuário está ativo
    if (user.status !== 'active') {
      return res.status(401).json({
        error: 'Usuário inativo',
        code: 'USER_INACTIVE'
      });
    }

    // Atualizar último login
    await user.updateLastLogin();

    // Gerar token
    const token = generateToken(user);

    res.json({
      message: 'Login realizado com sucesso',
      user: user.toPublic(),
      token
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Obter perfil do usuário
router.get('/profile', requireAuth, async (req, res) => {
  try {
    res.json({
      user: req.user.toPublic()
    });
  } catch (error) {
    console.error('Erro ao obter perfil:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Atualizar perfil
router.put('/profile', requireAuth, [
  body('name').optional().trim().isLength({ min: 2 }),
  body('email').optional().isEmail().normalizeEmail()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { name, email } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (email) {
      // Verificar se email já existe
      const existingUser = await User.findByEmail(email);
      if (existingUser && existingUser.id !== req.user.id) {
        return res.status(409).json({
          error: 'Email já está em uso',
          code: 'EMAIL_EXISTS'
        });
      }
      updateData.email = email;
    }

    const updatedUser = await req.user.update(updateData);

    res.json({
      message: 'Perfil atualizado com sucesso',
      user: updatedUser.toPublic()
    });

  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Alterar senha
router.put('/change-password', requireAuth, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Verificar senha atual
    const isValidPassword = await req.user.checkPassword(currentPassword);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Senha atual incorreta',
        code: 'INVALID_CURRENT_PASSWORD'
      });
    }

    // Atualizar senha
    await req.user.updatePassword(newPassword);

    res.json({
      message: 'Senha alterada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Gerar nova API key
router.post('/generate-api-key', requireAuth, async (req, res) => {
  try {
    const updatedUser = await req.user.generateNewApiKey();

    res.json({
      message: 'Nova API key gerada com sucesso',
      api_key: updatedUser.api_key
    });

  } catch (error) {
    console.error('Erro ao gerar API key:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Logout (invalidar token)
router.post('/logout', requireAuth, async (req, res) => {
  try {
    // Em uma implementação mais robusta, você manteria uma blacklist de tokens
    // Por enquanto, apenas retornamos sucesso
    res.json({
      message: 'Logout realizado com sucesso'
    });
  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Verificar token
router.get('/verify', requireAuth, async (req, res) => {
  try {
    res.json({
      valid: true,
      user: req.user.toPublic()
    });
  } catch (error) {
    res.status(401).json({
      valid: false,
      error: 'Token inválido'
    });
  }
});

module.exports = router;