const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');

dotenv.config();

class WebhookService {
  constructor() {
    this.webhookSecret = process.env.WEBHOOK_SECRET || 'smpp_webhook_secret_2024';
    this.timeout = 10000; // 10 segundos
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 segundo
  }

  // Enviar webhook
  async sendWebhook(url, data, options = {}) {
    const {
      timeout = this.timeout,
      maxRetries = this.maxRetries,
      retryDelay = this.retryDelay,
      headers = {}
    } = options;

    // Gerar assinatura
    const signature = this.generateSignature(data);
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'X-SMPP-Signature': signature,
      'X-SMPP-Timestamp': Date.now().toString(),
      'User-Agent': 'SMPP-Admin/1.0'
    };

    const requestConfig = {
      method: 'POST',
      url: url,
      data: data,
      headers: { ...defaultHeaders, ...headers },
      timeout: timeout,
      validateStatus: (status) => status < 500 // Considerar sucesso até 499
    };

    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Enviando webhook (tentativa ${attempt}/${maxRetries}): ${url}`);
        
        const response = await axios(requestConfig);
        
        console.log(`✅ Webhook enviado com sucesso: ${response.status} ${response.statusText}`);
        
        return {
          success: true,
          status: response.status,
          statusText: response.statusText,
          data: response.data,
          attempt: attempt
        };
        
      } catch (error) {
        lastError = error;
        console.error(`❌ Erro no webhook (tentativa ${attempt}/${maxRetries}):`, error.message);
        
        if (attempt < maxRetries) {
          console.log(`Aguardando ${retryDelay}ms antes da próxima tentativa...`);
          await this.sleep(retryDelay);
        }
      }
    }

    throw new Error(`Webhook falhou após ${maxRetries} tentativas: ${lastError.message}`);
  }

  // Enviar webhook para múltiplos endpoints
  async sendWebhooks(urls, data, options = {}) {
    const promises = urls.map(url => 
      this.sendWebhook(url, data, options).catch(error => ({
        success: false,
        url: url,
        error: error.message
      }))
    );

    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => ({
      url: urls[index],
      success: result.status === 'fulfilled' && result.value.success,
      result: result.status === 'fulfilled' ? result.value : { error: result.reason }
    }));
  }

  // Verificar assinatura do webhook
  verifySignature(payload, signature, timestamp) {
    const expectedSignature = this.generateSignature(payload, timestamp);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  // Gerar assinatura
  generateSignature(data, timestamp = null) {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const ts = timestamp || Date.now().toString();
    const message = `${payload}.${ts}`;
    
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(message)
      .digest('hex');
  }

  // Processar webhook recebido
  async processIncomingWebhook(req, res) {
    try {
      const signature = req.headers['x-smpp-signature'];
      const timestamp = req.headers['x-smpp-timestamp'];
      const payload = req.body;

      if (!signature || !timestamp) {
        return res.status(400).json({ error: 'Assinatura ou timestamp ausentes' });
      }

      // Verificar timestamp (não aceitar webhooks com mais de 5 minutos)
      const now = Date.now();
      const webhookTime = parseInt(timestamp);
      if (now - webhookTime > 300000) { // 5 minutos
        return res.status(400).json({ error: 'Webhook expirado' });
      }

      // Verificar assinatura
      if (!this.verifySignature(payload, signature, timestamp)) {
        return res.status(401).json({ error: 'Assinatura inválida' });
      }

      // Processar webhook
      await this.handleWebhookPayload(payload);

      res.json({ success: true, message: 'Webhook processado com sucesso' });

    } catch (error) {
      console.error('❌ Erro ao processar webhook:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Processar payload do webhook
  async handleWebhookPayload(payload) {
    try {
      console.log('📨 Processando webhook payload:', payload);

      // Aqui você pode implementar lógica específica para processar webhooks
      // Por exemplo, atualizar status de mensagens, notificar usuários, etc.

      if (payload.type === 'message_status') {
        await this.handleMessageStatusUpdate(payload);
      } else if (payload.type === 'platform_update') {
        await this.handlePlatformUpdate(payload);
      } else if (payload.type === 'did_assignment') {
        await this.handleDidAssignment(payload);
      }

    } catch (error) {
      console.error('❌ Erro ao processar payload do webhook:', error);
      throw error;
    }
  }

  // Atualizar status da mensagem
  async handleMessageStatusUpdate(payload) {
    const Message = require('../models/Message');
    
    try {
      const { messageId, status, details } = payload;
      
      const message = await Message.findById(messageId);
      if (!message) {
        console.log(`Mensagem ${messageId} não encontrada`);
        return;
      }

      await message.update({ status });
      console.log(`✅ Status da mensagem ${messageId} atualizado para ${status}`);

    } catch (error) {
      console.error('❌ Erro ao atualizar status da mensagem:', error);
      throw error;
    }
  }

  // Atualizar plataforma
  async handlePlatformUpdate(payload) {
    const Platform = require('../models/Platform');
    
    try {
      const { platformCode, updates } = payload;
      
      const platform = await Platform.findByCode(platformCode);
      if (!platform) {
        console.log(`Plataforma ${platformCode} não encontrada`);
        return;
      }

      await platform.update(updates);
      console.log(`✅ Plataforma ${platformCode} atualizada`);

    } catch (error) {
      console.error('❌ Erro ao atualizar plataforma:', error);
      throw error;
    }
  }

  // Processar atribuição de DID
  async handleDidAssignment(payload) {
    const Did = require('../models/Did');
    
    try {
      const { didNumber, userId, platforms, expiresAt } = payload;
      
      const did = await Did.findByNumber(didNumber);
      if (!did) {
        console.log(`DID ${didNumber} não encontrado`);
        return;
      }

      await did.assignToUser(userId, platforms, expiresAt);
      console.log(`✅ DID ${didNumber} atribuído ao usuário ${userId}`);

    } catch (error) {
      console.error('❌ Erro ao processar atribuição de DID:', error);
      throw error;
    }
  }

  // Testar webhook
  async testWebhook(url, testData = null) {
    const data = testData || {
      type: 'test',
      message: 'Teste de webhook do SMPP Admin',
      timestamp: new Date().toISOString()
    };

    try {
      const result = await this.sendWebhook(url, data, { maxRetries: 1 });
      return {
        success: true,
        result: result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Listar webhooks ativos
  async getActiveWebhooks() {
    const Platform = require('../models/Platform');
    
    try {
      const platforms = await Platform.findActive();
      const webhooks = platforms
        .filter(platform => platform.webhook_url)
        .map(platform => ({
          platform: platform.code,
          url: platform.webhook_url,
          name: platform.name
        }));

      return webhooks;
    } catch (error) {
      console.error('❌ Erro ao listar webhooks ativos:', error);
      throw error;
    }
  }

  // Utilitário para aguardar
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new WebhookService();