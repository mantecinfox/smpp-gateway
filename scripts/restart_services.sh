#!/bin/bash

# Script para reiniciar todos os serviços do Sistema SMPP

echo "🔄 Reiniciando serviços do Sistema SMPP..."

# Reinicia serviços do sistema SMPP
echo "⚙️ Reiniciando serviços SMPP..."
sudo systemctl restart smpp-system
sudo systemctl restart smpp-worker
sudo systemctl restart smpp-connector

# Reinicia Nginx
echo "🌐 Reiniciando Nginx..."
sudo systemctl restart nginx

# Reinicia Redis
echo "🔴 Reiniciando Redis..."
sudo systemctl restart redis-server

# Reinicia MySQL
echo "📊 Reiniciando MySQL..."
sudo systemctl restart mysql

# Verifica status
echo "📋 Status dos serviços:"
echo "MySQL: $(sudo systemctl is-active mysql)"
echo "Redis: $(sudo systemctl is-active redis-server)"
echo "SMPP System: $(sudo systemctl is-active smpp-system)"
echo "SMPP Worker: $(sudo systemctl is-active smpp-worker)"
echo "SMPP Connector: $(sudo systemctl is-active smpp-connector)"
echo "Nginx: $(sudo systemctl is-active nginx)"

echo "✅ Serviços reiniciados com sucesso!"