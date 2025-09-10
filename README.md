# Sistema SMPP Completo

Sistema completo de gestão SMPP com MySQL/MariaDB, Redis, Flask/Socket.IO, dashboard Matrix Admin, administração de clientes/serviços/DIDs/SMSC, webhook de ingestão, conector SMPP opcional, roteamento por DID, push por cliente via webhook e smoke test.

## 🚀 Características Principais

- **Backend**: Flask + Socket.IO + SQLAlchemy + MySQL/MariaDB
- **Cache/Fila**: Redis para streaming e mensagens
- **Frontend**: Templates HTML com AdminLTE (Bootstrap 5)
- **Protocolo SMPP**: smpplib para conexões SMPP
- **Processamento Assíncrono**: Workers em background
- **Deploy**: Systemd services + Gunicorn
- **Classificação Automática**: Detecção de serviços baseada em regex
- **Webhook Push**: Notificação de clientes via webhook
- **Dashboard Admin**: Interface completa de administração

## 📋 Pré-requisitos

- Ubuntu 22.04 ou superior
- Acesso root/sudo
- Conexão com internet
- Pelo menos 2GB de RAM
- 10GB de espaço em disco

## 🛠️ Instalação Rápida

1. **Clone o repositório:**
```bash
git clone <repository-url>
cd sistema-smpp
```

2. **Execute o script de instalação:**
```bash
chmod +x instalar.sh
./instalar.sh
```

3. **Acesse o sistema:**
- URL: `http://seu-ip`
- Usuário: `admin`
- Senha: `admin123`

## 📁 Estrutura do Projeto

```
sistema-smpp/
├── src/
│   ├── main.py              # Aplicação Flask principal
│   ├── models.py            # Modelos SQLAlchemy
│   ├── migrate.py           # Migrações e setup do banco
│   ├── worker.py            # Worker para processamento assíncrono
│   ├── smpp_connector.py    # Conector SMPP genérico
│   ├── telecall_client.py   # Cliente SMPP específico para Telecall
│   └── classifier.py        # Sistema de classificação automática
├── templates/               # Templates HTML com AdminLTE
├── requirements.txt         # Dependências Python
├── .env                    # Variáveis de ambiente
├── instalar.sh             # Script de instalação
└── README.md               # Este arquivo
```

## 🔧 Configuração

### Variáveis de Ambiente (.env)

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=smpp_system
DB_USER=smpp_user
DB_PASSWORD=smpp_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# SMPP Configuration
SMPP_HOST=198.54.166.74
SMPP_PORT=2875
SMPP_USERNAME=WhatsInfo_otp
SMPP_PASSWORD=juebkiur
SMPP_SYSTEM_TYPE=OTP

# Application Configuration
FLASK_ENV=production
SECRET_KEY=your-secret-key-change-this
WEBHOOK_SECRET=webhook-secret-key
API_KEY_PREFIX=sk_

# Server Configuration
HOST=0.0.0.0
PORT=8000
WORKERS=4
```

## 🗄️ Banco de Dados

### Modelos Principais

- **Users**: Administradores do sistema
- **Clients**: Clientes com API keys e webhooks
- **Services**: Serviços de detecção (WhatsApp, Gmail, etc)
- **PhoneNumber**: DIDs/números telefônicos
- **Message**: Mensagens recebidas/enviadas
- **MessageDelivery**: Entregas para clientes
- **SMSCConfig**: Configurações SMSC
- **SystemLog**: Logs do sistema

### Setup do Banco

```bash
cd /opt/smpp-system
sudo -u smpp /opt/smpp-system/venv/bin/python src/migrate.py
```

## 🔌 API REST

### Endpoints Principais

- `GET /api/v1/messages` - Consulta de mensagens por cliente
- `POST /api/v1/mo` - Recebimento de MO/DLR da Telecall
- `POST /api/v1/send` - Envio de SMS
- `POST /webhook/sms` - Webhook genérico para ingestão

### Exemplo de Uso da API

```bash
# Consultar mensagens
curl -H "X-API-Key: sk_1234567890abcdef" \
  "http://localhost:8000/api/v1/messages"

# Enviar SMS
curl -X POST \
  -H "X-API-Key: sk_1234567890abcdef" \
  -H "Content-Type: application/json" \
  -d '{"destination_addr": "5511999999999", "short_message": "Teste"}' \
  "http://localhost:8000/api/v1/send"
```

## 🔄 Fluxos Principais

### Fluxo de Mensagem Recebida

1. Mensagem recebida via SMPP/Webhook/API
2. Armazenamento no MySQL/MariaDB
3. Classificação automática por serviço
4. Roteamento por DID para cliente específico
5. Push via webhook para cliente (se configurado)

### Fluxo Administrativo

1. Login via interface web
2. Gestão de clientes e configuração de webhooks
3. Administração de DIDs e serviços
4. Configuração de conectores SMPP
5. Monitoramento em tempo real

## 🎯 Serviços Pré-configurados

- **WhatsApp**: `(?i)(whatsapp|wa\.me|whats)`
- **Gmail**: `(?i)(gmail|google|g\.co)`
- **Telegram**: `(?i)(telegram|t\.me|tg)`
- **Instagram**: `(?i)(instagram|insta|ig)`
- **TikTok**: `(?i)(tiktok|tt)`
- **Kwai**: `(?i)(kwai)`
- **Facebook**: `(?i)(facebook|fb\.com|meta)`
- **Banco Inter**: `(?i)(banco\s*inter|inter)`
- **Amazon**: `(?i)(amazon|aws)`

## 🚀 Serviços Systemd

### Gerenciamento

```bash
# Status dos serviços
sudo systemctl status smpp-system
sudo systemctl status smpp-worker
sudo systemctl status smpp-connector

# Reiniciar serviços
sudo systemctl restart smpp-system
sudo systemctl restart smpp-worker
sudo systemctl restart smpp-connector

# Logs em tempo real
sudo journalctl -u smpp-system -f
sudo journalctl -u smpp-worker -f
sudo journalctl -u smpp-connector -f
```

### Serviços Disponíveis

- `smpp-system`: Aplicação Flask principal
- `smpp-worker`: Worker de processamento assíncrono
- `smpp-connector`: Conector SMPP (Telecall)

## 📊 Monitoramento

### Dashboard Admin

- Estatísticas em tempo real
- Gestão de clientes, serviços e DIDs
- Visualização de mensagens
- Logs do sistema

### Logs

- **Aplicação**: `/var/log/smpp-system/app.log`
- **Systemd**: `journalctl -u smpp-*`
- **Nginx**: `/var/log/nginx/`

## 🔧 Manutenção

### Backup do Banco

```bash
mysqldump -u smpp_user -p smpp_system > backup_$(date +%Y%m%d).sql
```

### Atualização

```bash
cd /opt/smpp-system
sudo -u smpp git pull
sudo -u smpp /opt/smpp-system/venv/bin/pip install -r requirements.txt
sudo systemctl restart smpp-system smpp-worker smpp-connector
```

### Limpeza de Logs

```bash
sudo logrotate -f /etc/logrotate.d/smpp-system
```

## 🛡️ Segurança

### Configurações Recomendadas

1. **Altere senhas padrão:**
   - Admin: `admin123` → senha forte
   - MySQL: `smpp_password` → senha forte
   - API Keys: Gere novas chaves

2. **Configure SSL/TLS:**
   - Certificado SSL para HTTPS
   - Redirecionamento HTTP → HTTPS

3. **Firewall:**
   - Apenas portas necessárias abertas
   - Restrição de acesso por IP

## 🐛 Troubleshooting

### Problemas Comuns

1. **Serviço não inicia:**
   ```bash
   sudo journalctl -u smpp-system -n 50
   ```

2. **Erro de conexão MySQL:**
   ```bash
   sudo systemctl status mysql
   mysql -u smpp_user -p smpp_system
   ```

3. **Erro de conexão Redis:**
   ```bash
   sudo systemctl status redis-server
   redis-cli ping
   ```

4. **Problemas de permissão:**
   ```bash
   sudo chown -R smpp:smpp /opt/smpp-system
   ```

## 📞 Suporte

Para suporte e dúvidas:

1. Verifique os logs do sistema
2. Consulte a documentação da API
3. Verifique o status dos serviços
4. Consulte os issues do projeto

## 📄 Licença

Este projeto está sob licença MIT. Veja o arquivo LICENSE para mais detalhes.

## 🤝 Contribuição

Contribuições são bem-vindas! Por favor:

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

---

**Sistema SMPP Completo** - Desenvolvido para gestão profissional de mensagens SMS via protocolo SMPP.