const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Message = require('../models/Message');
const Did = require('../models/Did');
const Platform = require('../models/Platform');

const router = express.Router();

// Dashboard - Estatísticas gerais
router.get('/dashboard', async (req, res) => {
  try {
    const [
      totalUsers,
      totalMessages,
      totalDids,
      totalPlatforms,
      recentMessages,
      statsByPlatform,
      statsByDid
    ] = await Promise.all([
      User.count(),
      Message.countWithFilters({}),
      Did.countWithFilters({}),
      Platform.count({}),
      Message.getRecent(10),
      Message.getStatsByPlatform(),
      Message.getStatsByDid()
    ]);

    // Estatísticas de usuários
    const usersByRole = await Promise.all([
      User.count('admin'),
      User.count('client')
    ]);

    // Estatísticas de DIDs
    const didStats = await Did.getStats();

    // Estatísticas de mensagens por status
    const messagesByStatus = await Promise.all([
      Message.countWithFilters({ status: 'received' }),
      Message.countWithFilters({ status: 'processed' }),
      Message.countWithFilters({ status: 'failed' })
    ]);

    res.json({
      overview: {
        totalUsers,
        totalMessages,
        totalDids,
        totalPlatforms
      },
      users: {
        total: totalUsers,
        admins: usersByRole[0],
        clients: usersByRole[1]
      },
      messages: {
        total: totalMessages,
        received: messagesByStatus[0],
        processed: messagesByStatus[1],
        failed: messagesByStatus[2],
        recent: recentMessages.map(msg => msg.toPublic())
      },
      dids: {
        stats: didStats
      },
      platforms: {
        stats: statsByPlatform
      },
      dids_stats: statsByDid
    });

  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Gerenciar usuários
router.get('/users', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('role').optional().isIn(['admin', 'client']),
  query('status').optional().isIn(['active', 'inactive']),
  query('search').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const role = req.query.role;
    const status = req.query.status;

    const [users, total] = await Promise.all([
      User.findAll(limit, offset, role),
      User.count(role)
    ]);

    res.json({
      users: users.map(user => user.toPublic()),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Obter usuário específico
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      user: user.toPublic()
    });

  } catch (error) {
    console.error('Erro ao obter usuário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Atualizar usuário
router.put('/users/:id', [
  body('name').optional().trim().isLength({ min: 2 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'client']),
  body('status').optional().isIn(['active', 'inactive'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    const { name, email, role, status } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (email) {
      const existingUser = await User.findByEmail(email);
      if (existingUser && existingUser.id !== user.id) {
        return res.status(409).json({
          error: 'Email já está em uso',
          code: 'EMAIL_EXISTS'
        });
      }
      updateData.email = email;
    }
    if (role) updateData.role = role;
    if (status) updateData.status = status;

    const updatedUser = await user.update(updateData);

    res.json({
      message: 'Usuário atualizado com sucesso',
      user: updatedUser.toPublic()
    });

  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Deletar usuário
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    // Não permitir deletar a si mesmo
    if (user.id === req.user.id) {
      return res.status(400).json({
        error: 'Não é possível deletar seu próprio usuário',
        code: 'CANNOT_DELETE_SELF'
      });
    }

    await user.delete();

    res.json({
      message: 'Usuário deletado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao deletar usuário:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Gerenciar mensagens
router.get('/messages', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('platform').optional().trim(),
  query('status').optional().isIn(['received', 'processed', 'failed']),
  query('date_from').optional().isISO8601(),
  query('date_to').optional().isISO8601(),
  query('search').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const filters = {
      platform: req.query.platform,
      status: req.query.status,
      date_from: req.query.date_from,
      date_to: req.query.date_to,
      search: req.query.search
    };

    const [messages, total] = await Promise.all([
      Message.findWithFilters(filters, limit, offset),
      Message.countWithFilters(filters)
    ]);

    res.json({
      messages: messages.map(msg => msg.toPublic()),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erro ao listar mensagens:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Gerenciar DIDs
router.get('/dids', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['available', 'assigned', 'inactive']),
  query('platform').optional().trim(),
  query('search').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const filters = {
      status: req.query.status,
      platform: req.query.platform,
      search: req.query.search
    };

    const [dids, total] = await Promise.all([
      Did.findWithFilters(filters, limit, offset),
      Did.countWithFilters(filters)
    ]);

    res.json({
      dids: dids.map(did => did.toPublic()),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erro ao listar DIDs:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Gerenciar plataformas
router.get('/platforms', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['active', 'inactive']),
  query('search').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const filters = {
      status: req.query.status,
      search: req.query.search
    };

    const [platforms, total] = await Promise.all([
      Platform.findWithFilters(filters, limit, offset),
      Platform.count(filters)
    ]);

    res.json({
      platforms: platforms.map(platform => platform.toPublic()),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erro ao listar plataformas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Inicializar plataformas padrão
router.post('/platforms/initialize', async (req, res) => {
  try {
    const platforms = await Platform.initializeDefaultPlatforms();

    res.json({
      message: 'Plataformas inicializadas com sucesso',
      platforms: platforms.map(p => p.toPublic())
    });

  } catch (error) {
    console.error('Erro ao inicializar plataformas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Estatísticas em tempo real
router.get('/stats/realtime', async (req, res) => {
  try {
    const [
      messagesLastHour,
      messagesLastDay,
      activeUsers,
      activeDids
    ] = await Promise.all([
      Message.countWithFilters({
        date_from: new Date(Date.now() - 60 * 60 * 1000).toISOString()
      }),
      Message.countWithFilters({
        date_from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      }),
      User.count('client'),
      Did.countWithFilters({ status: 'assigned' })
    ]);

    res.json({
      messages: {
        last_hour: messagesLastHour,
        last_day: messagesLastDay
      },
      users: {
        active: activeUsers
      },
      dids: {
        active: activeDids
      }
    });

  } catch (error) {
    console.error('Erro nas estatísticas em tempo real:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;