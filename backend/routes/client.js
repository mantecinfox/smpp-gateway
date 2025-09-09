const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Message = require('../models/Message');
const Did = require('../models/Did');
const Platform = require('../models/Platform');

const router = express.Router();

// Dashboard do cliente
router.get('/dashboard', async (req, res) => {
  try {
    const userId = req.user.id;

    const [
      totalMessages,
      totalDids,
      messagesByStatus,
      messagesByPlatform,
      recentMessages,
      userDids
    ] = await Promise.all([
      Message.countWithFilters({ user_id: userId }),
      Did.countWithFilters({ user_id: userId }),
      Promise.all([
        Message.countWithFilters({ user_id: userId, status: 'received' }),
        Message.countWithFilters({ user_id: userId, status: 'processed' }),
        Message.countWithFilters({ user_id: userId, status: 'failed' })
      ]),
      Message.getStatsByPlatform(null, null, userId),
      Message.getRecent(10, userId),
      Did.findByUserId(userId)
    ]);

    res.json({
      overview: {
        totalMessages,
        totalDids,
        activeDids: userDids.filter(did => did.status === 'assigned').length
      },
      messages: {
        total: totalMessages,
        received: messagesByStatus[0],
        processed: messagesByStatus[1],
        failed: messagesByStatus[2],
        recent: recentMessages.map(msg => msg.toPublic())
      },
      dids: {
        total: totalDids,
        assigned: userDids.filter(did => did.status === 'assigned').length,
        available: userDids.filter(did => did.status === 'available').length
      },
      platforms: messagesByPlatform
    });

  } catch (error) {
    console.error('Erro no dashboard do cliente:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Obter perfil do cliente
router.get('/profile', async (req, res) => {
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

// Atualizar perfil do cliente
router.put('/profile', [
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

// Listar DIDs do cliente
router.get('/dids', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['available', 'assigned', 'inactive']),
  query('platform').optional().trim()
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
      user_id: req.user.id,
      status: req.query.status,
      platform: req.query.platform
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
    console.error('Erro ao listar DIDs do cliente:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Listar mensagens do cliente
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
      user_id: req.user.id,
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
    console.error('Erro ao listar mensagens do cliente:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Listar plataformas disponíveis
router.get('/platforms', async (req, res) => {
  try {
    const platforms = await Platform.findActive();

    res.json({
      platforms: platforms.map(platform => platform.toPublic())
    });

  } catch (error) {
    console.error('Erro ao listar plataformas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Estatísticas do cliente
router.get('/stats', [
  query('date_from').optional().isISO8601(),
  query('date_to').optional().isISO8601()
], async (req, res) => {
  try {
    const userId = req.user.id;
    const dateFrom = req.query.date_from;
    const dateTo = req.query.date_to;

    const [
      totalMessages,
      messagesByStatus,
      messagesByPlatform,
      messagesByDid
    ] = await Promise.all([
      Message.countWithFilters({ user_id: userId, date_from: dateFrom, date_to: dateTo }),
      Promise.all([
        Message.countWithFilters({ user_id: userId, status: 'received', date_from: dateFrom, date_to: dateTo }),
        Message.countWithFilters({ user_id: userId, status: 'processed', date_from: dateFrom, date_to: dateTo }),
        Message.countWithFilters({ user_id: userId, status: 'failed', date_from: dateFrom, date_to: dateTo })
      ]),
      Message.getStatsByPlatform(dateFrom, dateTo, userId),
      Message.getStatsByDid(dateFrom, dateTo, userId)
    ]);

    res.json({
      messages: {
        total: totalMessages,
        by_status: {
          received: messagesByStatus[0],
          processed: messagesByStatus[1],
          failed: messagesByStatus[2]
        },
        by_platform: messagesByPlatform,
        by_did: messagesByDid
      }
    });

  } catch (error) {
    console.error('Erro nas estatísticas do cliente:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Atualizar plataformas do DID
router.put('/dids/:id/platforms', [
  body('platforms').isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const did = await Did.findById(req.params.id);
    if (!did) {
      return res.status(404).json({
        error: 'DID não encontrado',
        code: 'DID_NOT_FOUND'
      });
    }

    // Verificar se o DID pertence ao usuário
    if (did.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Acesso negado',
        code: 'ACCESS_DENIED'
      });
    }

    const { platforms } = req.body;
    const updatedDid = await did.updatePlatforms(platforms);

    res.json({
      message: 'Plataformas atualizadas com sucesso',
      did: updatedDid.toPublic()
    });

  } catch (error) {
    console.error('Erro ao atualizar plataformas do DID:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Obter mensagem específica
router.get('/messages/:id', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        error: 'Mensagem não encontrada',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    // Verificar se a mensagem pertence ao usuário
    if (message.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Acesso negado',
        code: 'ACCESS_DENIED'
      });
    }

    res.json({
      message: message.toPublic()
    });

  } catch (error) {
    console.error('Erro ao obter mensagem:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Marcar mensagem como processada
router.put('/messages/:id/process', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        error: 'Mensagem não encontrada',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    // Verificar se a mensagem pertence ao usuário
    if (message.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Acesso negado',
        code: 'ACCESS_DENIED'
      });
    }

    const updatedMessage = await message.markAsProcessed();

    res.json({
      message: 'Mensagem marcada como processada',
      message: updatedMessage.toPublic()
    });

  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Deletar mensagem
router.delete('/messages/:id', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        error: 'Mensagem não encontrada',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    // Verificar se a mensagem pertence ao usuário
    if (message.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Acesso negado',
        code: 'ACCESS_DENIED'
      });
    }

    await message.delete();

    res.json({
      message: 'Mensagem deletada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao deletar mensagem:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;