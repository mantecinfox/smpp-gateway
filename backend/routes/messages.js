const express = require('express');
const { query, validationResult } = require('express-validator');
const Message = require('../models/Message');
const { requireOwnership } = require('../middleware/auth');

const router = express.Router();

// Listar mensagens do usuário
router.get('/', [
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
    console.error('Erro ao listar mensagens:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Obter mensagem específica
router.get('/:id', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        error: 'Mensagem não encontrada',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    // Verificar se a mensagem pertence ao usuário (se não for admin)
    if (req.user.role !== 'admin' && message.user_id !== req.user.id) {
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
router.put('/:id/process', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        error: 'Mensagem não encontrada',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    // Verificar se a mensagem pertence ao usuário (se não for admin)
    if (req.user.role !== 'admin' && message.user_id !== req.user.id) {
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
router.delete('/:id', async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        error: 'Mensagem não encontrada',
        code: 'MESSAGE_NOT_FOUND'
      });
    }

    // Verificar se a mensagem pertence ao usuário (se não for admin)
    if (req.user.role !== 'admin' && message.user_id !== req.user.id) {
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

// Estatísticas do usuário
router.get('/stats/overview', async (req, res) => {
  try {
    const filters = { user_id: req.user.id };
    
    const [
      totalMessages,
      messagesByStatus,
      messagesByPlatform
    ] = await Promise.all([
      Message.countWithFilters(filters),
      Promise.all([
        Message.countWithFilters({ ...filters, status: 'received' }),
        Message.countWithFilters({ ...filters, status: 'processed' }),
        Message.countWithFilters({ ...filters, status: 'failed' })
      ]),
      Message.getStatsByPlatform(
        req.query.date_from,
        req.query.date_to
      )
    ]);

    res.json({
      total: totalMessages,
      by_status: {
        received: messagesByStatus[0],
        processed: messagesByStatus[1],
        failed: messagesByStatus[2]
      },
      by_platform: messagesByPlatform
    });

  } catch (error) {
    console.error('Erro nas estatísticas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Mensagens recentes
router.get('/recent/:limit?', async (req, res) => {
  try {
    const limit = parseInt(req.params.limit) || 10;
    
    const messages = await Message.findByUserId(req.user.id, limit, 0);

    res.json({
      messages: messages.map(msg => msg.toPublic())
    });

  } catch (error) {
    console.error('Erro ao obter mensagens recentes:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Buscar mensagens por plataforma
router.get('/platform/:platform', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        details: errors.array()
      });
    }

    const platform = req.params.platform;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const filters = {
      user_id: req.user.id,
      platform: platform
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
    console.error('Erro ao buscar mensagens por plataforma:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;