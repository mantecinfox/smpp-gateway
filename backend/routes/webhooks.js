const express = require('express');
const { body, validationResult } = require('express-validator');
const webhookService = require('../services/webhookService');

const router = express.Router();

// Receber webhook
router.post('/receive', async (req, res) => {
  try {
    await webhookService.processIncomingWebhook(req, res);
  } catch (error) {
    console.error('Erro ao processar webhook recebido:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Enviar webhook de teste (apenas admin)
router.post('/test', [
  body('url').isURL(),
  body('data').optional().isObject()
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

    const { url, data } = req.body;
    const result = await webhookService.testWebhook(url, data);

    res.json({
      success: result.success,
      result: result.result || result.error
    });

  } catch (error) {
    console.error('Erro ao testar webhook:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Listar webhooks ativos (apenas admin)
router.get('/active', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Acesso negado. Apenas administradores.',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    const webhooks = await webhookService.getActiveWebhooks();

    res.json({
      webhooks
    });

  } catch (error) {
    console.error('Erro ao listar webhooks ativos:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Enviar webhook para múltiplos endpoints (apenas admin)
router.post('/send', [
  body('urls').isArray({ min: 1 }),
  body('data').isObject(),
  body('timeout').optional().isInt({ min: 1000, max: 30000 }),
  body('max_retries').optional().isInt({ min: 1, max: 5 })
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

    const { urls, data, timeout = 10000, max_retries = 3 } = req.body;

    const results = await webhookService.sendWebhooks(urls, data, {
      timeout,
      maxRetries: max_retries
    });

    res.json({
      message: 'Webhooks enviados',
      results
    });

  } catch (error) {
    console.error('Erro ao enviar webhooks:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Verificar assinatura do webhook
router.post('/verify', [
  body('payload').isObject(),
  body('signature').isString(),
  body('timestamp').isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: errors.array()
      });
    }

    const { payload, signature, timestamp } = req.body;
    const isValid = webhookService.verifySignature(payload, signature, timestamp);

    res.json({
      valid: isValid
    });

  } catch (error) {
    console.error('Erro ao verificar assinatura:', error);
    res.status(500).json({
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
});

module.exports = router;