const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware para verificar autenticação
const requireAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Token de acesso necessário',
        code: 'NO_TOKEN'
      });
    }

    // Verificar token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Buscar usuário
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ 
        error: 'Usuário não encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verificar se usuário está ativo
    if (user.status !== 'active') {
      return res.status(401).json({ 
        error: 'Usuário inativo',
        code: 'USER_INACTIVE'
      });
    }

    // Adicionar usuário à requisição
    req.user = user;
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Token inválido',
        code: 'INVALID_TOKEN'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Token expirado',
        code: 'TOKEN_EXPIRED'
      });
    }

    console.error('Erro na autenticação:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Middleware para verificar se é admin
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Acesso negado. Apenas administradores.',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Middleware para verificar se é cliente
const requireClient = (req, res, next) => {
  if (req.user.role !== 'client') {
    return res.status(403).json({ 
      error: 'Acesso negado. Apenas clientes.',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }
  next();
};

// Middleware para verificar API key
const requireApiKey = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'API key necessária',
        code: 'NO_API_KEY'
      });
    }

    // Buscar usuário por API key
    const user = await User.findByApiKey(apiKey);
    if (!user) {
      return res.status(401).json({ 
        error: 'API key inválida',
        code: 'INVALID_API_KEY'
      });
    }

    // Verificar se usuário está ativo
    if (user.status !== 'active') {
      return res.status(401).json({ 
        error: 'Usuário inativo',
        code: 'USER_INACTIVE'
      });
    }

    // Adicionar usuário à requisição
    req.user = user;
    next();

  } catch (error) {
    console.error('Erro na verificação da API key:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Middleware opcional de autenticação
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      
      if (user && user.status === 'active') {
        req.user = user;
      }
    }
    
    next();
  } catch (error) {
    // Ignorar erros de autenticação opcional
    next();
  }
};

// Middleware para verificar propriedade do recurso
const requireOwnership = (resourceField = 'user_id') => {
  return (req, res, next) => {
    // Admin pode acessar qualquer recurso
    if (req.user.role === 'admin') {
      return next();
    }

    // Cliente só pode acessar seus próprios recursos
    const resourceUserId = req.params[resourceField] || req.body[resourceField];
    
    if (resourceUserId && resourceUserId !== req.user.id.toString()) {
      return res.status(403).json({ 
        error: 'Acesso negado. Recurso não pertence ao usuário.',
        code: 'RESOURCE_OWNERSHIP_REQUIRED'
      });
    }

    next();
  };
};

// Middleware para verificar permissões de plataforma
const requirePlatformAccess = (platformField = 'platform') => {
  return async (req, res, next) => {
    try {
      // Admin pode acessar qualquer plataforma
      if (req.user.role === 'admin') {
        return next();
      }

      const platform = req.params[platformField] || req.body[platformField];
      
      if (!platform) {
        return res.status(400).json({ 
          error: 'Plataforma não especificada',
          code: 'PLATFORM_REQUIRED'
        });
      }

      // Verificar se o usuário tem acesso à plataforma
      const Did = require('../models/Did');
      const userDids = await Did.findByUserId(req.user.id);
      
      const hasAccess = userDids.some(did => 
        did.platforms.includes(platform) && did.status === 'assigned'
      );

      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Acesso negado. Usuário não tem acesso à plataforma.',
          code: 'PLATFORM_ACCESS_DENIED'
        });
      }

      next();
    } catch (error) {
      console.error('Erro na verificação de acesso à plataforma:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor',
        code: 'INTERNAL_ERROR'
      });
    }
  };
};

// Extrair token da requisição
function extractToken(req) {
  // Tentar extrair do header Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Tentar extrair do header X-Auth-Token
  if (req.headers['x-auth-token']) {
    return req.headers['x-auth-token'];
  }

  // Tentar extrair da query string
  if (req.query.token) {
    return req.query.token;
  }

  return null;
}

// Gerar token JWT
function generateToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  const options = {
    expiresIn: '24h',
    issuer: 'smpp-admin',
    audience: 'smpp-admin-client'
  };

  return jwt.sign(payload, process.env.JWT_SECRET, options);
}

// Verificar token JWT
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw error;
  }
}

// Middleware para rate limiting por usuário
const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const requests = new Map();

  return (req, res, next) => {
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Limpar requisições antigas
    if (requests.has(userId)) {
      const userRequests = requests.get(userId);
      const recentRequests = userRequests.filter(time => time > windowStart);
      requests.set(userId, recentRequests);
    }

    // Verificar limite
    const userRequests = requests.get(userId) || [];
    if (userRequests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Muitas requisições. Tente novamente mais tarde.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }

    // Adicionar requisição atual
    userRequests.push(now);
    requests.set(userId, userRequests);

    next();
  };
};

module.exports = {
  requireAuth,
  requireAdmin,
  requireClient,
  requireApiKey,
  optionalAuth,
  requireOwnership,
  requirePlatformAccess,
  generateToken,
  verifyToken,
  rateLimitByUser
};