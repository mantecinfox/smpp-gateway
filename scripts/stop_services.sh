#!/bin/bash

# Script para parar todos os serviços do Sistema SMPP

echo "🛑 Parando serviços do Sistema SMPP..."

# Para serviços do sistema SMPP
echo "⚙️ Parando serviços SMPP..."
sudo systemctl stop smpp-connector
sudo systemctl stop smpp-worker
sudo systemctl stop smpp-system

# Para Nginx
echo "🌐 Parando Nginx..."
sudo systemctl stop nginx

# Para Redis
echo "🔴 Parando Redis..."
sudo systemctl stop redis-server

# Para MySQL
echo "📊 Parando MySQL..."
sudo systemctl stop mysql

echo "✅ Serviços parados com sucesso!"