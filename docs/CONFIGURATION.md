# ⚙️ Guia de Configuração

## 🔧 Configurações do Sistema

### Variáveis de Ambiente (.env)

```env
# =============================================================================
# CONFIGURAÇÕES DO SISTEMA SMPP ADMIN
# =============================================================================

# Banco de Dados PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smpp_admin
DB_USER=smpp_user
DB_PASSWORD=smpp_password_2024

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# SMPP
SMPP_HOST=198.54.166.74
SMPP_PORT=2875
SMPP_SYSTEM_ID=WhatsInfo_otp
SMPP_PASSWORD=juebkiur
SMPP_SYSTEM_TYPE=
SMPP_TON=1
SMPP_NPI=1
SMPP_ADDRESS_RANGE=

# API
API_PORT=3000
JWT_SECRET=smpp_admin_jwt_secret_2024
WEBHOOK_SECRET=smpp_webhook_secret_2024

# Frontend
FRONTEND_URL=http://localhost:3001

# Logs
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Webhook
WEBHOOK_TIMEOUT=10000
WEBHOOK_MAX_RETRIES=3
```

## 📱 Configuração SMPP

### Parâmetros de Conexão

| Parâmetro | Valor | Descrição |
|-----------|-------|-----------|
| Host | 198.54.166.74 | IP do servidor SMPP |
| Porta | 2875 | Porta do servidor SMPP |
| System ID | WhatsInfo_otp | Identificador do sistema |
| Password | juebkiur | Senha de autenticação |
| TON | 1 | Tipo de número |
| NPI | 1 | Plano de numeração |
| Modo | Transceiver | Modo de conexão |

### Configurações Avançadas

```javascript
// backend/config/smpp.js
const smppConfig = {
  // Configurações de reconexão
  reconnectInterval: 5000,        // 5 segundos
  maxReconnectAttempts: 10,       // Máximo 10 tentativas
  
  // Configurações de timeout
  connectTimeout: 10000,          // 10 segundos
  requestTimeout: 30000,          // 30 segundos
  
  // Configurações de rate limiting
  maxMessagesPerSecond: 100,      // 100 msg/s
  maxConcurrentRequests: 50,      // 50 requisições simultâneas
  
  // Configurações de logs
  logLevel: 'info',               // debug, info, warn, error
  logMessages: true,              // Log das mensagens
  
  // Configurações de retry
  maxRetries: 3,                  // 3 tentativas
  retryDelay: 1000,               // 1 segundo
};
```

## 🗄️ Configuração do Banco de Dados

### PostgreSQL

```sql
-- Configurações recomendadas
-- postgresql.conf

# Memória
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB
maintenance_work_mem = 64MB

# Conexões
max_connections = 100
shared_preload_libraries = 'pg_stat_statements'

# Logs
log_destination = 'stderr'
logging_collector = on
log_directory = 'pg_log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '

# Performance
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
```

### Índices Recomendados

```sql
-- Índices para performance
CREATE INDEX CONCURRENTLY idx_messages_created_at ON messages(created_at);
CREATE INDEX CONCURRENTLY idx_messages_did_created ON messages(did, created_at);
CREATE INDEX CONCURRENTLY idx_messages_platform_status ON messages(platform, status);
CREATE INDEX CONCURRENTLY idx_messages_user_created ON messages(user_id, created_at);

-- Índices para DIDs
CREATE INDEX CONCURRENTLY idx_dids_number ON dids(number);
CREATE INDEX CONCURRENTLY idx_dids_user_status ON dids(user_id, status);
CREATE INDEX CONCURRENTLY idx_dids_platforms_gin ON dids USING GIN(platforms);

-- Índices para usuários
CREATE INDEX CONCURRENTLY idx_users_email ON users(email);
CREATE INDEX CONCURRENTLY idx_users_role_status ON users(role, status);
CREATE INDEX CONCURRENTLY idx_users_api_key ON users(api_key);
```

## 🔄 Configuração do Redis

### redis.conf

```conf
# Configurações básicas
bind 127.0.0.1
port 6379
timeout 300
tcp-keepalive 300

# Persistência
save 900 1
save 300 10
save 60 10000

# Memória
maxmemory 256mb
maxmemory-policy allkeys-lru

# Logs
loglevel notice
logfile /var/log/redis/redis-server.log

# Segurança
requirepass your_redis_password
```

## 🌐 Configuração do Nginx

### nginx.conf

```nginx
# Configurações de performance
worker_processes auto;
worker_connections 1024;

# Configurações de buffer
client_body_buffer_size 128k;
client_max_body_size 10m;
client_header_buffer_size 1k;
large_client_header_buffers 4 4k;

# Configurações de timeout
client_body_timeout 12;
client_header_timeout 12;
keepalive_timeout 15;
send_timeout 10;

# Configurações de compressão
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

# Configurações de cache
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# Configurações de segurança
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
```

## 🔐 Configuração de Segurança

### Firewall (UFW)

```bash
# Configurações básicas
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Permitir SSH
sudo ufw allow ssh

# Permitir HTTP/HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Permitir API (opcional)
sudo ufw allow 3000

# Ativar firewall
sudo ufw enable
```

### Firewall (firewalld - CentOS)

```bash
# Configurações básicas
sudo firewall-cmd --set-default-zone=drop
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### SSL/TLS (Let's Encrypt)

```bash
# Instalar Certbot
sudo apt install certbot python3-certbot-nginx  # Ubuntu
sudo dnf install certbot python3-certbot-nginx  # CentOS

# Obter certificado
sudo certbot --nginx -d yourdomain.com

# Renovação automática
echo "0 12 * * * /usr/bin/certbot renew --quiet" | sudo crontab -
```

## 📊 Configuração de Monitoramento

### PM2

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'smpp-admin-backend',
    script: './backend/server.js',
    instances: 1,
    exec_mode: 'fork',
    
    // Configurações de restart
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    
    // Configurações de memória
    max_memory_restart: '1G',
    
    // Configurações de monitoramento
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    
    // Configurações de logs
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    
    // Configurações de cron
    cron_restart: '0 2 * * *',  // Restart diário às 2h
  }]
};
```

### Logrotate

```bash
# /etc/logrotate.d/smpp-admin
/opt/smpp-admin/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        pm2 reloadLogs
    endscript
}
```

## 🔄 Configuração de Backup

### Script de Backup

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups"
DB_NAME="smpp_admin"
DB_USER="smpp_user"

# Criar diretório de backup
mkdir -p $BACKUP_DIR

# Backup do banco de dados
pg_dump -h localhost -U $DB_USER $DB_NAME > $BACKUP_DIR/smpp_admin_$DATE.sql

# Backup dos arquivos de configuração
tar -czf $BACKUP_DIR/config_$DATE.tar.gz /opt/smpp-admin/.env /opt/smpp-admin/ecosystem.config.js

# Backup dos logs
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz /opt/smpp-admin/logs/

# Remover backups antigos (mais de 7 dias)
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup concluído: $DATE"
```

### Agendamento de Backup

```bash
# Adicionar ao crontab
0 2 * * * /opt/backups/backup.sh >> /var/log/backup.log 2>&1
```

## 📈 Configuração de Performance

### Node.js

```javascript
// Configurações de performance
process.env.UV_THREADPOOL_SIZE = 128;
process.env.NODE_OPTIONS = '--max-old-space-size=2048';
```

### PostgreSQL

```sql
-- Configurações de performance
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
SELECT pg_reload_conf();
```

### Redis

```conf
# Configurações de performance
maxmemory 256mb
maxmemory-policy allkeys-lru
tcp-keepalive 300
timeout 300
```

## 🔧 Configuração de Desenvolvimento

### Variáveis de Ambiente de Desenvolvimento

```env
# .env.development
NODE_ENV=development
LOG_LEVEL=debug
API_PORT=3000
FRONTEND_URL=http://localhost:3001

# Banco de dados de desenvolvimento
DB_NAME=smpp_admin_dev
DB_USER=smpp_user_dev
DB_PASSWORD=dev_password

# Configurações de debug
DEBUG=smpp:*
SMPP_DEBUG=true
```

### Scripts de Desenvolvimento

```json
{
  "scripts": {
    "dev": "nodemon backend/server.js",
    "dev:frontend": "cd frontend && npm start",
    "dev:full": "concurrently \"npm run dev\" \"npm run dev:frontend\"",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint backend/ frontend/src/",
    "lint:fix": "eslint backend/ frontend/src/ --fix"
  }
}
```

## 🚀 Configuração de Produção

### Variáveis de Ambiente de Produção

```env
# .env.production
NODE_ENV=production
LOG_LEVEL=info
API_PORT=3000
FRONTEND_URL=https://yourdomain.com

# Configurações de segurança
JWT_SECRET=your_super_secret_jwt_key_here
WEBHOOK_SECRET=your_webhook_secret_here

# Configurações de performance
UV_THREADPOOL_SIZE=128
NODE_OPTIONS=--max-old-space-size=2048
```

### Configurações de Produção

```javascript
// Configurações específicas para produção
const productionConfig = {
  // Configurações de segurança
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  },
  
  // Configurações de rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 requisições por IP
  },
  
  // Configurações de CORS
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
};
```

---

**Configuração concluída! 🎉**

O sistema está configurado e pronto para uso em produção.