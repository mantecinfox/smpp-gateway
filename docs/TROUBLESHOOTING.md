# 🐛 Guia de Solução de Problemas

## 🔍 Problemas Comuns

### 1. Erro de Conexão SMPP

#### Sintomas
- Mensagens não são recebidas
- Logs mostram "Erro na conexão SMPP"
- Status do serviço mostra "Desconectado"

#### Soluções

**Verificar conectividade:**
```bash
# Testar conexão com o servidor SMPP
telnet 198.54.166.74 2875

# Verificar se a porta está aberta
nmap -p 2875 198.54.166.74
```

**Verificar logs:**
```bash
# Logs da aplicação
pm2 logs smpp-admin-backend | grep SMPP

# Logs detalhados
export LOG_LEVEL=debug
pm2 restart smpp-admin-backend
```

**Verificar configurações:**
```bash
# Verificar arquivo .env
cat .env | grep SMPP

# Testar configuração
node -e "
const config = require('./backend/config/smpp');
console.log('Configuração SMPP:', config);
"
```

**Possíveis causas:**
- Firewall bloqueando a porta 2875
- Credenciais SMPP incorretas
- Servidor SMPP indisponível
- Configuração de rede incorreta

### 2. Erro de Banco de Dados

#### Sintomas
- Aplicação não inicia
- Erro "ECONNREFUSED" nos logs
- Timeout ao conectar no banco

#### Soluções

**Verificar status do PostgreSQL:**
```bash
# Status do serviço
sudo systemctl status postgresql

# Iniciar se necessário
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verificar logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

**Testar conexão:**
```bash
# Conectar diretamente
psql -h localhost -U smpp_user -d smpp_admin

# Verificar configurações
sudo -u postgres psql -c "SELECT * FROM pg_settings WHERE name = 'listen_addresses';"
```

**Verificar configurações:**
```bash
# Arquivo de configuração
sudo nano /etc/postgresql/*/main/postgresql.conf

# Verificar se está escutando em localhost
grep listen_addresses /etc/postgresql/*/main/postgresql.conf
```

**Recriar banco se necessário:**
```bash
# Parar aplicação
pm2 stop smpp-admin-backend

# Recriar banco
sudo -u postgres psql -c "DROP DATABASE IF EXISTS smpp_admin;"
sudo -u postgres psql -c "CREATE DATABASE smpp_admin;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE smpp_admin TO smpp_user;"

# Executar migrações
cd backend && npm run migrate

# Reiniciar aplicação
pm2 start smpp-admin-backend
```

### 3. Erro de Frontend

#### Sintomas
- Página não carrega
- Erro 404 no frontend
- Assets não encontrados

#### Soluções

**Verificar build:**
```bash
# Fazer build do frontend
cd frontend
npm run build

# Verificar se os arquivos foram gerados
ls -la dist/
```

**Verificar Nginx:**
```bash
# Testar configuração
sudo nginx -t

# Verificar logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Verificar se o site está ativo
sudo nginx -s reload
```

**Verificar permissões:**
```bash
# Verificar permissões dos arquivos
ls -la /opt/smpp-admin/frontend/dist/

# Corrigir permissões se necessário
sudo chown -R www-data:www-data /opt/smpp-admin/frontend/dist/
sudo chmod -R 755 /opt/smpp-admin/frontend/dist/
```

**Verificar configuração do Nginx:**
```bash
# Verificar arquivo de configuração
sudo cat /etc/nginx/sites-available/smpp-admin

# Verificar se o site está habilitado
ls -la /etc/nginx/sites-enabled/
```

### 4. Erro de Redis

#### Sintomas
- Aplicação lenta
- Erro "Redis connection failed"
- Cache não funciona

#### Soluções

**Verificar status do Redis:**
```bash
# Status do serviço
sudo systemctl status redis

# Iniciar se necessário
sudo systemctl start redis
sudo systemctl enable redis

# Testar conexão
redis-cli ping
```

**Verificar configuração:**
```bash
# Arquivo de configuração
sudo nano /etc/redis/redis.conf

# Verificar se está escutando em localhost
grep bind /etc/redis/redis.conf
```

**Limpar cache se necessário:**
```bash
# Limpar todos os dados
redis-cli FLUSHALL

# Reiniciar aplicação
pm2 restart smpp-admin-backend
```

### 5. Erro de Memória

#### Sintomas
- Aplicação trava
- Erro "out of memory"
- Sistema lento

#### Soluções

**Verificar uso de memória:**
```bash
# Uso de memória do sistema
free -h

# Uso de memória por processo
ps aux --sort=-%mem | head -10

# Uso de memória do PM2
pm2 monit
```

**Configurar limite de memória:**
```bash
# Editar ecosystem.config.js
nano ecosystem.config.js

# Adicionar configuração de memória
max_memory_restart: '1G'
```

**Otimizar PostgreSQL:**
```sql
-- Conectar ao PostgreSQL
sudo -u postgres psql

-- Verificar configurações de memória
SHOW shared_buffers;
SHOW effective_cache_size;
SHOW work_mem;

-- Ajustar configurações
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
SELECT pg_reload_conf();
```

### 6. Erro de Permissões

#### Sintomas
- Erro "Permission denied"
- Arquivos não podem ser criados
- Aplicação não inicia

#### Soluções

**Verificar permissões:**
```bash
# Verificar permissões do diretório
ls -la /opt/smpp-admin/

# Corrigir permissões
sudo chown -R $USER:$USER /opt/smpp-admin/
sudo chmod -R 755 /opt/smpp-admin/
```

**Verificar usuário do PM2:**
```bash
# Verificar usuário do PM2
pm2 show smpp-admin-backend

# Reiniciar com usuário correto
pm2 delete smpp-admin-backend
pm2 start ecosystem.config.js
```

### 7. Erro de Porta em Uso

#### Sintomas
- Erro "EADDRINUSE"
- Aplicação não inicia
- Porta 3000 ocupada

#### Soluções

**Verificar processo usando a porta:**
```bash
# Verificar qual processo está usando a porta
sudo lsof -i :3000

# Matar processo se necessário
sudo kill -9 <PID>
```

**Usar porta diferente:**
```bash
# Editar .env
nano .env

# Alterar porta
API_PORT=3001

# Reiniciar aplicação
pm2 restart smpp-admin-backend
```

## 🔧 Comandos de Diagnóstico

### Verificar Status dos Serviços
```bash
# Status geral
sudo systemctl status postgresql redis nginx

# Status do PM2
pm2 status
pm2 monit

# Logs em tempo real
pm2 logs smpp-admin-backend --lines 100
```

### Verificar Conectividade
```bash
# Testar API
curl -I http://localhost:3000/api/health

# Testar frontend
curl -I http://localhost

# Testar banco
psql -h localhost -U smpp_user -d smpp_admin -c "SELECT 1;"

# Testar Redis
redis-cli ping
```

### Verificar Logs
```bash
# Logs da aplicação
pm2 logs smpp-admin-backend

# Logs do sistema
sudo journalctl -u postgresql -f
sudo journalctl -u redis -f
sudo journalctl -u nginx -f

# Logs do Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Verificar Recursos
```bash
# Uso de CPU e memória
htop

# Uso de disco
df -h

# Uso de rede
netstat -tulpn

# Processos do Node.js
ps aux | grep node
```

## 🚨 Problemas Críticos

### Sistema Não Inicia

1. **Verificar logs de erro:**
```bash
pm2 logs smpp-admin-backend --err
```

2. **Verificar dependências:**
```bash
cd backend && npm install
cd ../frontend && npm install
```

3. **Verificar configurações:**
```bash
# Verificar .env
cat .env

# Verificar banco
psql -h localhost -U smpp_user -d smpp_admin -c "SELECT 1;"
```

4. **Reiniciar tudo:**
```bash
pm2 delete all
pm2 start ecosystem.config.js
```

### Perda de Dados

1. **Verificar backup:**
```bash
ls -la /opt/backups/
```

2. **Restaurar backup:**
```bash
# Parar aplicação
pm2 stop smpp-admin-backend

# Restaurar banco
psql -h localhost -U smpp_user -d smpp_admin < /opt/backups/smpp_admin_YYYYMMDD_HHMMSS.sql

# Reiniciar aplicação
pm2 start smpp-admin-backend
```

### Ataque de Segurança

1. **Verificar logs suspeitos:**
```bash
sudo tail -f /var/log/nginx/access.log | grep -E "(40[0-9]|50[0-9])"
```

2. **Bloquear IPs suspeitos:**
```bash
# Adicionar ao firewall
sudo ufw deny from <IP_SUSPEITO>

# Bloquear no Nginx
sudo nano /etc/nginx/sites-available/smpp-admin
# Adicionar: deny <IP_SUSPEITO>;
```

3. **Alterar senhas:**
```bash
# Alterar senha do banco
sudo -u postgres psql -c "ALTER USER smpp_user PASSWORD 'nova_senha';"

# Atualizar .env
nano .env
# DB_PASSWORD=nova_senha

# Reiniciar aplicação
pm2 restart smpp-admin-backend
```

## 📞 Suporte

### Informações para Suporte

Ao solicitar suporte, forneça:

1. **Versão do sistema:**
```bash
cat /etc/os-release
node --version
npm --version
```

2. **Status dos serviços:**
```bash
pm2 status
sudo systemctl status postgresql redis nginx
```

3. **Logs de erro:**
```bash
pm2 logs smpp-admin-backend --err --lines 50
```

4. **Configuração:**
```bash
cat .env | grep -v PASSWORD
```

### Canais de Suporte

- **GitHub Issues**: [Link para issues]
- **Email**: suporte@smpp-admin.com
- **Documentação**: [Link para docs]

### Escalação de Problemas

1. **Nível 1**: Problemas básicos (documentação)
2. **Nível 2**: Problemas de configuração (suporte técnico)
3. **Nível 3**: Problemas críticos (desenvolvimento)

---

**Troubleshooting completo! 🎉**

Se o problema persistir, consulte a documentação ou entre em contato com o suporte.