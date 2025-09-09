const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Platform = require('../models/Platform');

const router = express.Router();

// Listar plataformas
router.get('/', [
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

// Obter plataforma específica
router.get('/:id', async (req, res) => {
  try {
    const platform = await Platform.findById(req.params.id);
    
    if (!platform) {
      return res.status(404).json({
        error: 'Plataforma não encontrada',
        code: 'PLATFORM_NOT_FOUND'
      });
    }

    res.json({
      platform: platform.toPublic()
    });

  } catch (error) {
    console.error('Erro ao obter plataforma:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Obter plataforma por código
router.get('/code/:code', async (req, res) => {
  try {
    const platform = await Platform.findByCode(req.params.code);
    
    if (!platform) {
      return res.status(404).json({
        error: 'Plataforma não encontrada',
        code: 'PLATFORM_NOT_FOUND'
      });
    }

    res.json({
      platform: platform.toPublic()
    });

  } catch (error) {
    console.error('Erro ao obter plataforma por código:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Criar plataforma (apenas admin)
router.post('/', [
  body('code').trim().isLength({ min: 2, max: 10 }),
  body('name').trim().isLength({ min: 2 }),
  body('description').optional().trim(),
  body('price').optional().isFloat({ min: 0 }),
  body('webhook_url').optional().isURL(),
  body('auto_forward').optional().isBoolean()
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

    const { code, name, description, price = 0, webhook_url, auto_forward = false } = req.body;

    // Verificar se código já existe
    const existingPlatform = await Platform.findByCode(code);
    if (existingPlatform) {
      return res.status(409).json({
        error: 'Código da plataforma já existe',
        code: 'PLATFORM_CODE_EXISTS'
      });
    }

    const platform = await Platform.create({
      code,
      name,
      description,
      price,
      webhook_url,
      auto_forward
    });

    res.status(201).json({
      message: 'Plataforma criada com sucesso',
      platform: platform.toPublic()
    });

  } catch (error) {
    console.error('Erro ao criar plataforma:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Atualizar plataforma (apenas admin)
router.put('/:id', [
  body('name').optional().trim().isLength({ min: 2 }),
  body('description').optional().trim(),
  body('price').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['active', 'inactive']),
  body('webhook_url').optional().isURL(),
  body('auto_forward').optional().isBoolean()
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

    const platform = await Platform.findById(req.params.id);
    if (!platform) {
      return res.status(404).json({
        error: 'Plataforma não encontrada',
        code: 'PLATFORM_NOT_FOUND'
      });
    }

    const { name, description, price, status, webhook_url, auto_forward } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price;
    if (status) updateData.status = status;
    if (webhook_url !== undefined) updateData.webhook_url = webhook_url;
    if (auto_forward !== undefined) updateData.auto_forward = auto_forward;

    const updatedPlatform = await platform.update(updateData);

    res.json({
      message: 'Plataforma atualizada com sucesso',
      platform: updatedPlatform.toPublic()
    });

  } catch (error) {
    console.error('Erro ao atualizar plataforma:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Ativar plataforma (apenas admin)
router.post('/:id/activate', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const platform = await Platform.findById(req.params.id);
    if (!platform) {
      return res.status(404).json({
        error: 'Plataforma não encontrada',
        code: 'PLATFORM_NOT_FOUND'
      });
    }

    const updatedPlatform = await platform.activate();

    res.json({
      message: 'Plataforma ativada com sucesso',
      platform: updatedPlatform.toPublic()
    });

  } catch (error) {
    console.error('Erro ao ativar plataforma:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Desativar plataforma (apenas admin)
router.post('/:id/deactivate', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const platform = await Platform.findById(req.params.id);
    if (!platform) {
      return res.status(404).json({
        error: 'Plataforma não encontrada',
        code: 'PLATFORM_NOT_FOUND'
      });
    }

    const updatedPlatform = await platform.deactivate();

    res.json({
      message: 'Plataforma desativada com sucesso',
      platform: updatedPlatform.toPublic()
    });

  } catch (error) {
    console.error('Erro ao desativar plataforma:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Atualizar preço da plataforma (apenas admin)
router.put('/:id/price', [
  body('price').isFloat({ min: 0 })
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

    const platform = await Platform.findById(req.params.id);
    if (!platform) {
      return res.status(404).json({
        error: 'Plataforma não encontrada',
        code: 'PLATFORM_NOT_FOUND'
      });
    }

    const { price } = req.body;
    const updatedPlatform = await platform.updatePrice(price);

    res.json({
      message: 'Preço atualizado com sucesso',
      platform: updatedPlatform.toPublic()
    });

  } catch (error) {
    console.error('Erro ao atualizar preço:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Atualizar webhook da plataforma (apenas admin)
router.put('/:id/webhook', [
  body('webhook_url').isURL()
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

    const platform = await Platform.findById(req.params.id);
    if (!platform) {
      return res.status(404).json({
        error: 'Plataforma não encontrada',
        code: 'PLATFORM_NOT_FOUND'
      });
    }

    const { webhook_url } = req.body;
    const updatedPlatform = await platform.updateWebhook(webhook_url);

    res.json({
      message: 'Webhook atualizado com sucesso',
      platform: updatedPlatform.toPublic()
    });

  } catch (error) {
    console.error('Erro ao atualizar webhook:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Deletar plataforma (apenas admin)
router.delete('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const platform = await Platform.findById(req.params.id);
    if (!platform) {
      return res.status(404).json({
        error: 'Plataforma não encontrada',
        code: 'PLATFORM_NOT_FOUND'
      });
    }

    await platform.delete();

    res.json({
      message: 'Plataforma deletada com sucesso'
    });

  } catch (error) {
    console.error('Erro ao deletar plataforma:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Estatísticas da plataforma
router.get('/:id/stats', [
  query('date_from').optional().isISO8601(),
  query('date_to').optional().isISO8601()
], async (req, res) => {
  try {
    const platform = await Platform.findById(req.params.id);
    if (!platform) {
      return res.status(404).json({
        error: 'Plataforma não encontrada',
        code: 'PLATFORM_NOT_FOUND'
      });
    }

    const stats = await platform.getStats(
      req.query.date_from,
      req.query.date_to
    );

    res.json({
      platform: platform.toPublic(),
      stats
    });

  } catch (error) {
    console.error('Erro nas estatísticas da plataforma:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Listar plataformas ativas
router.get('/active/list', async (req, res) => {
  try {
    const platforms = await Platform.findActive();

    res.json({
      platforms: platforms.map(platform => platform.toPublic())
    });

  } catch (error) {
    console.error('Erro ao listar plataformas ativas:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;