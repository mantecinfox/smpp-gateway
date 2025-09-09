# Multi-stage build para SMPP Admin
FROM node:20-alpine AS frontend-builder

# Instalar dependências do frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --only=production

# Copiar código do frontend e fazer build
COPY frontend/ ./
RUN npm run build

# Stage para o backend
FROM node:20-alpine AS backend

# Instalar dependências do sistema
RUN apk add --no-cache \
    postgresql-client \
    redis \
    curl

# Criar usuário da aplicação
RUN addgroup -g 1001 -S nodejs
RUN adduser -S smpp -u 1001

# Configurar diretório de trabalho
WORKDIR /app

# Instalar dependências do backend
COPY backend/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copiar código do backend
COPY backend/ ./

# Copiar frontend buildado
COPY --from=frontend-builder /app/frontend/dist ./public

# Copiar scripts e configurações
COPY ecosystem.config.js ./
COPY .env.example .env

# Criar diretórios necessários
RUN mkdir -p logs && chown -R smpp:nodejs /app

# Mudar para usuário da aplicação
USER smpp

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Comando de inicialização
CMD ["node", "server.js"]