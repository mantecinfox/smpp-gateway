const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Did = require('../models/Did');
const User = require('../models/User');

const router = express.Router();

// Listar DIDs do usuário
router.get('/', [
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

    let filters = {};
    
    // Se for cliente, filtrar apenas seus DIDs
    if (req.user.role === 'client') {
      filters.user_id = req.user.id;
    } else {
      // Admin pode filtrar por usuário específico
      if (req.query.user_id) {
        filters.user_id = req.query.user_id;
      }
    }

    if (req.query.status) filters.status = req.query.status;
    if (req.query.platform) filters.platform = req.query.platform;
    if (req.query.search) filters.search = req.query.search;

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

// Obter DID específico
router.get('/:id', async (req, res) => {
  try {
    const did = await Did.findById(req.params.id);
    
    if (!did) {
      return res.status(404).json({
        error: 'DID não encontrado',
        code: 'DID_NOT_FOUND'
      });
    }

    // Verificar se o DID pertence ao usuário (se não for admin)
    if (req.user.role !== 'admin' && did.user_id !== req.user.id) {
      return res.status(403).json({
        error: 'Acesso negado',
        code: 'ACCESS_DENIED'
      });
    }

    res.json({
      did: did.toPublic()
    });

  } catch (error) {
    console.error('Erro ao obter DID:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Atribuir DID ao usuário (apenas admin)
router.post('/:id/assign', [
  body('user_id').isInt({ min: 1 }),
  body('platforms').isArray(),
  body('expires_at').optional().isISO8601()
], async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

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

    if (did.status !== 'available') {
      return res.status(400).json({
        error: 'DID não está disponível',
        code: 'DID_NOT_AVAILABLE'
      });
    }

    const { user_id, platforms, expires_at } = req.body;

    // Verificar se o usuário existe
    const user = await User.findById(user_id);
    if (!user) {
      return res.status(404).json({
        error: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    const updatedDid = await did.assignToUser(user_id, platforms, expires_at);

    res.json({
      message: 'DID atribuído com sucesso',
      did: updatedDid.toPublic()
    });

  } catch (error) {
    console.error('Erro ao atribuir DID:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Liberar DID (apenas admin)
router.post('/:id/release', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const did = await Did.findById(req.params.id);
    if (!did) {
      return res.status(404).json({
        error: 'DID não encontrado',
        code: 'DID_NOT_FOUND'
      });
    }

    const updatedDid = await did.release();

    res.json({
      message: 'DID liberado com sucesso',
      did: updatedDid.toPublic()
    });

  } catch (error) {
    console.error('Erro ao liberar DID:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Atualizar plataformas do DID
router.put('/:id/platforms', [
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

    // Verificar se o DID pertence ao usuário (se não for admin)
    if (req.user.role !== 'admin' && did.user_id !== req.user.id) {
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
    console.error('Erro ao atualizar plataformas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Atualizar status do DID
router.put('/:id/status', [
  body('status').isIn(['available', 'assigned', 'inactive'])
], async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

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

    const { status } = req.body;
    const updatedDid = await did.updateStatus(status);

    res.json({
      message: 'Status atualizado com sucesso',
      did: updatedDid.toPublic()
    });

  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Criar múltiplos DIDs (apenas admin)
router.post('/bulk', [
  body('numbers').isArray({ min: 1 }),
  body('platforms').optional().isArray(),
  body('price').optional().isFloat({ min: 0 }),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { numbers, platforms = [], price = 0, notes = null } = req.body;

    const options = {
      platforms,
      price,
      notes
    };

    const dids = await Did.createMultiple(numbers, options);

    res.status(201).json({
      message: `${dids.length} DIDs criados com sucesso`,
      dids: dids.map(did => did.toPublic())
    });

  } catch (error) {
    console.error('Erro ao criar DIDs em lote:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Estatísticas de DIDs
router.get('/stats/overview', async (req, res) => {
  try {
    let filters = {};
    
    // Se for cliente, filtrar apenas seus DIDs
    if (req.user.role === 'client') {
      filters.user_id = req.user.id;
    }

    const [total, stats] = await Promise.all([
      Did.countWithFilters(filters),
      Did.getStats()
    ]);

    res.json({
      total,
      by_status: stats
    });

  } catch (error) {
    console.error('Erro nas estatísticas de DIDs:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// DIDs expirados
router.get('/expired/list', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const expiredDids = await Did.findExpired();

    res.json({
      dids: expiredDids.map(did => did.toPublic())
    });

  } catch (error) {
    console.error('Erro ao listar DIDs expirados:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;