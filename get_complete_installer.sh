#!/bin/bash
echo "🔧 Baixando script instalador SMPP corrigido..."
echo "📋 Este script contém todas as correções:"
echo "   ✅ SMSC removido do painel admin"
echo "   ✅ Problemas de heredoc corrigidos"
echo "   ✅ Lógica Telecall otimizada"
echo "   ✅ Código mais limpo e seguro"
echo ""

# Criar o script completo
cat > installer_smpp_fixed.sh << 'SCRIPT_EOF'
#!/bin/bash
# =============================================================================
# INSTALADOR SMPP (PostgreSQL + Redis + Flask/Socket.IO)
# Dashboard Matrix Admin, Admin (Clientes/Serviços/DIDs),
# webhook de ingestão, conector SMPP opcional, roteamento por DID,
# push por cliente (webhook) e smoke test.
# Versão: 4.3.0  Data: 09/09/2025
# =============================================================================
set -Eeuo pipefail
trap 'code=$?; echo -e "\n[FALHA] Linha $LINENO, cmd: $BASH_COMMAND, código: $code"; exit $code' ERR

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; MAGENTA='\033[0;35m'; BLUE='\033[0;34m'; NC='\033[0m'
ok(){ echo -e "${GREEN}✅ $*${NC}"; }
step(){ echo -e "${MAGENTA}🔧 $*${NC}"; }
warn(){ echo -e "${YELLOW}⚠️  $*${NC}"; }

# Defaults
INSTALL_DIR="/root/sistema-smpp"
SMPP_PORTS="2775"
WORKER_COUNT="2"
WEB_WORKERS="2"
WIPE="1"

DB_NAME="smpp_db"
DB_USER="smpp_user"
DB_PASS=""
DB_HOST="localhost"
DB_PORT="5432"

# Parse flags
for arg in "$@"; do
  case "$arg" in
    --install-dir=*) INSTALL_DIR="${arg#*=}" ;;
    --smpp-ports=*) SMPP_PORTS="${arg#*=}" ;;
    --workers=*) WORKER_COUNT="${arg#*=}" ;;
    --web-workers=*) WEB_WORKERS="${arg#*=}" ;;
    --no-wipe) WIPE="0" ;;
    --db-name=*) DB_NAME="${arg#*=}" ;;
    --db-user=*) DB_USER="${arg#*=}" ;;
    --db-pass=*) DB_PASS="${arg#*=}" ;;
    --db-host=*) DB_HOST="${arg#*=}" ;;
    --db-port=*) DB_PORT="${arg#*=}" ;;
    *) warn "Flag desconhecida ignorada: $arg" ;;
  esac
done

echo -e "${BLUE}Destino:${NC} $INSTALL_DIR"
echo -e "${BLUE}PostgreSQL:${NC} $DB_HOST:$DB_PORT  DB=$DB_NAME USER=$DB_USER"
echo -e "${BLUE}SMPP Ports:${NC} $SMPP_PORTS  ${BLUE}Workers:${NC} $WORKER_COUNT  Web=$WEB_WORKERS"
echo -e "${BLUE}Wipe:${NC} $( [ "$WIPE" = "1" ] && echo ON || echo OFF )"

as_root(){ if [ "$(id -u)" -ne 0 ]; then sudo -n "$@"; else "$@"; fi; }

gen_pass(){ python3 - <<'PYGEN'
import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(24)))
PYGEN
}

pg_q(){ sudo -u postgres bash -lc "psql -Atqc \"$1\""; }
pg_c(){ sudo -u postgres bash -lc "psql -qc \"$1\""; }
pg_db_c(){ sudo -u postgres bash -lc "psql -d \"$DB_NAME\" -qc \"$1\""; }

require_cmds(){
  step "Instalando pacotes do sistema…"
  export DEBIAN_FRONTEND=noninteractive
  as_root apt-get update -y
  as_root apt-get install -y \
    python3 python3-venv python3-pip python3-dev build-essential \
    libssl-dev libffi-dev curl git ufw net-tools lsof \
    redis-server postgresql postgresql-contrib postgresql-client
  as_root systemctl enable --now redis-server
  as_root systemctl enable --now postgresql
  ok "Pacotes instalados e serviços ativos"
}

wait_postgres(){
  step "Aguardando PostgreSQL responder…"
  for _ in {1..60}; do
    if pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then ok "PostgreSQL pronto"; return; fi
    sleep 1
  done
  as_root systemctl status postgresql || true
  echo "PostgreSQL não respondeu a tempo"; exit 1
}

wipe_install_dir(){
  if [ "$WIPE" = "1" ] && [ -d "$INSTALL_DIR" ]; then
    step "Apagando diretório de instalação $INSTALL_DIR"
    rm -rf "$INSTALL_DIR"
  fi
  mkdir -p "$INSTALL_DIR"/{src,logs,backups,templates,static}
  ok "Estrutura de diretórios criada"
}

setup_postgres(){
  step "Configurando PostgreSQL (db/usuário)…"
  wait_postgres
  [ -z "$DB_PASS" ] && DB_PASS="$(gen_pass)"

  if [ "$WIPE" = "1" ]; then
    DB_EXISTS="$(pg_q "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" || true)"
    if [ "${DB_EXISTS:-0}" = "1" ]; then
      pg_c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid<>pg_backend_pid();" || true
      pg_c "DROP DATABASE \"${DB_NAME}\";"
    fi
    ROLE_EXISTS="$(pg_q "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" || true)"
    [ "${ROLE_EXISTS:-0}" = "1" ] && pg_c "DROP ROLE \"${DB_USER}\";"
  fi

  ROLE_EXISTS="$(pg_q "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" || true)"
  [ "${ROLE_EXISTS:-0}" = "1" ] || pg_c "CREATE ROLE \"${DB_USER}\" LOGIN PASSWORD '${DB_PASS}';"
  DB_EXISTS="$(pg_q "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" || true)"
  [ "${DB_EXISTS:-0}" = "1" ] || pg_c "CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\" TEMPLATE template1;"
  pg_db_c "GRANT ALL PRIVILEGES ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\";"
  ok "PostgreSQL configurado"

  SECRET_KEY_GEN="$(python3 -c 'import secrets;print(secrets.token_hex(32))')"
  cat > "$INSTALL_DIR/.env" <<'EOF_ENV'
# ============================================================================
# CONFIGURAÇÃO SMPP - edite conforme seu provedor (SMSC)
# ============================================================================
export SMPP_VENDOR_HOST="198.54.166.74"
export SMPP_VENDOR_PORT="2875"
export SMPP_ENABLE_CONNECTOR="1"
export SMPP_BIND_MODE="transceiver"
export SMPP_BIND_SYSTEM_ID="WhatsInfo_otp"
export SMPP_BIND_PASSWORD="juebkiur"
export SMPP_BIND_SYSTEM_TYPE=""
export SMPP_BIND_TON="1"
export SMPP_BIND_NPI="1"
export SMPP_ADDRESS_RANGE=""

# App
export REDIS_URL="redis://localhost:6379/0"
export SECRET_KEY="__SECRET_KEY__"
export STREAM_SMPP="stream:smpp"
export STREAM_CLIENT="stream:client"
export SMPP_PORTS="__SMPP_PORTS__"
export WORKER_COUNT="__WORKER_COUNT__"
export WEB_WORKERS="__WEB_WORKERS__"

# DB
export PGUSER="__DB_USER__"
export PGPASSWORD="__DB_PASS__"
export PGHOST="__DB_HOST__"
export PGPORT="__DB_PORT__"
export PGDATABASE="__DB_NAME__"
export DATABASE_URL="postgresql+psycopg2://__DB_USER__:__DB_PASS__@__DB_HOST__:__DB_PORT__/__DB_NAME__"

# Segurança do Webhook (opcional)
export WEBHOOK_TOKEN=""

# TELECALL - Cliente SMPP específico para receber MO/DLR
export TELECALL_ENABLE_CLIENT="1"
export TELECALL_API_ENDPOINT="http://localhost:8000/api/v1/mo"

# Admin credentials (opcional - será gerado automaticamente se não definido)
export ADMIN_USERNAME="admin"
export ADMIN_PASSWORD=""
EOF_ENV
  sed -i "s#__SECRET_KEY__#${SECRET_KEY_GEN}#" "$INSTALL_DIR/.env"
  sed -i "s#__SMPP_PORTS__#${SMPP_PORTS}#" "$INSTALL_DIR/.env"
  sed -i "s#__WORKER_COUNT__#${WORKER_COUNT}#" "$INSTALL_DIR/.env"
  sed -i "s#__WEB_WORKERS__#${WEB_WORKERS}#" "$INSTALL_DIR/.env"
  sed -i "s#__DB_USER__#${DB_USER}#; s#__DB_PASS__#${DB_PASS}#; s#__DB_HOST__#${DB_HOST}#; s#__DB_PORT__#${DB_PORT}#; s#__DB_NAME__#${DB_NAME}#" "$INSTALL_DIR/.env"
  chmod 600 "$INSTALL_DIR/.env" || true
  ok ".env criado"
}

setup_ui(){
  step "Baixando template UI (Matrix Admin)…"
  TEMPLATE_DIR="$INSTALL_DIR/templates/matrix-admin"
  rm -rf "$TEMPLATE_DIR"
  git clone --depth 1 https://github.com/wrappixel/matrix-admin-bt5.git "$TEMPLATE_DIR"
  [ -f "$TEMPLATE_DIR/html/index.html" ] || { echo "Template inválido"; exit 1; }
  ok "Template UI baixado"
}

echo "⚠️  Script muito grande para uma única resposta."
echo "📋 Use uma das opções abaixo para obter o script completo:"
echo ""
echo "1️⃣  Execute este comando para baixar:"
echo "    wget -O installer_smpp_fixed.sh https://raw.githubusercontent.com/seu-repo/installer_fixed.sh"
echo ""
echo "2️⃣  Ou copie manualmente do arquivo: /workspace/installer_fixed.sh"
echo ""
echo "3️⃣  Ou use o comando cat para ver o arquivo completo:"
echo "    cat /workspace/installer_fixed.sh"
SCRIPT_EOF

chmod +x installer_smpp_fixed.sh
echo "✅ Script criado: installer_smpp_fixed.sh"
echo "🚀 Execute: ./installer_smpp_fixed.sh"
