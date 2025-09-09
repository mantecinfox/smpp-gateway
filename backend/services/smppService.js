const smpp = require('smpp');
const EventEmitter = require('events');
const Message = require('../models/Message');
const Did = require('../models/Did');
const Platform = require('../models/Platform');
const smppConfig = require('../config/smpp');

class SmppService extends EventEmitter {
  constructor() {
    super();
    this.session = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = smppConfig.maxReconnectAttempts;
    this.reconnectInterval = smppConfig.reconnectInterval;
    this.messageQueue = [];
    this.isProcessingQueue = false;
  }

  // Conectar ao servidor SMPP
  async connect() {
    try {
      console.log('Conectando ao servidor SMPP...');
      
      this.session = smpp.connect({
        url: `smpp://${smppConfig.host}:${smppConfig.port}`,
        auto_enquire_link_period: 10000,
        debug: smppConfig.logLevel === 'debug'
      });

      this.setupEventHandlers();
      
      return new Promise((resolve, reject) => {
        this.session.on('connect', () => {
          console.log('Conectado ao servidor SMPP');
          this.bind();
        });

        this.session.on('bind_transceiver_resp', (pdu) => {
          if (pdu.command_status === 0) {
            console.log('✅ Bind transceiver realizado com sucesso');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
            resolve();
          } else {
            console.error('❌ Erro no bind transceiver:', pdu.command_status);
            reject(new Error(`Bind failed: ${pdu.command_status}`));
          }
        });

        this.session.on('error', (error) => {
          console.error('❌ Erro na conexão SMPP:', error);
          this.isConnected = false;
          this.emit('error', error);
          reject(error);
        });

        this.session.on('close', () => {
          console.log('Conexão SMPP fechada');
          this.isConnected = false;
          this.emit('disconnected');
          this.handleReconnect();
        });

        // Timeout de conexão
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Timeout na conexão SMPP'));
          }
        }, smppConfig.connectTimeout);
      });

    } catch (error) {
      console.error('❌ Erro ao conectar SMPP:', error);
      throw error;
    }
  }

  // Configurar handlers de eventos
  setupEventHandlers() {
    // Handler para deliver_sm (mensagens recebidas)
    this.session.on('deliver_sm', async (pdu) => {
      try {
        await this.handleIncomingMessage(pdu);
      } catch (error) {
        console.error('❌ Erro ao processar mensagem recebida:', error);
      }
    });

    // Handler para enquire_link
    this.session.on('enquire_link', (pdu) => {
      this.session.send(pdu.response());
    });

    // Handler para enquire_link_resp
    this.session.on('enquire_link_resp', (pdu) => {
      console.log('Enquire link response recebido');
    });

    // Handler para generic_nack
    this.session.on('generic_nack', (pdu) => {
      console.log('Generic NACK recebido:', pdu);
    });

    // Handler para unbind
    this.session.on('unbind', (pdu) => {
      this.session.send(pdu.response());
      this.session.close();
    });
  }

  // Realizar bind transceiver
  bind() {
    console.log('Realizando bind transceiver...');
    
    const bindPdu = {
      command: 'bind_transceiver',
      command_id: 0x00000009,
      command_status: 0x00000000,
      system_id: smppConfig.systemId,
      password: smppConfig.password,
      system_type: smppConfig.systemType,
      interface_version: 0x34,
      addr_ton: smppConfig.ton,
      addr_npi: smppConfig.npi,
      address_range: smppConfig.addressRange
    };

    this.session.send(bindPdu);
  }

  // Processar mensagem recebida
  async handleIncomingMessage(pdu) {
    try {
      console.log('📨 Mensagem recebida via SMPP');
      
      // Extrair dados da mensagem
      const messageData = this.extractMessageData(pdu);
      
      if (!messageData) {
        console.log('⚠️ Dados da mensagem inválidos, ignorando...');
        return;
      }

      // Identificar DID
      const did = await Did.findByNumber(messageData.did);
      if (!did) {
        console.log(`⚠️ DID ${messageData.did} não encontrado, ignorando mensagem`);
        return;
      }

      // Identificar plataforma
      const platform = await this.identifyPlatform(messageData.message);
      if (!platform) {
        console.log(`⚠️ Plataforma não identificada para mensagem: ${messageData.message}`);
        return;
      }

      // Verificar se o usuário tem acesso à plataforma
      if (did.user_id && !did.platforms.includes(platform.code)) {
        console.log(`⚠️ Usuário ${did.user_id} não tem acesso à plataforma ${platform.code}`);
        return;
      }

      // Criar registro da mensagem
      const message = await Message.create({
        did: messageData.did,
        sender: messageData.sender,
        receiver: messageData.receiver,
        message: messageData.message,
        platform: platform.code,
        user_id: did.user_id,
        smpp_id: pdu.message_id,
        raw_data: JSON.stringify(pdu)
      });

      console.log(`✅ Mensagem salva: ID ${message.id}, DID ${messageData.did}, Plataforma ${platform.code}`);

      // Emitir evento para tempo real
      this.emit('messageReceived', {
        message: message.toPublic(),
        platform: platform.toPublic(),
        did: did.toPublic()
      });

      // Processar webhook se configurado
      if (platform.webhook_url) {
        await this.processWebhook(message, platform);
      }

      // Processar auto-forward se configurado
      if (platform.auto_forward && did.user_id) {
        await this.processAutoForward(message, platform, did);
      }

    } catch (error) {
      console.error('❌ Erro ao processar mensagem:', error);
    }
  }

  // Extrair dados da mensagem
  extractMessageData(pdu) {
    try {
      const shortMessage = pdu.short_message?.toString() || '';
      const sourceAddr = pdu.source_addr?.toString() || '';
      const destAddr = pdu.dest_addr?.toString() || '';

      // Extrair DID do destinatário (assumindo que o DID está no destinatário)
      const did = destAddr;

      return {
        did: did,
        sender: sourceAddr,
        receiver: destAddr,
        message: shortMessage,
        messageId: pdu.message_id
      };
    } catch (error) {
      console.error('❌ Erro ao extrair dados da mensagem:', error);
      return null;
    }
  }

  // Identificar plataforma baseada na mensagem
  async identifyPlatform(message) {
    const messageLower = message.toLowerCase();
    
    // Lista de palavras-chave para cada plataforma
    const platformKeywords = {
      'wa': ['whatsapp', 'wa.me', 'chat.whatsapp.com'],
      'tg': ['telegram', 't.me', 'telegram.me'],
      'ig': ['instagram', 'instagr.am', 'ig.me'],
      'fb': ['facebook', 'fb.me', 'facebook.com'],
      'tw': ['twitter', 't.co', 'twitter.com', 'x.com'],
      'go': ['google', 'gmail', 'google.com', 'gmail.com'],
      'tt': ['tiktok', 'tiktok.com', 'vm.tiktok.com'],
      'kw': ['kwai', 'kwai.com'],
      'ol': ['olx', 'olx.com.br'],
      'if': ['ifood', 'ifood.com.br'],
      '99': ['99', '99app.com'],
      'ub': ['uber', 'uber.com'],
      'pp': ['picpay', 'picpay.com'],
      'me': ['mercadolivre', 'mercadolivre.com.br', 'ml.com.br'],
      'nu': ['nubank', 'nubank.com.br'],
      'in': ['banco inter', 'bancointer.com.br'],
      'ma': ['magalu', 'magazineluiza.com.br'],
      'ae': ['aliexpress', 'aliexpress.com'],
      'am': ['amazon', 'amazon.com.br'],
      'li': ['linkedin', 'linkedin.com']
    };

    // Procurar por palavras-chave
    for (const [platformCode, keywords] of Object.entries(platformKeywords)) {
      for (const keyword of keywords) {
        if (messageLower.includes(keyword)) {
          const platform = await Platform.findByCode(platformCode);
          if (platform && platform.status === 'active') {
            return platform;
          }
        }
      }
    }

    // Se não encontrou por palavras-chave, tentar por padrões de URL
    const urlPatterns = {
      'wa': /wa\.me|chat\.whatsapp\.com/i,
      'tg': /t\.me|telegram\.me/i,
      'ig': /instagr\.am|instagram\.com/i,
      'fb': /fb\.me|facebook\.com/i,
      'tw': /t\.co|twitter\.com|x\.com/i,
      'go': /google\.com|gmail\.com/i,
      'tt': /tiktok\.com|vm\.tiktok\.com/i,
      'kw': /kwai\.com/i,
      'ol': /olx\.com\.br/i,
      'if': /ifood\.com\.br/i,
      '99': /99app\.com/i,
      'ub': /uber\.com/i,
      'pp': /picpay\.com/i,
      'me': /mercadolivre\.com\.br|ml\.com\.br/i,
      'nu': /nubank\.com\.br/i,
      'in': /bancointer\.com\.br/i,
      'ma': /magazineluiza\.com\.br/i,
      'ae': /aliexpress\.com/i,
      'am': /amazon\.com\.br/i,
      'li': /linkedin\.com/i
    };

    for (const [platformCode, pattern] of Object.entries(urlPatterns)) {
      if (pattern.test(message)) {
        const platform = await Platform.findByCode(platformCode);
        if (platform && platform.status === 'active') {
          return platform;
        }
      }
    }

    return null;
  }

  // Processar webhook
  async processWebhook(message, platform) {
    try {
      const webhookService = require('./webhookService');
      await webhookService.sendWebhook(platform.webhook_url, {
        message: message.toPublic(),
        platform: platform.toPublic(),
        timestamp: new Date().toISOString()
      });
      
      await message.markWebhookSent();
      console.log(`✅ Webhook enviado para ${platform.name}`);
    } catch (error) {
      console.error(`❌ Erro ao enviar webhook para ${platform.name}:`, error);
    }
  }

  // Processar auto-forward
  async processAutoForward(message, platform, did) {
    try {
      // Aqui você pode implementar lógica de auto-forward
      // Por exemplo, enviar para outro serviço, API, etc.
      console.log(`🔄 Auto-forward ativado para ${platform.name}`);
      
      // Marcar como processada
      await message.markAsProcessed();
    } catch (error) {
      console.error(`❌ Erro no auto-forward para ${platform.name}:`, error);
    }
  }

  // Enviar mensagem
  async sendMessage(messageData) {
    if (!this.isConnected) {
      throw new Error('SMPP não conectado');
    }

    const { destination, message, source = 'SMPP' } = messageData;

    const submitSmPdu = {
      command: 'submit_sm',
      command_id: 0x00000004,
      command_status: 0x00000000,
      service_type: '',
      source_addr_ton: smppConfig.ton,
      source_addr_npi: smppConfig.npi,
      source_addr: source,
      dest_addr_ton: 1,
      dest_addr_npi: 1,
      destination_addr: destination,
      esm_class: 0,
      protocol_id: 0,
      priority_flag: 0,
      schedule_delivery_time: '',
      validity_period: '',
      registered_delivery: 1,
      replace_if_present_flag: 0,
      data_coding: 0,
      sm_default_msg_id: 0,
      short_message: message
    };

    return new Promise((resolve, reject) => {
      this.session.send(submitSmPdu);
      
      this.session.on('submit_sm_resp', (pdu) => {
        if (pdu.command_status === 0) {
          resolve({
            messageId: pdu.message_id,
            status: 'success'
          });
        } else {
          reject(new Error(`Submit SM failed: ${pdu.command_status}`));
        }
      });

      setTimeout(() => {
        reject(new Error('Timeout no envio da mensagem'));
      }, smppConfig.requestTimeout);
    });
  }

  // Lidar com reconexão
  handleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Tentativa de reconexão ${this.reconnectAttempts}/${this.maxReconnectAttempts} em ${this.reconnectInterval}ms`);
      
      setTimeout(() => {
        this.connect().catch(error => {
          console.error('Erro na reconexão:', error);
        });
      }, this.reconnectInterval);
    } else {
      console.error('❌ Máximo de tentativas de reconexão atingido');
      this.emit('maxReconnectAttemptsReached');
    }
  }

  // Desconectar
  async disconnect() {
    if (this.session && this.isConnected) {
      try {
        this.session.close();
        this.isConnected = false;
        console.log('Desconectado do servidor SMPP');
      } catch (error) {
        console.error('Erro ao desconectar:', error);
      }
    }
  }

  // Verificar status da conexão
  getStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      messageQueueLength: this.messageQueue.length
    };
  }
}

module.exports = SmppService;