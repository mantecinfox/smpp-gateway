#!/bin/bash

# Script de instalação do Sistema SMPP para Ubuntu 22.04+
# Autor: Sistema SMPP
# Versão: 1.0

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para imprimir mensagens coloridas
print_message() {
    echo -e "${2}${1}${NC}"
}

# Função para verificar se o usuário é root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_message "❌ Este script não deve ser executado como root!" $RED
        print_message "Execute como usuário normal com sudo quando necessário." $YELLOW
        exit 1
    fi
}

# Função para verificar se o sistema é Ubuntu 22.04+
check_ubuntu_version() {
    if ! command -v lsb_release &> /dev/null; then
        print_message "❌ lsb_release não encontrado. Instalando..." $YELLOW
        sudo apt update && sudo apt install -y lsb-release
    fi
    
    UBUNTU_VERSION=$(lsb_release -rs)
    REQUIRED_VERSION="22.04"
    
    if ! dpkg --compare-versions "$UBUNTU_VERSION" "ge" "$REQUIRED_VERSION"; then
        print_message "❌ Este script requer Ubuntu 22.04 ou superior!" $RED
        print_message "Versão atual: $UBUNTU_VERSION" $YELLOW
        exit 1
    fi
    
    print_message "✅ Ubuntu $UBUNTU_VERSION detectado" $GREEN
}

# Função para atualizar sistema
update_system() {
    print_message "🔄 Atualizando sistema..." $BLUE
    sudo apt update && sudo apt upgrade -y
    print_message "✅ Sistema atualizado" $GREEN
}

# Função para instalar dependências do sistema
install_system_dependencies() {
    print_message "📦 Instalando dependências do sistema..." $BLUE
    
    sudo apt install -y \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        mysql-server \
        redis-server \
        nginx \
        git \
        curl \
        wget \
        unzip \
        build-essential \
        libssl-dev \
        libffi-dev \
        libmysqlclient-dev \
        pkg-config \
        supervisor \
        ufw
    
    print_message "✅ Dependências do sistema instaladas" $GREEN
}

# Função para configurar MySQL
setup_mysql() {
    print_message "🗄️ Configurando MySQL..." $BLUE
    
    # Inicia e habilita MySQL
    sudo systemctl start mysql
    sudo systemctl enable mysql
    
    # Configura MySQL
    sudo mysql -e "CREATE DATABASE IF NOT EXISTS smpp_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    sudo mysql -e "CREATE USER IF NOT EXISTS 'smpp_user'@'localhost' IDENTIFIED BY 'smpp_password';"
    sudo mysql -e "GRANT ALL PRIVILEGES ON smpp_system.* TO 'smpp_user'@'localhost';"
    sudo mysql -e "FLUSH PRIVILEGES;"
    
    # Configura segurança do MySQL
    sudo mysql_secure_installation --use-default
    
    print_message "✅ MySQL configurado" $GREEN
}

# Função para configurar Redis
setup_redis() {
    print_message "🔴 Configurando Redis..." $BLUE
    
    # Inicia e habilita Redis
    sudo systemctl start redis-server
    sudo systemctl enable redis-server
    
    # Configura Redis
    sudo sed -i 's/^# maxmemory <bytes>/maxmemory 256mb/' /etc/redis/redis.conf
    sudo sed -i 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
    
    sudo systemctl restart redis-server
    
    print_message "✅ Redis configurado" $GREEN
}

# Função para criar usuário do sistema
create_system_user() {
    print_message "👤 Criando usuário do sistema..." $BLUE
    
    if ! id "smpp" &>/dev/null; then
        sudo useradd -r -s /bin/false -d /opt/smpp-system smpp
        sudo mkdir -p /opt/smpp-system
        sudo chown smpp:smpp /opt/smpp-system
    fi
    
    print_message "✅ Usuário do sistema criado" $GREEN
}

# Função para instalar aplicação Python
install_python_app() {
    print_message "🐍 Instalando aplicação Python..." $BLUE
    
    # Cria diretório da aplicação
    sudo mkdir -p /opt/smpp-system
    sudo cp -r . /opt/smpp-system/
    sudo chown -R smpp:smpp /opt/smpp-system
    
    # Cria ambiente virtual
    sudo -u smpp python3 -m venv /opt/smpp-system/venv
    
    # Ativa ambiente virtual e instala dependências
    sudo -u smpp /opt/smpp-system/venv/bin/pip install --upgrade pip
    sudo -u smpp /opt/smpp-system/venv/bin/pip install -r /opt/smpp-system/requirements.txt
    
    print_message "✅ Aplicação Python instalada" $GREEN
}

# Função para configurar banco de dados
setup_database() {
    print_message "🗃️ Configurando banco de dados..." $BLUE
    
    cd /opt/smpp-system
    sudo -u smpp /opt/smpp-system/venv/bin/python src/migrate.py
    
    print_message "✅ Banco de dados configurado" $GREEN
}

# Função para criar systemd services
create_systemd_services() {
    print_message "⚙️ Criando systemd services..." $BLUE
    
    # Service para aplicação principal
    sudo tee /etc/systemd/system/smpp-system.service > /dev/null <<EOF
[Unit]
Description=Sistema SMPP - Aplicação Principal
After=network.target mysql.service redis.service
Requires=mysql.service redis.service

[Service]
Type=simple
User=smpp
Group=smpp
WorkingDirectory=/opt/smpp-system
Environment=PATH=/opt/smpp-system/venv/bin
ExecStart=/opt/smpp-system/venv/bin/python src/main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    # Service para worker
    sudo tee /etc/systemd/system/smpp-worker.service > /dev/null <<EOF
[Unit]
Description=Sistema SMPP - Worker de Processamento
After=network.target mysql.service redis.service
Requires=mysql.service redis.service

[Service]
Type=simple
User=smpp
Group=smpp
WorkingDirectory=/opt/smpp-system
Environment=PATH=/opt/smpp-system/venv/bin
ExecStart=/opt/smpp-system/venv/bin/python src/worker.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    # Service para conector SMPP
    sudo tee /etc/systemd/system/smpp-connector.service > /dev/null <<EOF
[Unit]
Description=Sistema SMPP - Conector SMPP
After=network.target mysql.service redis.service
Requires=mysql.service redis.service

[Service]
Type=simple
User=smpp
Group=smpp
WorkingDirectory=/opt/smpp-system
Environment=PATH=/opt/smpp-system/venv/bin
ExecStart=/opt/smpp-system/venv/bin/python src/telecall_client.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    # Recarrega systemd
    sudo systemctl daemon-reload
    
    print_message "✅ Systemd services criados" $GREEN
}

# Função para configurar Nginx
setup_nginx() {
    print_message "🌐 Configurando Nginx..." $BLUE
    
    # Remove configuração padrão
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Cria configuração do sistema SMPP
    sudo tee /etc/nginx/sites-available/smpp-system > /dev/null <<EOF
server {
    listen 80;
    server_name _;
    
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    location /socket.io/ {
        proxy_pass http://127.0.0.1:8000;
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

    # Habilita site
    sudo ln -sf /etc/nginx/sites-available/smpp-system /etc/nginx/sites-enabled/
    
    # Testa configuração
    sudo nginx -t
    
    # Reinicia Nginx
    sudo systemctl restart nginx
    sudo systemctl enable nginx
    
    print_message "✅ Nginx configurado" $GREEN
}

# Função para configurar firewall
setup_firewall() {
    print_message "🔥 Configurando firewall..." $BLUE
    
    # Habilita UFW
    sudo ufw --force enable
    
    # Regras básicas
    sudo ufw allow ssh
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw allow 2875/tcp  # Porta SMPP
    
    print_message "✅ Firewall configurado" $GREEN
}

# Função para iniciar serviços
start_services() {
    print_message "🚀 Iniciando serviços..." $BLUE
    
    # Inicia e habilita serviços
    sudo systemctl start smpp-system
    sudo systemctl enable smpp-system
    
    sudo systemctl start smpp-worker
    sudo systemctl enable smpp-worker
    
    sudo systemctl start smpp-connector
    sudo systemctl enable smpp-connector
    
    # Aguarda serviços iniciarem
    sleep 5
    
    # Verifica status
    sudo systemctl status smpp-system --no-pager -l
    sudo systemctl status smpp-worker --no-pager -l
    sudo systemctl status smpp-connector --no-pager -l
    
    print_message "✅ Serviços iniciados" $GREEN
}

# Função para criar logs
setup_logging() {
    print_message "📝 Configurando logs..." $BLUE
    
    # Cria diretório de logs
    sudo mkdir -p /var/log/smpp-system
    sudo chown smpp:smpp /var/log/smpp-system
    
    # Configura logrotate
    sudo tee /etc/logrotate.d/smpp-system > /dev/null <<EOF
/var/log/smpp-system/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 smpp smpp
    postrotate
        systemctl reload smpp-system smpp-worker smpp-connector
    endscript
}
EOF
    
    print_message "✅ Logs configurados" $GREEN
}

# Função para mostrar informações finais
show_final_info() {
    print_message "🎉 Instalação concluída com sucesso!" $GREEN
    echo
    print_message "📋 Informações de acesso:" $BLUE
    echo "   🌐 URL: http://$(hostname -I | awk '{print $1}')"
    echo "   👤 Usuário: admin"
    echo "   🔑 Senha: admin123"
    echo
    print_message "📊 Status dos serviços:" $BLUE
    echo "   smpp-system: $(sudo systemctl is-active smpp-system)"
    echo "   smpp-worker: $(sudo systemctl is-active smpp-worker)"
    echo "   smpp-connector: $(sudo systemctl is-active smpp-connector)"
    echo
    print_message "🔧 Comandos úteis:" $BLUE
    echo "   sudo systemctl status smpp-system"
    echo "   sudo systemctl restart smpp-system"
    echo "   sudo journalctl -u smpp-system -f"
    echo
    print_message "📁 Diretórios:" $BLUE
    echo "   Aplicação: /opt/smpp-system"
    echo "   Logs: /var/log/smpp-system"
    echo "   Configuração: /opt/smpp-system/.env"
    echo
    print_message "⚠️  IMPORTANTE: Altere a senha padrão do admin!" $YELLOW
}

# Função principal
main() {
    print_message "🚀 Iniciando instalação do Sistema SMPP" $GREEN
    print_message "Sistema: Ubuntu $(lsb_release -rs)" $BLUE
    echo
    
    check_root
    check_ubuntu_version
    update_system
    install_system_dependencies
    setup_mysql
    setup_redis
    create_system_user
    install_python_app
    setup_database
    create_systemd_services
    setup_nginx
    setup_firewall
    setup_logging
    start_services
    show_final_info
}

# Executa função principal
main "$@"