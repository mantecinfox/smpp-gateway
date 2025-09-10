#!/bin/bash

# Script para iniciar todos os serviços do Sistema SMPP

echo "🚀 Iniciando serviços do Sistema SMPP..."

# Inicia MySQL
echo "📊 Iniciando MySQL..."
sudo systemctl start mysql
sudo systemctl enable mysql

# Inicia Redis
echo "🔴 Iniciando Redis..."
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Inicia serviços do sistema SMPP
echo "⚙️ Iniciando serviços SMPP..."
sudo systemctl start smpp-system
sudo systemctl start smpp-worker
sudo systemctl start smpp-connector

# Inicia Nginx
echo "🌐 Iniciando Nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

# Verifica status
echo "📋 Status dos serviços:"
echo "MySQL: $(sudo systemctl is-active mysql)"
echo "Redis: $(sudo systemctl is-active redis-server)"
echo "SMPP System: $(sudo systemctl is-active smpp-system)"
echo "SMPP Worker: $(sudo systemctl is-active smpp-worker)"
echo "SMPP Connector: $(sudo systemctl is-active smpp-connector)"
echo "Nginx: $(sudo systemctl is-active nginx)"

echo "✅ Serviços iniciados com sucesso!"