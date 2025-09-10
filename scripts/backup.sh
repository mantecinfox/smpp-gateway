#!/bin/bash

# Script de backup do Sistema SMPP

BACKUP_DIR="/opt/backups/smpp-system"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="smpp_backup_$DATE"

echo "💾 Iniciando backup do Sistema SMPP..."

# Cria diretório de backup
sudo mkdir -p $BACKUP_DIR

# Backup do banco de dados
echo "📊 Fazendo backup do banco de dados..."
sudo mysqldump -u smpp_user -p smpp_system > $BACKUP_DIR/${BACKUP_FILE}.sql

# Backup dos arquivos de configuração
echo "⚙️ Fazendo backup dos arquivos de configuração..."
sudo tar -czf $BACKUP_DIR/${BACKUP_FILE}_config.tar.gz \
    /opt/smpp-system/.env \
    /opt/smpp-system/src/ \
    /etc/systemd/system/smpp-*.service \
    /etc/nginx/sites-available/smpp-system

# Backup dos logs
echo "📝 Fazendo backup dos logs..."
sudo tar -czf $BACKUP_DIR/${BACKUP_FILE}_logs.tar.gz \
    /var/log/smpp-system/

# Cria arquivo de informações do backup
echo "📋 Criando informações do backup..."
cat > $BACKUP_DIR/${BACKUP_FILE}_info.txt << EOF
Backup do Sistema SMPP
Data: $(date)
Versão: 1.0
Sistema: $(uname -a)
MySQL: $(mysql --version)
Redis: $(redis-server --version)

Arquivos incluídos:
- ${BACKUP_FILE}.sql (Banco de dados)
- ${BACKUP_FILE}_config.tar.gz (Configurações)
- ${BACKUP_FILE}_logs.tar.gz (Logs)

Para restaurar:
1. mysql -u smpp_user -p smpp_system < ${BACKUP_FILE}.sql
2. tar -xzf ${BACKUP_FILE}_config.tar.gz -C /
3. tar -xzf ${BACKUP_FILE}_logs.tar.gz -C /
EOF

# Remove backups antigos (mais de 30 dias)
echo "🧹 Removendo backups antigos..."
find $BACKUP_DIR -name "smpp_backup_*" -mtime +30 -delete

echo "✅ Backup concluído!"
echo "📁 Localização: $BACKUP_DIR"
echo "📄 Arquivos:"
ls -la $BACKUP_DIR/${BACKUP_FILE}*