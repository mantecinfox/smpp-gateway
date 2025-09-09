const errorHandler = (err, req, res, next) => {
  console.error('Erro capturado:', err);

  // Erro de validação
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Dados inválidos',
      details: err.message,
      code: 'VALIDATION_ERROR'
    });
  }

  // Erro de chave duplicada
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Recurso já existe',
      code: 'DUPLICATE_RESOURCE'
    });
  }

  // Erro de chave estrangeira
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Referência inválida',
      code: 'FOREIGN_KEY_ERROR'
    });
  }

  // Erro de conexão com banco
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({
      error: 'Serviço indisponível',
      code: 'SERVICE_UNAVAILABLE'
    });
  }

  // Erro padrão
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno do servidor',
    code: err.code || 'INTERNAL_ERROR'
  });
};

module.exports = errorHandler;