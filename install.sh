#!/bin/bash

# =============================================================================
# SISTEMA DE ADMINISTRAÇÃO SMPP - INSTALAÇÃO AUTOMÁTICA
# Compatível com Ubuntu 22.04+ e CentOS 9/10
# =============================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para log
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}"
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

info() {
    echo -e "${BLUE}[INFO] $1${NC}"
}

# Verificar se é root
if [[ $EUID -eq 0 ]]; then
   error "Este script não deve ser executado como root. Execute como usuário normal."
fi

# Detectar sistema operacional
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
else
    error "Sistema operacional não suportado"
fi

log "Sistema detectado: $OS $VER"

# Verificar compatibilidade
if [[ "$OS" == *"Ubuntu"* ]] && [[ "$VER" == "22.04" || "$VER" == "24.04" ]]; then
    DISTRO="ubuntu"
elif [[ "$OS" == *"CentOS"* ]] && [[ "$VER" == "9" || "$VER" == "10" ]]; then
    DISTRO="centos"
else
    error "Sistema operacional não suportado. Use Ubuntu 22.04+ ou CentOS 9/10"
fi

log "Iniciando instalação para $DISTRO..."

# Atualizar sistema
log "Atualizando sistema..."
if [ "$DISTRO" = "ubuntu" ]; then
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y curl wget git build-essential software-properties-common
elif [ "$DISTRO" = "centos" ]; then
    sudo dnf update -y
    sudo dnf install -y curl wget git gcc gcc-c++ make
fi

# Instalar Node.js 20.x
log "Instalando Node.js 20.x..."
if [ "$DISTRO" = "ubuntu" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
elif [ "$DISTRO" = "centos" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs
fi

# Verificar instalação do Node.js
node_version=$(node --version)
npm_version=$(npm --version)
log "Node.js instalado: $node_version"
log "NPM instalado: $npm_version"

# Instalar PostgreSQL
log "Instalando PostgreSQL..."
if [ "$DISTRO" = "ubuntu" ]; then
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
elif [ "$DISTRO" = "centos" ]; then
    sudo dnf install -y postgresql-server postgresql-contrib
    sudo postgresql-setup --initdb
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
fi

# Instalar Redis
log "Instalando Redis..."
if [ "$DISTRO" = "ubuntu" ]; then
    sudo apt install -y redis-server
    sudo systemctl start redis-server
    sudo systemctl enable redis-server
elif [ "$DISTRO" = "centos" ]; then
    sudo dnf install -y redis
    sudo systemctl start redis
    sudo systemctl enable redis
fi

# Instalar PM2 globalmente
log "Instalando PM2..."
sudo npm install -g pm2

# Instalar Nginx
log "Instalando Nginx..."
if [ "$DISTRO" = "ubuntu" ]; then
    sudo apt install -y nginx
elif [ "$DISTRO" = "centos" ]; then
    sudo dnf install -y nginx
fi

# Configurar PostgreSQL
log "Configurando PostgreSQL..."
sudo -u postgres psql -c "CREATE DATABASE smpp_admin;"
sudo -u postgres psql -c "CREATE USER smpp_user WITH PASSWORD 'smpp_password_2024';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE smpp_admin TO smpp_user;"
sudo -u postgres psql -c "ALTER USER smpp_user CREATEDB;"

# Criar diretório do projeto
PROJECT_DIR="/opt/smpp-admin"
log "Criando diretório do projeto: $PROJECT_DIR"
sudo mkdir -p $PROJECT_DIR
sudo chown $USER:$USER $PROJECT_DIR

# Copiar arquivos do projeto
log "Copiando arquivos do projeto..."
cp -r . $PROJECT_DIR/
cd $PROJECT_DIR

# Instalar dependências do backend
log "Instalando dependências do backend..."
cd backend
npm install

# Instalar dependências do frontend
log "Instalando dependências do frontend..."
cd ../frontend
npm install

# Build do frontend
log "Fazendo build do frontend..."
npm run build

# Voltar para o diretório raiz
cd ..

# Configurar variáveis de ambiente
log "Configurando variáveis de ambiente..."
cat > .env << EOF
# Configurações do Banco de Dados
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smpp_admin
DB_USER=smpp_user
DB_PASSWORD=smpp_password_2024

# Configurações do Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Configurações do SMPP
SMPP_HOST=198.54.166.74
SMPP_PORT=2875
SMPP_SYSTEM_ID=WhatsInfo_otp
SMPP_PASSWORD=juebkiur
SMPP_SYSTEM_TYPE=
SMPP_TON=1
SMPP_NPI=1
SMPP_ADDRESS_RANGE=

# Configurações da API
API_PORT=3000
JWT_SECRET=smpp_admin_jwt_secret_2024
WEBHOOK_SECRET=smpp_webhook_secret_2024

# Configurações do Frontend
FRONTEND_URL=http://localhost:3001
EOF

# Configurar Nginx
log "Configurando Nginx..."
sudo tee /etc/nginx/sites-available/smpp-admin << EOF
server {
    listen 80;
    server_name localhost;

    # Frontend
    location / {
        root $PROJECT_DIR/frontend/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # API Backend
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket para tempo real
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Ativar site no Nginx
sudo ln -sf /etc/nginx/sites-available/smpp-admin /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# Configurar PM2
log "Configurando PM2..."
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'smpp-admin-backend',
    script: './backend/server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOF

# Criar diretório de logs
mkdir -p logs

# Iniciar aplicação
log "Iniciando aplicação..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Configurar firewall
log "Configurando firewall..."
if [ "$DISTRO" = "ubuntu" ]; then
    sudo ufw allow 80
    sudo ufw allow 443
    sudo ufw allow 3000
elif [ "$DISTRO" = "centos" ]; then
    sudo firewall-cmd --permanent --add-port=80/tcp
    sudo firewall-cmd --permanent --add-port=443/tcp
    sudo firewall-cmd --permanent --add-port=3000/tcp
    sudo firewall-cmd --reload
fi

# Verificar status dos serviços
log "Verificando status dos serviços..."
sudo systemctl status postgresql --no-pager
sudo systemctl status redis --no-pager
sudo systemctl status nginx --no-pager
pm2 status

# Testar conectividade
log "Testando conectividade..."
sleep 5
curl -s http://localhost:3000/api/health || warning "API não respondeu"
curl -s http://localhost:80 || warning "Frontend não respondeu"

log "=========================================="
log "INSTALAÇÃO CONCLUÍDA COM SUCESSO!"
log "=========================================="
log "Acesso: http://localhost"
log "API: http://localhost:3000/api"
log "Logs: pm2 logs smpp-admin-backend"
log "Status: pm2 status"
log "=========================================="
log "Credenciais padrão:"
log "Admin: admin@smpp.com / admin123"
log "=========================================="