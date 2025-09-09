# 📋 Guia de Instalação Detalhado

## 🚀 Instalação Automática (Recomendada)

### Pré-requisitos
- Ubuntu 22.04+ ou CentOS 9/10
- Acesso root ou sudo
- Conexão com internet
- Mínimo 2GB RAM
- Mínimo 20GB espaço em disco

### Passo a Passo

1. **Baixar o projeto**
```bash
git clone <repository-url>
cd smpp-admin
```

2. **Executar instalação automática**
```bash
chmod +x install.sh
./install.sh
```

3. **Aguardar conclusão**
- O script instalará todas as dependências
- Configurará o banco de dados
- Criará 500 DIDs de exemplo
- Iniciará todos os serviços

4. **Acessar o sistema**
- Frontend: http://localhost
- API: http://localhost:3000/api
- Login: admin@smpp.com / admin123

## 🔧 Instalação Manual

### 1. Instalar Dependências do Sistema

#### Ubuntu 22.04+
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências básicas
sudo apt install -y curl wget git build-essential software-properties-common

# Instalar Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Instalar Redis
sudo apt install -y redis-server

# Instalar Nginx
sudo apt install -y nginx

# Instalar PM2
sudo npm install -g pm2
```

#### CentOS 9/10
```bash
# Atualizar sistema
sudo dnf update -y

# Instalar dependências básicas
sudo dnf install -y curl wget git gcc gcc-c++ make

# Instalar Node.js 20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Instalar PostgreSQL
sudo dnf install -y postgresql-server postgresql-contrib

# Instalar Redis
sudo dnf install -y redis

# Instalar Nginx
sudo dnf install -y nginx

# Instalar PM2
sudo npm install -g pm2
```

### 2. Configurar Banco de Dados

```bash
# Inicializar PostgreSQL (CentOS)
sudo postgresql-setup --initdb

# Iniciar PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Criar banco e usuário
sudo -u postgres psql -c "CREATE DATABASE smpp_admin;"
sudo -u postgres psql -c "CREATE USER smpp_user WITH PASSWORD 'smpp_password_2024';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE smpp_admin TO smpp_user;"
sudo -u postgres psql -c "ALTER USER smpp_user CREATEDB;"
```

### 3. Configurar Redis

```bash
# Iniciar Redis
sudo systemctl start redis
sudo systemctl enable redis

# Verificar status
redis-cli ping
```

### 4. Configurar Aplicação

```bash
# Instalar dependências do backend
cd backend
npm install

# Instalar dependências do frontend
cd ../frontend
npm install

# Build do frontend
npm run build

# Voltar para o diretório raiz
cd ..
```

### 5. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar configurações
nano .env
```

Configurações importantes no `.env`:
```env
# Banco de Dados
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smpp_admin
DB_USER=smpp_user
DB_PASSWORD=smpp_password_2024

# SMPP
SMPP_HOST=198.54.166.74
SMPP_PORT=2875
SMPP_SYSTEM_ID=WhatsInfo_otp
SMPP_PASSWORD=juebkiur

# API
API_PORT=3000
JWT_SECRET=smpp_admin_jwt_secret_2024
```

### 6. Executar Migrações

```bash
cd backend
npm run migrate
```

### 7. Configurar Nginx

```bash
# Copiar configuração
sudo cp nginx.conf /etc/nginx/sites-available/smpp-admin

# Ativar site
sudo ln -s /etc/nginx/sites-available/smpp-admin /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Testar configuração
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

### 8. Iniciar Aplicação

```bash
# Iniciar com PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Verificar status
pm2 status
```

## 🔍 Verificação da Instalação

### 1. Verificar Serviços
```bash
# PostgreSQL
sudo systemctl status postgresql

# Redis
sudo systemctl status redis

# Nginx
sudo systemctl status nginx

# PM2
pm2 status
```

### 2. Testar Conectividade
```bash
# API
curl http://localhost:3000/api/health

# Frontend
curl http://localhost
```

### 3. Verificar Logs
```bash
# Logs da aplicação
pm2 logs smpp-admin-backend

# Logs do Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 🐛 Solução de Problemas

### Problema: Erro de Conexão SMPP
```bash
# Verificar conectividade
telnet 198.54.166.74 2875

# Verificar logs
pm2 logs smpp-admin-backend | grep SMPP
```

### Problema: Erro de Banco de Dados
```bash
# Verificar status
sudo systemctl status postgresql

# Verificar conexão
psql -h localhost -U smpp_user -d smpp_admin

# Verificar logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Problema: Frontend não carrega
```bash
# Verificar build
cd frontend && npm run build

# Verificar Nginx
sudo nginx -t
sudo systemctl status nginx

# Verificar permissões
sudo chown -R www-data:www-data /opt/smpp-admin/frontend/dist
```

### Problema: API não responde
```bash
# Verificar PM2
pm2 status
pm2 restart smpp-admin-backend

# Verificar porta
netstat -tlnp | grep 3000

# Verificar logs
pm2 logs smpp-admin-backend
```

## 📊 Pós-Instalação

### 1. Configurar Firewall
```bash
# Ubuntu
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 3000

# CentOS
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### 2. Configurar Backup
```bash
# Criar script de backup
cat > backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -h localhost -U smpp_user smpp_admin > /opt/backups/smpp_admin_$DATE.sql
find /opt/backups -name "smpp_admin_*.sql" -mtime +7 -delete
EOF

chmod +x backup.sh

# Agendar backup diário
echo "0 2 * * * /opt/backups/backup.sh" | sudo crontab -
```

### 3. Configurar Monitoramento
```bash
# Instalar htop
sudo apt install htop  # Ubuntu
sudo dnf install htop  # CentOS

# Monitorar recursos
htop
pm2 monit
```

## 🔄 Atualizações

### Atualizar Aplicação
```bash
# Parar aplicação
pm2 stop smpp-admin-backend

# Atualizar código
git pull

# Atualizar dependências
cd backend && npm install
cd ../frontend && npm install && npm run build

# Reiniciar aplicação
pm2 restart smpp-admin-backend
```

### Atualizar Sistema
```bash
# Ubuntu
sudo apt update && sudo apt upgrade -y

# CentOS
sudo dnf update -y
```

## 📞 Suporte

Se encontrar problemas durante a instalação:

1. Verifique os logs: `pm2 logs smpp-admin-backend`
2. Verifique a conectividade: `curl http://localhost:3000/api/health`
3. Verifique os serviços: `sudo systemctl status postgresql redis nginx`
4. Consulte a documentação: [README.md](../README.md)
5. Abra uma issue no GitHub

---

**Instalação concluída! 🎉**

Acesse http://localhost e faça login com admin@smpp.com / admin123