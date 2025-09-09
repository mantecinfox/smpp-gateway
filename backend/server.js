const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');

// Carregar variáveis de ambiente
dotenv.config();

// Importar configurações
const dbConfig = require('./config/database');
const redisConfig = require('./config/redis');
const smppConfig = require('./config/smpp');

// Importar serviços
const SmppService = require('./services/smppService');
const WebhookService = require('./services/webhookService');

// Importar rotas
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const clientRoutes = require('./routes/client');
const messageRoutes = require('./routes/messages');
const didRoutes = require('./routes/dids');
const platformRoutes = require('./routes/platforms');
const webhookRoutes = require('./routes/webhooks');

// Importar middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.API_PORT || 3000;

// Middleware global
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3001",
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware para Socket.IO
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Rotas públicas
app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes);

// Middleware de autenticação para rotas protegidas
app.use('/api/admin', authMiddleware.requireAuth, authMiddleware.requireAdmin, adminRoutes);
app.use('/api/client', authMiddleware.requireAuth, clientRoutes);
app.use('/api/messages', authMiddleware.requireAuth, messageRoutes);
app.use('/api/dids', authMiddleware.requireAuth, didRoutes);
app.use('/api/platforms', authMiddleware.requireAuth, platformRoutes);

// Rota de health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: require('./package.json').version
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({
    message: 'SMPP Admin API',
    version: require('./package.json').version,
    status: 'running'
  });
});

// Socket.IO para tempo real
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`Cliente ${socket.id} entrou na sala ${room}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Inicializar serviços
async function initializeServices() {
  try {
    console.log('Inicializando serviços...');
    
    // Conectar ao banco de dados
    await dbConfig.connect();
    console.log('✅ Banco de dados conectado');
    
    // Conectar ao Redis
    await redisConfig.connect();
    console.log('✅ Redis conectado');
    
    // Inicializar serviço SMPP
    const smppService = new SmppService();
    await smppService.connect();
    console.log('✅ Serviço SMPP conectado');
    
    // Inicializar serviço de webhooks
    const webhookService = new WebhookService();
    console.log('✅ Serviço de webhooks inicializado');
    
    // Tornar serviços disponíveis globalmente
    app.locals.smppService = smppService;
    app.locals.webhookService = webhookService;
    app.locals.io = io;
    
    console.log('🚀 Todos os serviços inicializados com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao inicializar serviços:', error);
    process.exit(1);
  }
}

// Middleware de tratamento de erros
app.use(errorHandler);

// Inicializar servidor
async function startServer() {
  try {
    await initializeServices();
    
    server.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🌐 Frontend: ${process.env.FRONTEND_URL || 'http://localhost:3001'}`);
    });
    
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

// Tratamento de sinais para shutdown graceful
process.on('SIGTERM', () => {
  console.log('SIGTERM recebido, encerrando servidor...');
  server.close(() => {
    console.log('Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT recebido, encerrando servidor...');
  server.close(() => {
    console.log('Servidor encerrado');
    process.exit(0);
  });
});

// Iniciar servidor
startServer();

module.exports = app;