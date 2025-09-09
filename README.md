# 🚀 Sistema de Administração SMPP

Sistema completo para administração de mensagens SMS via protocolo SMPP, com interface web moderna e APIs REST.

## ✨ Funcionalidades

### 🔧 Administração Central
- ✅ Conexão SMPP com servidor externo
- ✅ Recebimento e processamento de mensagens em tempo real
- ✅ Identificação automática de plataformas (20+ suportadas)
- ✅ Sistema de roteamento por DID
- ✅ Dashboard com estatísticas em tempo real
- ✅ Gerenciamento de usuários e permissões

### 👥 Sistema de Clientes
- ✅ Cadastro e autenticação de clientes
- ✅ Aquisição e gerenciamento de DIDs
- ✅ Recebimento de SMS por plataforma
- ✅ Ativação/bloqueio de serviços
- ✅ Interface web intuitiva

### 🔌 APIs e Integrações
- ✅ API REST completa
- ✅ Webhooks configuráveis
- ✅ Autenticação JWT
- ✅ Rate limiting
- ✅ Documentação automática

### 📱 Plataformas Suportadas
- WhatsApp, Telegram, Instagram, Facebook
- Twitter (X), Google/Gmail, TikTok, Kwai
- OLX, iFood, 99, Uber, PicPay
- Mercado Livre, Nubank, Banco Inter
- Magalu, AliExpress, Amazon, LinkedIn

## 🛠️ Tecnologias

### Backend
- **Node.js** + Express
- **PostgreSQL** + Redis
- **Socket.IO** (tempo real)
- **JWT** (autenticação)
- **SMPP** (protocolo SMS)

### Frontend
- **React 18** + Material-UI
- **React Router** + React Query
- **Socket.IO Client** (tempo real)
- **Recharts** (gráficos)

### Infraestrutura
- **Nginx** (proxy reverso)
- **PM2** (gerenciamento de processos)
- **Docker** (containerização)
- **Ubuntu 22.04+** / **CentOS 9/10**

## 🚀 Instalação Rápida

### Pré-requisitos
- Ubuntu 22.04+ ou CentOS 9/10
- Acesso root ou sudo
- Conexão com internet

### 1. Download e Execução
```bash
# Baixar o projeto
git clone <repository-url>
cd smpp-admin

# Tornar o script executável
chmod +x install.sh

# Executar instalação automática
./install.sh
```

### 2. Acesso ao Sistema
Após a instalação, acesse:
- **Frontend**: http://localhost
- **API**: http://localhost:3000/api
- **Admin**: admin@smpp.com / admin123

## 📋 Instalação Manual

### 1. Instalar Dependências

#### Ubuntu 22.04+
```bash
# Atualizar sistema
sudo apt update && sudo apt upgrade -y

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
# Inicializar PostgreSQL
sudo -u postgres psql -c "CREATE DATABASE smpp_admin;"
sudo -u postgres psql -c "CREATE USER smpp_user WITH PASSWORD 'smpp_password_2024';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE smpp_admin TO smpp_user;"
```

### 3. Configurar Aplicação
```bash
# Instalar dependências
cd backend && npm install
cd ../frontend && npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas configurações

# Executar migrações
cd backend && npm run migrate

# Build do frontend
cd ../frontend && npm run build
```

### 4. Iniciar Serviços
```bash
# Iniciar com PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Configurar Nginx
sudo cp nginx.conf /etc/nginx/sites-available/smpp-admin
sudo ln -s /etc/nginx/sites-available/smpp-admin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## ⚙️ Configuração

### Variáveis de Ambiente (.env)
```env
# Banco de Dados
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

# API
API_PORT=3000
JWT_SECRET=smpp_admin_jwt_secret_2024
WEBHOOK_SECRET=smpp_webhook_secret_2024
```

### Configuração SMPP
O sistema está pré-configurado para conectar com:
- **Host**: 198.54.166.74
- **Porta**: 2875
- **Sistema**: WhatsInfo_otp
- **Modo**: Transceiver

## 📊 Uso do Sistema

### 1. Login Administrativo
- **Email**: admin@smpp.com
- **Senha**: admin123

### 2. Gerenciar DIDs
1. Acesse "DIDs" no menu
2. Clique em "Criar DIDs" para adicionar números
3. Atribua DIDs aos clientes
4. Configure plataformas permitidas

### 3. Gerenciar Clientes
1. Acesse "Usuários" (admin)
2. Crie contas de clientes
3. Atribua DIDs aos clientes
4. Configure permissões

### 4. Monitorar Mensagens
1. Acesse "Mensagens"
2. Visualize mensagens em tempo real
3. Filtre por plataforma, status, data
4. Processe mensagens recebidas

## 🔌 API REST

### Autenticação
```bash
# Login
POST /api/auth/login
{
  "email": "admin@smpp.com",
  "password": "admin123"
}

# Usar token
Authorization: Bearer <token>
```

### Endpoints Principais
```bash
# Mensagens
GET /api/messages
POST /api/messages
PUT /api/messages/:id/process

# DIDs
GET /api/dids
POST /api/dids
PUT /api/dids/:id/assign

# Plataformas
GET /api/platforms
POST /api/platforms
PUT /api/platforms/:id

# Webhooks
POST /api/webhooks/test
GET /api/webhooks/active
```

## 🔧 Manutenção

### Logs
```bash
# Ver logs da aplicação
pm2 logs smpp-admin-backend

# Ver logs do Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Ver logs do PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Backup
```bash
# Backup do banco
pg_dump -h localhost -U smpp_user smpp_admin > backup.sql

# Restaurar backup
psql -h localhost -U smpp_user smpp_admin < backup.sql
```

### Atualizações
```bash
# Atualizar aplicação
git pull
cd backend && npm install
cd ../frontend && npm install && npm run build
pm2 restart smpp-admin-backend
```

## 🐛 Solução de Problemas

### Problemas Comuns

#### 1. Erro de Conexão SMPP
```bash
# Verificar conectividade
telnet 198.54.166.74 2875

# Verificar logs
pm2 logs smpp-admin-backend | grep SMPP
```

#### 2. Erro de Banco de Dados
```bash
# Verificar status do PostgreSQL
sudo systemctl status postgresql

# Verificar conexão
psql -h localhost -U smpp_user -d smpp_admin
```

#### 3. Erro de Frontend
```bash
# Verificar build
cd frontend && npm run build

# Verificar Nginx
sudo nginx -t
sudo systemctl status nginx
```

### Logs de Debug
```bash
# Ativar logs detalhados
export LOG_LEVEL=debug
pm2 restart smpp-admin-backend
```

## 📈 Monitoramento

### Métricas Importantes
- **Mensagens por minuto**: Volume de SMS recebidos
- **Taxa de processamento**: % de mensagens processadas
- **DIDs ativos**: Número de DIDs em uso
- **Usuários online**: Clientes conectados

### Alertas
- Falha na conexão SMPP
- Erro de processamento de mensagens
- DIDs expirados
- Uso excessivo de recursos

## 🔒 Segurança

### Medidas Implementadas
- ✅ Autenticação JWT
- ✅ Rate limiting
- ✅ Validação de entrada
- ✅ Sanitização de dados
- ✅ HTTPS (recomendado)
- ✅ Firewall configurado

### Recomendações
1. Use HTTPS em produção
2. Configure firewall adequadamente
3. Mantenha senhas seguras
4. Monitore logs regularmente
5. Faça backups regulares

## 📞 Suporte

### Documentação
- [API Documentation](docs/api.md)
- [Deployment Guide](docs/deployment.md)
- [Troubleshooting](docs/troubleshooting.md)

### Contato
- **Email**: suporte@smpp-admin.com
- **GitHub**: [Issues](https://github.com/smpp-admin/issues)

## 📄 Licença

MIT License - veja [LICENSE](LICENSE) para detalhes.

---

## 🎯 Resumo da Instalação

**Tempo estimado**: 15-30 minutos
**Complexidade**: Baixa (script automático)
**Requisitos**: Ubuntu 22.04+ ou CentOS 9/10

### Passos Rápidos:
1. `chmod +x install.sh`
2. `./install.sh`
3. Acesse http://localhost
4. Login: admin@smpp.com / admin123

**Sistema pronto para uso! 🚀**