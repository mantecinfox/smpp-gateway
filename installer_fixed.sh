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

apply_templates(){
  step "Aplicando templates customizados…"

  # Dashboard principal - corrigindo problemas de heredoc
  cat > "$INSTALL_DIR/templates/matrix-admin/html/dashboard.html" <<'DASHBOARD_EOF'
<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8">
    <title>Dashboard - SMPP Admin</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="/assets/libs/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="/assets/vendor/fonts/fontawesome/css/fontawesome-all.css" rel="stylesheet">
    <style>
      .kv { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed #eee; }
      .kv:last-child { border-bottom:0; }
      .truncate-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    </style>
  </head>
  <body class="bg-light">
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
      <div class="container-fluid">
        <a class="navbar-brand" href="/">SMPP Admin</a>
        <div class="d-flex">
          <a class="btn btn-outline-info btn-sm me-2" href="/admin/clients">Clientes</a>
          <a class="btn btn-outline-secondary btn-sm me-2" href="/admin/dids">DIDs</a>
          <a class="btn btn-outline-primary btn-sm me-2" href="/admin/services">Serviços</a>
          <a class="btn btn-outline-warning btn-sm" href="/logout">Sair</a>
        </div>
      </div>
    </nav>

    <div class="container py-4">
      <div class="row g-3">
        <div class="col-md-4">
          <div class="card shadow-sm">
            <div class="card-body">
              <h5 class="card-title mb-2"><i class="fas fa-database me-2"></i>Redis / Streams</h5>
              <div class="kv"><span>Redis URL</span><code>{{ redis_url }}</code></div>
              <div class="kv"><span>Stream SMPP</span><code>{{ stream_smpp }}</code></div>
              <div class="kv"><span>Stream Client</span><code>{{ stream_client }}</code></div>
              <div class="kv"><span>Portas SMPP</span><code>{{ smpp_ports }}</code></div>
              <a class="btn btn-sm btn-outline-secondary mt-3" href="/smpp/vendor-19854">Abrir Vendor SMPP</a>
            </div>
          </div>
          <div class="card shadow-sm mt-3">
            <div class="card-body">
              <h6 class="card-title mb-2"><i class="fas fa-cog me-2"></i>Conector SMPP</h6>
              <div id="conn-info" class="small text-muted">Configure via .env ou reinicie o serviço smpp_connector</div>
            </div>
          </div>
        </div>

        <div class="col-md-8">
          <div class="card shadow-sm">
            <div class="card-body">
              <h5 class="card-title mb-3"><i class="fas fa-envelope-open-text me-2"></i>Mensagens por Cliente</h5>
              <div class="table-responsive">
                <table class="table table-sm align-middle">
                  <thead><tr><th>Cliente</th><th>Plataforma</th><th>Número</th><th>Texto</th><th>Data/Hora</th></tr></thead>
                  <tbody id="tbl-deliveries">
                    <tr><td colspan="5" class="text-center text-muted">Carregando...</td></tr>
                  </tbody>
                </table>
              </div>
              <small class="text-muted">Últimas entregas registradas no sistema.</small>
            </div>
          </div>
        </div>
      </div>

      <div class="card shadow-sm mt-3">
        <div class="card-header">Últimas Mensagens (gerais)</div>
        <div class="card-body">
          <div id="last-messages" class="row g-2"></div>
          <div id="no-msgs" class="text-center text-muted">Nenhuma mensagem recente</div>
        </div>
      </div>
    </div>

    <script src="/assets/vendor/jquery/jquery-3.3.1.min.js"></script>
    <script src="/assets/libs/bootstrap/dist/js/bootstrap.bundle.js"></script>
    <script>
      function loadDeliveries(){
        $.get('/admin/deliveries/recent', function(d){
          const tb = $('#tbl-deliveries');
          if (d.deliveries && d.deliveries.length){
            tb.html(d.deliveries.map(row => (
              '<tr>' +
                '<td>' + (row.client||'-') + '</td>' +
                '<td>' + (row.platform||'-') + '</td>' +
                '<td>' + (row.sender||'-') + '</td>' +
                '<td class="truncate-2" title="' + (row.text||'') + '">' + (row.text||'') + '</td>' +
                '<td>' + row.timestamp + '</td>' +
              '</tr>'
            )).join(''));
          } else {
            tb.html('<tr><td colspan="5" class="text-center text-muted">Sem entregas</td></tr>');
          }
        });
      }
      function loadLastMessages(){
        $.get('/smpp/vendor-19854/messages', function(data){
          if (data.messages && data.messages.length){
            $('#no-msgs').hide();
            let html = '';
            data.messages.forEach(m=>{
              html += '<div class="col-md-4"><div class="border rounded p-2">' +
                        '<div class="d-flex justify-content-between">' +
                          '<strong>' + (m.sender||'-') + '</strong>' +
                          '<small class="text-muted">' + m.time + '</small>' +
                        '</div>' +
                        '<div class="text-truncate">' + (m.content||'') + '</div>' +
                       '</div></div>';
            });
            $('#last-messages').html(html);
          } else {
            $('#last-messages').empty(); $('#no-msgs').show();
          }
        });
      }
      function refreshAll(){ loadDeliveries(); loadLastMessages(); }
      refreshAll(); setInterval(refreshAll, 5000);
    </script>
  </body>
</html>
DASHBOARD_EOF

  # Template do vendor SMPP
  cat > "$INSTALL_DIR/templates/matrix-admin/html/vendor-19854.html" <<'VENDOR_EOF'
<!doctype html><html lang="pt"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Servidor SMPP {{ vendor.ip }}:{{ vendor.port }}</title>
<link rel="stylesheet" href="/assets/libs/bootstrap/dist/css/bootstrap.min.css">
<link rel="stylesheet" href="/assets/vendor/fonts/fontawesome/css/fontawesome-all.css">
<style>
  .specs-table td {padding: 8px 12px; border-bottom: 1px solid #eee;}
  .specs-table tr:last-child td {border-bottom: none;}
  .status-badge {font-size: 0.8rem; padding: 4px 8px;}
</style>
</head><body class="bg-light">
<nav class="navbar navbar-dark bg-dark">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">SMPP Admin</a>
    <div class="d-flex">
      <a class="btn btn-outline-secondary btn-sm me-2" href="/admin/clients">Clientes</a>
      <a class="btn btn-outline-light btn-sm" href="/logout">Sair</a>
    </div>
  </div>
</nav>
<div class="container py-4">
  <div class="d-flex align-items-center mb-3">
    <i class="fas fa-server me-2"></i><h4 class="mb-0">Conexão SMPP dedicada</h4>
    <a class="btn btn-outline-secondary ms-auto" href="/">Voltar</a>
  </div>

  <div class="row">
    <div class="col-md-6">
      <div class="card mb-4">
        <div class="card-header">Parâmetros de Conexão</div>
        <div class="card-body">
          <table class="specs-table w-100">
            <tr><td width="40%"><strong>Endereço IP</strong></td><td><code>{{ vendor.ip }}</code></td></tr>
            <tr><td><strong>Porta SMPP</strong></td><td>{{ vendor.port }}</td></tr>
            <tr><td><strong>Modo de Conexão</strong></td><td>{{ vendor.bind_mode }}</td></tr>
            <tr><td><strong>Status Atual</strong></td><td>
              <span id="conn-status" class="status-badge badge bg-secondary">Verificando...</span>
              <span id="last-check" class="text-muted small ms-2"></span>
            </td></tr>
          </table>
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header">Configurações Técnicas</div>
        <div class="card-body">
          <table class="specs-table w-100">
            <tr><td width="40%"><strong>Codificação de Dados</strong></td><td>{{ vendor.dcs }}</td></tr>
            <tr><td><strong>Método de Cobrança</strong></td><td>{{ vendor.billing }}</td></tr>
            <tr><td><strong>Moeda</strong></td><td>{{ vendor.currency }}</td></tr>
            <tr><td><strong>Throughput Máximo</strong></td><td>Ilimitado</td></tr>
            <tr><td><strong>Versão SMPP</strong></td><td>3.4</td></tr>
          </table>
        </div>
      </div>
    </div>

    <div class="col-md-6">
      <div class="card mb-4">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span>Monitoramento em Tempo Real</span>
          <button id="btn-refresh" class="btn btn-sm btn-outline-primary">
            <i class="fas fa-sync"></i> Atualizar
          </button>
        </div>
        <div class="card-body">
          <div class="mb-3">
            <h6>Últimas Mensagens Recebidas</h6>
            <div id="last-messages" class="bg-light p-2 rounded" style="max-height:200px;overflow-y:auto;">
              <div class="text-center text-muted py-2">Carregando...</div>
            </div>
          </div>
          <div>
            <h6>Estatísticas</h6>
            <div id="stats" class="row">
              <div class="col-4"><div class="border p-2 text-center"><div class="text-muted small">Msg/min</div><div id="msg-rate" class="h4">-</div></div></div>
              <div class="col-4"><div class="border p-2 text-center"><div class="text-muted small">Latência</div><div id="latency" class="h4">-</div></div></div>
              <div class="col-4"><div class="border p-2 text-center"><div class="text-muted small">Erros</div><div id="errors" class="h4">0</div></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">Informações de Conexão</div>
    <div class="card-body">
      <h6>Parâmetros de Bind</h6>
      <pre class="bg-dark text-light p-3 rounded">
system_id: [SEU_SYSTEM_ID]
password: [SUA_SENHA]
system_type: ""
addr_ton: 1
addr_npi: 1
address_range: ""</pre>

      <h6 class="mt-3">Exemplo de Código Python</h6>
      <pre class="bg-dark text-light p-3 rounded">
import smpplib
client = smpplib.client.Client('{{ vendor.ip }}', {{ vendor.port }})
client.connect()
client.bind_transceiver(system_id='[SEU_SYSTEM_ID]', password='[SUA_SENHA]')
def handle_message(pdu): print(f"Mensagem recebida de {pdu.source_addr}: {pdu.short_message}")
client.set_message_received_handler(handle_message)
client.listen()</pre>
    </div>
  </div>
</div>
<script src="/assets/vendor/jquery/jquery-3.3.1.min.js"></script>
<script src="/assets/libs/bootstrap/dist/js/bootstrap.bundle.js"></script>
<script>
function updateConnectionStatus() {
  fetch('/smpp/vendor-19854/ping').then(r=>r.json()).then(data=>{
    const el = document.getElementById('conn-status');
    el.classList.remove('bg-secondary','bg-success','bg-danger');
    if (data.ok) { el.classList.add('bg-success'); el.textContent = 'CONECTADO'; }
    else { el.classList.add('bg-danger'); el.textContent = 'DESCONECTADO'; }
    document.getElementById('last-check').textContent = new Date().toLocaleString();
  }).catch(()=>{
    const el = document.getElementById('conn-status');
    el.classList.remove('bg-secondary'); el.classList.add('bg-danger'); el.textContent='ERRO';
  });
}
function loadLastMessages(){
  fetch('/smpp/vendor-19854/messages').then(r=>r.json()).then(data=>{
    const box = document.getElementById('last-messages');
    if (data.messages && data.messages.length){
      box.innerHTML = data.messages.map(m=>(
        '<div class="mb-2"><div class="d-flex justify-content-between">' +
           '<strong>' + (m.sender||'-') + '</strong>' +
           '<small class="text-muted">' + m.time + '</small>' +
         '</div><div class="text-truncate">' + (m.content||'') + '</div></div>'
      )).join('');
    } else {
      box.innerHTML = '<div class="text-center text-muted py-2">Nenhuma mensagem recente</div>';
    }
  });
}
function updateStats(){
  fetch('/smpp/vendor-19854/stats').then(r=>r.json()).then(data=>{
    document.getElementById('msg-rate').textContent = (data.rate||0) + '/min';
    document.getElementById('latency').textContent = (data.latency||0) + 'ms';
    document.getElementById('errors').textContent = (data.errors||0);
  });
}
function updateAll(){ updateConnectionStatus(); loadLastMessages(); updateStats(); }
updateAll(); setInterval(updateAll, 5000);
document.getElementById('btn-refresh').addEventListener('click', updateAll);
</script>
</body></html>
VENDOR_EOF

  # Templates restantes (login, admin, etc.)
  cat > "$INSTALL_DIR/templates/matrix-admin/html/login.html" <<'LOGIN_EOF'
<!doctype html>
<html lang="pt">
  <head>
    <meta charset="utf-8">
    <title>Login - SMPP Admin</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="/assets/libs/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
  </head>
  <body class="bg-light">
    <div class="container py-5">
      <div class="row justify-content-center">
        <div class="col-md-4">
          <div class="card shadow-sm">
            <div class="card-body">
              <h5 class="card-title">Entrar</h5>
              {% if error %}<div class="alert alert-warning">{{ error }}</div>{% endif %}
              <form method="post">
                <div class="mb-3">
                  <label class="form-label">Usuário</label>
                  <input type="text" name="username" class="form-control" required>
                </div>
                <div class="mb-3">
                  <label class="form-label">Senha</label>
                  <input type="password" name="password" class="form-control" required>
                </div>
                <button class="btn btn-primary w-100" type="submit">Entrar</button>
              </form>
            </div>
          </div>
          <p class="text-center text-muted mt-3 small">Sistema SMPP Admin v4.3.0</p>
        </div>
      </div>
    </div>
    <script src="/assets/libs/bootstrap/dist/js/bootstrap.bundle.js"></script>
  </body>
</html>
LOGIN_EOF

  # Templates de admin (clientes, DIDs, serviços) - versões simplificadas
  cat > "$INSTALL_DIR/templates/matrix-admin/html/admin_clients.html" <<'CLIENTS_EOF'
<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Clientes - SMPP Admin</title>
<link href="/assets/libs/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="/assets/vendor/fonts/fontawesome/css/fontawesome-all.css" rel="stylesheet">
<style>code.wrap { white-space: pre-wrap; word-break: break-all; }</style>
</head>
<body class="bg-light">
<nav class="navbar navbar-dark bg-dark">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">SMPP Admin</a>
    <div class="d-flex">
      <a class="btn btn-outline-secondary btn-sm me-2" href="/admin/dids">DIDs</a>
      <a class="btn btn-outline-primary btn-sm me-2" href="/admin/services">Serviços</a>
      <a class="btn btn-outline-light btn-sm" href="/logout">Sair</a>
    </div>
  </div>
</nav>
<div class="container py-4">
  <div class="d-flex align-items-center mb-3">
    <h4 class="mb-0">Clientes</h4>
    <a href="/admin/clients/new" class="btn btn-primary btn-sm ms-auto"><i class="fas fa-plus"></i> Novo Cliente</a>
  </div>
  <div class="card">
    <div class="card-body table-responsive">
      <table class="table table-sm align-middle">
        <thead><tr><th>Nome</th><th>API Key</th><th>Webhook</th><th>Último Acesso</th><th>Ações</th></tr></thead>
        <tbody>
        {% for c in clients %}
          <tr>
            <td>{{ c.name }}</td>
            <td><code>{{ c.api_key }}</code></td>
            <td>{% if c.webhook_enabled and c.webhook_url %}<span class="badge bg-success">Ativo</span> <small class="text-muted">{{ c.webhook_url }}</small>{% else %}<span class="badge bg-secondary">Desativado</span>{% endif %}</td>
            <td>{{ c.last_seen.strftime('%Y-%m-%d %H:%M:%S') if c.last_seen else '-' }}</td>
            <td>
              <a class="btn btn-sm btn-outline-secondary" href="/admin/clients/{{ c.id }}/edit">Editar</a>
              <a class="btn btn-sm btn-outline-warning" href="/admin/clients/{{ c.id }}/rotate-key" onclick="return confirm('Confirmar rotação da API Key?');">Rotacionar Key</a>
            </td>
          </tr>
          <tr>
            <td colspan="5">
              <div class="small text-muted">Exemplos de consumo com esta API Key:</div>
              <div class="mb-1"><strong>GET:</strong> <code class="wrap">curl "{{ base_url }}api/v1/messages?api_key={{ c.api_key }}"</code></div>
              <div><strong>POST:</strong> <code class="wrap">curl -X POST -H "Content-Type: application/json" -d '{"api_key":"{{ c.api_key }}"}' "{{ base_url }}api/v1/messages"</code></div>
            </td>
          </tr>
        {% else %}
          <tr><td colspan="5" class="text-center text-muted">Nenhum cliente cadastrado</td></tr>
        {% endfor %}
        </tbody>
      </table>
    </div>
  </div>
</div>
<script src="/assets/libs/bootstrap/dist/js/bootstrap.bundle.js"></script>
</body>
</html>
CLIENTS_EOF

  cat > "$INSTALL_DIR/templates/matrix-admin/html/admin_dids.html" <<'DIDS_EOF'
<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DIDs - SMPP Admin</title>
<link href="/assets/libs/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="/assets/vendor/fonts/fontawesome/css/fontawesome-all.css" rel="stylesheet">
</head>
<body class="bg-light">
<nav class="navbar navbar-dark bg-dark">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">SMPP Admin</a>
    <div class="d-flex">
      <a class="btn btn-outline-secondary btn-sm me-2" href="/admin/clients">Clientes</a>
      <a class="btn btn-outline-primary btn-sm me-2" href="/admin/services">Serviços</a>
      <a class="btn btn-outline-light btn-sm" href="/logout">Sair</a>
    </div>
  </div>
</nav>
<div class="container py-4">
  <div class="d-flex align-items-center mb-3">
    <h4 class="mb-0">DIDs</h4>
    <div class="ms-auto">
      <a href="/admin/dids/import" class="btn btn-outline-primary btn-sm me-2"><i class="fas fa-file-upload"></i> Importar DIDs</a>
      <a href="/admin/dids/new" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> Novo DID</a>
    </div>
  </div>

  <div class="row g-3 mb-3">
    <div class="col-md-4"><div class="border rounded p-3 bg-white"><div class="text-muted small">Total</div><div class="h4 mb-0">{{ counts.total }}</div></div></div>
    <div class="col-md-4"><div class="border rounded p-3 bg-white"><div class="text-muted small">Disponíveis</div><div class="h4 mb-0">{{ counts.available }}</div></div></div>
    <div class="col-md-4"><div class="border rounded p-3 bg-white"><div class="text-muted small">Utilizados</div><div class="h4 mb-0">{{ counts.used }}</div></div></div>
  </div>

  <div class="card">
    <div class="card-body table-responsive">
      <table class="table table-sm align-middle">
        <thead><tr><th>E164</th><th>Cliente</th><th>Provider</th><th>Status</th><th>Criado</th><th>Ações</th></tr></thead>
        <tbody>
        {% for d in dids %}
          <tr>
            <td><code>{{ d.e164 }}</code></td>
            <td>{{ d.client_name or '-' }}</td>
            <td>{{ d.provider or '-' }}</td>
            <td>{{ d.status }}</td>
            <td>{{ d.created_at.strftime('%Y-%m-%d %H:%M:%S') }}</td>
            <td><a class="btn btn-sm btn-outline-secondary" href="/admin/dids/{{ d.id }}/edit">Editar</a></td>
          </tr>
        {% else %}
          <tr><td colspan="6" class="text-center text-muted">Nenhum DID cadastrado</td></tr>
        {% endfor %}
        </tbody>
      </table>
    </div>
  </div>
</div>
<script src="/assets/libs/bootstrap/dist/js/bootstrap.bundle.js"></script>
</body>
</html>
DIDS_EOF

  cat > "$INSTALL_DIR/templates/matrix-admin/html/admin_services.html" <<'SERVICES_EOF'
<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Serviços - SMPP Admin</title>
<link href="/assets/libs/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
<nav class="navbar navbar-dark bg-dark">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">SMPP Admin</a>
    <div class="d-flex">
      <a class="btn btn-outline-secondary btn-sm me-2" href="/admin/clients">Clientes</a>
      <a class="btn btn-outline-success btn-sm me-2" href="/admin/dids">DIDs</a>
      <a class="btn btn-outline-light btn-sm" href="/logout">Sair</a>
    </div>
  </div>
</nav>
<div class="container py-4">
  <div class="d-flex align-items-center mb-3">
    <h4 class="mb-0">Serviços Disponíveis</h4>
    <a href="/admin/services/seed" class="btn btn-outline-primary btn-sm ms-auto" onclick="return confirm('Recriar serviços padrão?');">Recriar Padrões</a>
  </div>
  <div class="card">
    <div class="card-body table-responsive">
      <table class="table table-sm">
        <thead><tr><th>Nome</th><th>Code Hint</th><th>Regex</th><th>Mensagem (template)</th></tr></thead>
        <tbody>
          {% for s in services %}
          <tr>
            <td>{{ s.name }}</td>
            <td><code>{{ s.code_hint }}</code></td>
            <td><code>{{ s.code_regex }}</code></td>
            <td class="text-truncate" style="max-width:420px; white-space:pre-wrap;">{{ s.response_template }}</td>
          </tr>
          {% else %}
          <tr><td colspan="4" class="text-center text-muted">Sem serviços cadastrados</td></tr>
          {% endfor %}
        </tbody>
      </table>
    </div>
  </div>
</div>
<script src="/assets/libs/bootstrap/dist/js/bootstrap.bundle.js"></script>
</body>
</html>
SERVICES_EOF

  # Templates de formulários
  cat > "$INSTALL_DIR/templates/matrix-admin/html/admin_client_form.html" <<'CLIENT_FORM_EOF'
<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ 'Editar' if client else 'Novo' }} Cliente - SMPP Admin</title>
<link href="/assets/libs/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
<nav class="navbar navbar-dark bg-dark">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">SMPP Admin</a>
    <div class="d-flex"><a class="btn btn-outline-light btn-sm" href="/logout">Sair</a></div>
  </div>
</nav>
<div class="container py-4">
  <div class="d-flex align-items-center mb-3">
    <h4 class="mb-0">{{ 'Editar' if client else 'Novo' }} Cliente</h4>
    <a href="/admin/clients" class="btn btn-outline-secondary btn-sm ms-auto">Voltar</a>
  </div>
  <div class="card">
    <div class="card-body">
      {% if error %}<div class="alert alert-warning">{{ error }}</div>{% endif %}
      <form method="post">
        <div class="mb-3">
          <label class="form-label">Nome do Cliente</label>
          <input type="text" name="name" class="form-control" required value="{{ client.name if client else '' }}">
        </div>
        <div class="mb-3">
          <label class="form-label">Webhook URL (opcional)</label>
          <input type="url" name="webhook_url" class="form-control" placeholder="https://exemplo.com/webhook" value="{{ client.webhook_url if client else '' }}">
        </div>
        <div class="mb-3">
          <label class="form-label">Webhook Token (opcional)</label>
          <input type="text" name="webhook_token" class="form-control" value="{{ client.webhook_token if client else '' }}">
        </div>
        <div class="form-check form-switch mb-3">
          <input class="form-check-input" type="checkbox" role="switch" id="wh_enabled" name="webhook_enabled" value="1" {% if client and client.webhook_enabled %}checked{% endif %}>
          <label class="form-check-label" for="wh_enabled">Ativar Webhook</label>
        </div>
        <button class="btn btn-primary" type="submit">Salvar</button>
      </form>
    </div>
  </div>
</div>
<script src="/assets/libs/bootstrap/dist/js/bootstrap.bundle.js"></script>
</body>
</html>
CLIENT_FORM_EOF

  cat > "$INSTALL_DIR/templates/matrix-admin/html/admin_did_form.html" <<'DID_FORM_EOF'
<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ 'Editar' if did else 'Novo' }} DID - SMPP Admin</title>
<link href="/assets/libs/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
<nav class="navbar navbar-dark bg-dark">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">SMPP Admin</a>
    <div class="d-flex">
      <a class="btn btn-outline-secondary btn-sm me-2" href="/admin/dids">DIDs</a>
      <a class="btn btn-outline-light btn-sm" href="/logout">Sair</a>
    </div>
  </div>
</nav>
<div class="container py-4">
  <div class="d-flex align-items-center mb-3">
    <h4 class="mb-0">{{ 'Editar' if did else 'Novo' }} DID</h4>
    <a href="/admin/dids" class="btn btn-outline-secondary btn-sm ms-auto">Voltar</a>
  </div>
  <div class="card">
    <div class="card-body">
      {% if error %}<div class="alert alert-warning">{{ error }}</div>{% endif %}
      <form method="post">
        <div class="mb-3">
          <label class="form-label">Número (E.164)</label>
          <input type="text" name="e164" class="form-control" placeholder="+551155501000" required value="{{ did.e164 if did else '' }}">
        </div>
        <div class="mb-3">
          <label class="form-label">Cliente</label>
          <select class="form-select" name="client_id">
            <option value="">-- sem cliente --</option>
            {% for c in clients %}
              <option value="{{ c.id }}" {% if did and did.client_id==c.id %}selected{% endif %}>{{ c.name }}</option>
            {% endfor %}
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label">Provider (opcional)</label>
          <input type="text" name="provider" class="form-control" value="{{ did.provider if did else '' }}">
        </div>
        <div class="mb-3">
          <label class="form-label">Status</label>
          <select class="form-select" name="status">
            {% for st in ['active','inactive'] %}
              <option value="{{ st }}" {% if did and did.status==st %}selected{% endif %}>{{ st }}</option>
            {% endfor %}
          </select>
        </div>
        <button class="btn btn-primary" type="submit">Salvar</button>
      </form>
    </div>
  </div>
</div>
<script src="/assets/libs/bootstrap/dist/js/bootstrap.bundle.js"></script>
</body>
</html>
DID_FORM_EOF

  cat > "$INSTALL_DIR/templates/matrix-admin/html/admin_dids_import.html" <<'DIDS_IMPORT_EOF'
<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Importar DIDs - SMPP Admin</title>
<link href="/assets/libs/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
<nav class="navbar navbar-dark bg-dark">
  <div class="container-fluid">
    <a class="navbar-brand" href="/">SMPP Admin</a>
    <div class="d-flex"><a class="btn btn-outline-secondary btn-sm me-2" href="/admin/dids">DIDs</a><a class="btn btn-outline-light btn-sm" href="/logout">Sair</a></div>
  </div>
</nav>
<div class="container py-4">
  <div class="d-flex align-items-center mb-3">
    <h4 class="mb-0">Importar DIDs</h4>
    <a href="/admin/dids" class="btn btn-outline-secondary btn-sm ms-auto">Voltar</a>
  </div>
  <div class="card">
    <div class="card-body">
      {% if msg %}<div class="alert alert-success">{{ msg }}</div>{% endif %}
      {% if error %}<div class="alert alert-warning">{{ error }}</div>{% endif %}
      <form method="post" enctype="multipart/form-data">
        <div class="row">
          <div class="col-md-6">
            <div class="mb-3">
              <label class="form-label">Colar números (um por linha) no padrão E.164</label>
              <textarea name="numbers" class="form-control" rows="10" placeholder="5511999998888
551155501000
..."></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Ou enviar arquivo .txt (um número por linha)</label>
              <input type="file" name="file" accept=".txt,text/plain" class="form-control">
            </div>
          </div>
          <div class="col-md-6">
            <div class="mb-3">
              <label class="form-label">Atribuir a Cliente (opcional)</label>
              <select class="form-select" name="client_id">
                <option value="">-- sem cliente --</option>
                {% for c in clients %}
                  <option value="{{ c.id }}">{{ c.name }}</option>
                {% endfor %}
              </select>
            </div>
            <div class="mb-3">
              <label class="form-label">Provider (opcional)</label>
              <input type="text" class="form-control" name="provider" placeholder="ex: vendor-x">
            </div>
            <div class="mb-3">
              <label class="form-label">Status</label>
              <select class="form-select" name="status">
                {% for st in ['active','inactive'] %}
                <option value="{{ st }}">{{ st }}</option>
                {% endfor %}
              </select>
            </div>
          </div>
        </div>
        <button class="btn btn-primary" type="submit">Importar</button>
      </form>
      <p class="text-muted small mt-3">Duplicados são ignorados automaticamente.</p>
    </div>
  </div>
</div>
<script src="/assets/libs/bootstrap/dist/js/bootstrap.bundle.js"></script>
</body>
</html>
DIDS_IMPORT_EOF

  ok "Templates aplicados"
}

write_requirements(){
  step "Escrevendo requirements.txt…"
  cat > "$INSTALL_DIR/requirements.txt" <<'REQUIREMENTS_EOF'
flask==2.3.3
flask-sqlalchemy==3.0.5
flask-bcrypt==1.0.1
flask-login==0.6.3
flask-socketio==5.3.5
gevent==23.7.0
gevent-websocket==0.10.1
gunicorn==21.2.0
redis==5.0.7
smpplib==2.2.1
twisted==24.3.0
requests==2.31.0
psycopg2-binary==2.9.9
SQLAlchemy==2.0.30
python-dotenv==1.0.1
eventlet==0.36.1
REQUIREMENTS_EOF
  ok "requirements.txt pronto"
}

write_app(){
  step "Escrevendo aplicação (src)…"
  mkdir -p "$INSTALL_DIR/src"

  # Models - versão otimizada
  cat > "$INSTALL_DIR/src/models.py" <<'MODELS_EOF'
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_login import UserMixin
import datetime, secrets

db = SQLAlchemy()
bcrypt = Bcrypt()

class User(db.Model, UserMixin):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    def check_password(self, password: str) -> bool:
        return bcrypt.check_password_hash(self.password_hash, password)

class Message(db.Model):
    __tablename__ = 'message'
    id = db.Column(db.Integer, primary_key=True)
    sender = db.Column(db.String(50))
    recipient = db.Column(db.String(50))
    provider = db.Column(db.String(80))
    content = db.Column(db.Text)
    detected_service = db.Column(db.String(50), index=True, nullable=True)
    status = db.Column(db.String(20), default='received')
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)

class Service(db.Model):
    __tablename__ = 'service'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False)
    code_hint = db.Column(db.String(120), nullable=True)
    code_regex = db.Column(db.String(255), nullable=False)
    response_template = db.Column(db.Text, nullable=True)

class ClientService(db.Model):
    __tablename__ = 'client_service'
    client_id = db.Column(db.Integer, db.ForeignKey('client.id'), primary_key=True)
    service_id = db.Column(db.Integer, db.ForeignKey('service.id'), primary_key=True)

class Client(db.Model):
    __tablename__ = 'client'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), unique=True, nullable=False)
    api_key = db.Column(db.String(64), unique=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    last_seen = db.Column(db.DateTime, nullable=True, index=True)
    webhook_url = db.Column(db.String(255), nullable=True)
    webhook_token = db.Column(db.String(128), nullable=True)
    webhook_enabled = db.Column(db.Boolean, default=False)
    services = db.relationship('Service', secondary='client_service', backref='clients')
    phone_numbers = db.relationship('PhoneNumber', backref='client')

    @staticmethod
    def new_api_key():
        return secrets.token_hex(24)
    def rotate_key(self):
        self.api_key = Client.new_api_key()

class PhoneNumber(db.Model):
    __tablename__ = 'phone_number'
    id = db.Column(db.Integer, primary_key=True)
    e164 = db.Column(db.String(32), unique=True, nullable=False, index=True)
    client_id = db.Column(db.Integer, db.ForeignKey('client.id'), nullable=True, index=True)
    provider = db.Column(db.String(80), nullable=True)
    status = db.Column(db.String(20), default='active', index=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)

class MessageDelivery(db.Model):
    __tablename__ = 'message_delivery'
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('message.id'), nullable=False, index=True)
    client_id = db.Column(db.Integer, db.ForeignKey('client.id'), nullable=False, index=True)
    platform = db.Column(db.String(80), index=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, index=True)

DEFAULT_SERVICES = [
    dict(name="WhatsApp", code_hint="123-456 (6 dígitos)", code_regex=r"(?<!\d)(\d{3}[-\s]?\d{3})(?!\d)", response_template="Seu código do WhatsApp é {code}."),
    dict(name="Gmail (Google)", code_hint="654321 (6 dígitos)", code_regex=r"(?<!\d)(\d{6})(?!\d)", response_template="Seu código de verificação do Google é {code}."),
    dict(name="Telegram", code_hint="789012 (5-6 dígitos)", code_regex=r"(?<!\d)(\d{5,6})(?!\d)", response_template="Código do Telegram: {code}."),
    dict(name="Mercado Livre", code_hint="345678 (6 dígitos)", code_regex=r"(?<!\d)(\d{6})(?!\d)", response_template="Código do Mercado Livre: {code}."),
    dict(name="Instagram", code_hint="456789 (6 dígitos)", code_regex=r"(?<!\d)(\d{6})(?!\d)", response_template="Seu código do Instagram é {code}."),
    dict(name="TikTok", code_hint="567890 (6 dígitos)", code_regex=r"(?<!\d)(\d{6})(?!\d)", response_template="Código do TikTok: {code}."),
    dict(name="Kwai", code_hint="678901 (6 dígitos)", code_regex=r"(?<!\d)(\d{6})(?!\d)", response_template="Código Kwai: {code}."),
]

def seed_services(db_session):
    from sqlalchemy import select
    existing = {s.name for s in db_session.execute(select(Service)).scalars().all()}
    created = 0
    for s in DEFAULT_SERVICES:
        if s["name"] in existing:
            continue
        obj = Service(name=s["name"], code_hint=s["code_hint"], code_regex=s["code_regex"], response_template=s["response_template"])
        db_session.add(obj); created += 1
    if created:
        db_session.commit()
    return created
MODELS_EOF

  # Migrate - versão otimizada
  cat > "$INSTALL_DIR/src/migrate.py" <<'MIGRATE_EOF'
import os, secrets, pathlib
from dotenv import load_dotenv
from flask import Flask
from models import db, bcrypt, User, Message, Client, Service, ClientService, MessageDelivery, PhoneNumber, seed_services

def create_app():
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
    app = Flask(__name__, template_folder="../templates/matrix-admin/html", static_folder="../templates/matrix-admin/assets")
    app.static_url_path = "/assets"
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "supersecretkey")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    db.init_app(app)
    bcrypt.init_app(app)
    return app

def ensure_admin(db_session, base_dir):
    username = os.getenv("ADMIN_USERNAME") or "admin"
    password = os.getenv("ADMIN_PASSWORD") or secrets.token_urlsafe(16)
    from sqlalchemy import select
    existing = db_session.execute(select(User).where(User.username == username)).scalar_one_or_none()
    if not existing:
        pw = bcrypt.generate_password_hash(password).decode()
        u = User(username=username, password_hash=pw)
        db_session.add(u); db_session.commit()
        creds_path = pathlib.Path(base_dir) / "admin_credentials.txt"
        with open(creds_path, "w") as f:
            f.write(f"username={username}\npassword={password}\n")
        os.chmod(creds_path, 0o600)
        print(f"[migrate] Credenciais admin salvas em: {creds_path}")

if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        db.create_all()
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        ensure_admin(db.session, base_dir)
        created = seed_services(db.session)
        print(f"Migração concluída. Serviços adicionados: {created}.")
MIGRATE_EOF

  # Worker - versão otimizada
  cat > "$INSTALL_DIR/src/worker.py" <<'WORKER_EOF'
import os, time, redis, datetime, re, requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

def detect_service(session, content: str):
    from models import Service
    services = session.query(Service).all()
    for s in services:
        try:
            if re.search(s.code_regex, content or "", flags=re.IGNORECASE):
                return s.name
        except re.error:
            continue
    return None

def push_webhook(engine, client_id: int, message_row):
    if not client_id:
        return
    with engine.begin() as conn:
        c = conn.execute(text("SELECT webhook_url, webhook_token, webhook_enabled FROM client WHERE id=:cid"), {"cid": client_id}).fetchone()
    if not c or not c.webhook_enabled or not c.webhook_url:
        return
    headers = {"Content-Type": "application/json"}
    if c.webhook_token:
        headers["X-Webhook-Token"] = c.webhook_token
    payload = {
        "type": "delivery",
        "delivery": {
            "client_id": client_id,
            "message_id": message_row.id,
            "sender": message_row.sender,
            "recipient": message_row.recipient,
            "content": message_row.content,
            "service": message_row.detected_service,
            "provider": message_row.provider,
            "timestamp": message_row.timestamp.isoformat() + "Z" if message_row.timestamp else None
        }
    }
    try:
        requests.post(c.webhook_url, json=payload, timeout=5, headers=headers)
    except Exception:
        pass

def create_deliveries_to_did_owner(session, engine, message_id: int, platform: str, recipient_e164: str):
    if not recipient_e164:
        return
    row = session.execute(text("SELECT client_id FROM phone_number WHERE e164=:e AND status='active'"), {"e": recipient_e164}).fetchone()
    if not row or not row[0]:
        return
    cid = row[0]
    now = datetime.datetime.utcnow()
    with engine.begin() as conn:
        conn.execute(text("""
          INSERT INTO message_delivery (message_id, client_id, platform, created_at)
          SELECT :mid, :cid, :plat, :ts
          WHERE NOT EXISTS (
            SELECT 1 FROM message_delivery WHERE message_id=:mid AND client_id=:cid
          )
        """), {"mid": message_id, "cid": cid, "plat": platform or '', "ts": now})
    with engine.begin() as conn:
        m = conn.execute(text("SELECT id, sender, recipient, content, detected_service, provider, timestamp FROM message WHERE id=:mid"), {"mid": message_id}).fetchone()
    if m:
        class Row: pass
        r = Row(); r.id,r.sender,r.recipient,r.content,r.detected_service,r.provider,r.timestamp = m
        push_webhook(engine, cid, r)

def main():
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    r = redis.from_url(redis_url)
    db_url = os.getenv("DATABASE_URL")
    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    print(f"[worker] Redis={redis_url}")

    while True:
        now = datetime.datetime.utcnow().isoformat()
        r.set("smpp:last_heartbeat", now)

        with engine.begin() as conn:
            rows = conn.execute(text("SELECT id, content, recipient FROM message WHERE detected_service IS NULL AND status <> 'dlr' LIMIT 100")).fetchall()
        if rows:
            session = Session()
            try:
                for rid, content, recipient in rows:
                    svc = detect_service(session, content or "")
                    with engine.begin() as conn:
                        conn.execute(text("UPDATE message SET detected_service=:svc WHERE id=:rid"), {"svc": svc, "rid": rid})
                    create_deliveries_to_did_owner(session, engine, rid, svc or '', recipient)
            finally:
                session.close()

        time.sleep(3)

if __name__ == "__main__":
    main()
WORKER_EOF

  # Telecall Client - versão otimizada
  cat > "$INSTALL_DIR/src/telecall_client.py" <<'TELECALL_EOF'
import os, time, logging, signal, sys, datetime, requests
from dotenv import load_dotenv
import smpplib.client
import smpplib.consts

logging.basicConfig(level=logging.INFO, format='[telecall] %(asctime)s %(levelname)s %(message)s')

def pdu_text(pdu):
    candidates = ('utf-8','latin1')
    for enc in candidates:
        try:
            return (pdu.short_message.decode(enc) if isinstance(pdu.short_message, bytes) else str(pdu.short_message))
        except Exception:
            continue
    try:
        return str(pdu.short_message)
    except Exception:
        return ""

def format_e164(num: str):
    if not num:
        return None
    n = ''.join(ch for ch in str(num) if ch.isdigit() or ch == '+')
    if n and n[0] != '+':
        n = '+' + n
    return n

def send_to_api(endpoint, data):
    try:
        response = requests.post(endpoint, json=data, timeout=10)
        return response.status_code == 200
    except Exception:
        return False

def on_deliver_sm(pdu):
    try:
        if pdu.command == smpplib.consts.SMPP_PDU_DELIVER_SM:
            src = pdu.source_addr.decode() if isinstance(pdu.source_addr, bytes) else pdu.source_addr
            dst = pdu.dest_addr.decode() if isinstance(pdu.dest_addr, bytes) else pdu.dest_addr
            sender = format_e164(src)
            recipient = format_e164(dst)
            content = pdu_text(pdu)
            is_dlr = hasattr(pdu, 'esm_class') and (pdu.esm_class & 0x04)
            data = {
                "type": "dlr" if is_dlr else "mo",
                "sender": sender,
                "recipient": recipient,
                "content": content,
                "timestamp": datetime.datetime.utcnow().isoformat(),
                "provider": "telecall"
            }
            api_endpoint = os.getenv("TELECALL_API_ENDPOINT", "http://localhost:8000/api/v1/mo")
            send_to_api(api_endpoint, data)
            logging.info("Telecall %s: %s -> %s | %s", "DLR" if is_dlr else "MO", sender, recipient, (content or "")[:160])
    except Exception as e:
        logging.error("Falha processando deliver_sm: %s", e)

def main():
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
    enable = os.getenv("TELECALL_ENABLE_CLIENT", "1") == "1"
    if not enable:
        logging.info("Cliente Telecall desativado (TELECALL_ENABLE_CLIENT != 1). Saindo.")
        return

    host = "198.54.166.74"; port = 2875
    system_id = "WhatsInfo_otp"; password = "juebkiur"
    system_type = ""; bind_ton = 1; bind_npi = 1; address_range = ""

    def handle_sigterm(signum, frame):
        logging.info("Encerrando cliente Telecall…"); sys.exit(0)
    signal.signal(signal.SIGTERM, handle_sigterm)
    signal.signal(signal.SIGINT, handle_sigterm)

    logging.info("Iniciando cliente SMPP para Telecall... %s:%s", host, port)
    while True:
        try:
            client = smpplib.client.Client(host, port)
            client.set_message_received_handler(on_deliver_sm)
            client.connect()
            client.bind_transceiver(system_id=system_id, password=password, system_type=system_type,
                                    addr_ton=bind_ton, addr_npi=bind_npi, address_range=address_range)
            logging.info("✅ CONECTADO à Telecall %s:%s como transceiver.", host, port)
            client.listen()
        except Exception as e:
            logging.error("❌ Erro conexão Telecall: %s. Reconectando em 10s...", e)
            time.sleep(10)

if __name__ == "__main__":
    main()
TELECALL_EOF

  # SMPP Connector - versão otimizada
  cat > "$INSTALL_DIR/src/smpp_connector.py" <<'SMPP_CONNECTOR_EOF'
import os, time, logging, signal, sys, re, datetime, requests
from dotenv import load_dotenv
import smpplib.client
import smpplib.consts
from sqlalchemy import create_engine, text

logging.basicConfig(level=logging.INFO, format='[smpp] %(asctime)s %(levelname)s %(message)s')

def _safe_int(val, default):
    try:
        return int(str(val).strip())
    except Exception:
        return default

def detect_service(engine, text_content: str):
    with engine.begin() as conn:
        services = conn.execute(text("SELECT name, code_regex FROM service")).fetchall()
    for name, regex in services:
        try:
            if re.search(regex, text_content or "", flags=re.IGNORECASE):
                return name
        except re.error:
            continue
    return None

def push_webhook(engine, client_id: int, message_row):
    if not client_id:
        return
    with engine.begin() as conn:
        c = conn.execute(text("SELECT webhook_url, webhook_token, webhook_enabled FROM client WHERE id=:cid"), {"cid": client_id}).fetchone()
    if not c or not c.webhook_enabled or not c.webhook_url:
        return
    headers = {"Content-Type": "application/json"}
    if c.webhook_token:
        headers["X-Webhook-Token"] = c.webhook_token
    payload = {
        "type": "delivery",
        "delivery": {
            "client_id": client_id,
            "message_id": message_row.id,
            "sender": message_row.sender,
            "recipient": message_row.recipient,
            "content": message_row.content,
            "service": message_row.detected_service,
            "provider": message_row.provider,
            "timestamp": message_row.timestamp.isoformat() + "Z" if message_row.timestamp else None
        }
    }
    try:
        requests.post(c.webhook_url, json=payload, timeout=5, headers=headers)
    except Exception:
        pass

def insert_message_and_deliver(engine, sender, recipient, provider, content):
    with engine.begin() as conn:
        res = conn.execute(text("""
            INSERT INTO message (sender, recipient, provider, content, status, timestamp)
            VALUES (:s, :r, :p, :c, 'received', :ts)
            RETURNING id
        """), {"s": sender, "r": recipient, "p": provider, "c": content, "ts": datetime.datetime.utcnow()})
        mid = res.fetchone()[0]
    svc = detect_service(engine, content)
    with engine.begin() as conn:
        conn.execute(text("UPDATE message SET detected_service=:svc WHERE id=:mid"), {"svc": svc, "mid": mid})
    with engine.begin() as conn:
        row = conn.execute(text("SELECT client_id FROM phone_number WHERE e164=:e AND status='active'"), {"e": recipient}).fetchone()
    if row and row[0]:
        cid = row[0]
        with engine.begin() as conn:
            conn.execute(text("""
              INSERT INTO message_delivery (message_id, client_id, platform, created_at)
              SELECT :mid, :cid, :plat, :ts
              WHERE NOT EXISTS (SELECT 1 FROM message_delivery WHERE message_id=:mid AND client_id=:cid)
            """), {"mid": mid, "cid": cid, "plat": svc or '', "ts": datetime.datetime.utcnow()})
        with engine.begin() as conn:
            m = conn.execute(text("SELECT id, sender, recipient, content, detected_service, provider, timestamp FROM message WHERE id=:mid"), {"mid": mid}).fetchone()
        if m:
            class Row: pass
            r = Row(); r.id,r.sender,r.recipient,r.content,r.detected_service,r.provider,r.timestamp = m
            push_webhook(engine, cid, r)

def pdu_text(pdu):
    candidates = ('utf-8','latin1')
    for enc in candidates:
        try:
            return (pdu.short_message.decode(enc) if isinstance(pdu.short_message, bytes) else str(pdu.short_message))
        except Exception:
            continue
    try:
        return str(pdu.short_message)
    except Exception:
        return ""

def format_e164(num: str):
    if not num:
        return None
    n = ''.join(ch for ch in str(num) if ch.isdigit() or ch == '+')
    if n and n[0] != '+':
        n = '+' + n
    return n

def on_deliver_sm(engine, pdu):
    try:
        if pdu.command == smpplib.consts.SMPP_PDU_DELIVER_SM:
            src = pdu.source_addr.decode() if isinstance(pdu.source_addr, bytes) else pdu.source_addr
            dst = pdu.dest_addr.decode() if isinstance(pdu.dest_addr, bytes) else pdu.dest_addr
            sender = format_e164(src)
            recipient = format_e164(dst)
            content = pdu_text(pdu)
            insert_message_and_deliver(engine, sender, recipient, 'smpp', content)
            logging.info("deliver_sm %s -> %s | %s", sender, recipient, (content or "")[:160])
    except Exception as e:
        logging.error("Falha processando deliver_sm: %s", e)

def main():
    load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
    enable = os.getenv("SMPP_ENABLE_CONNECTOR", "0") == "1"
    if not enable:
        logging.info("Conector SMPP desativado (SMPP_ENABLE_CONNECTOR != 1). Saindo.")
        return

    host = os.getenv("SMPP_VENDOR_HOST") or "127.0.0.1"
    port = _safe_int(os.getenv("SMPP_VENDOR_PORT", "2875"), 2875)
    system_id = os.getenv("SMPP_BIND_SYSTEM_ID") or ""
    password = os.getenv("SMPP_BIND_PASSWORD") or ""
    system_type = os.getenv("SMPP_BIND_SYSTEM_TYPE") or ""
    bind_ton = _safe_int(os.getenv("SMPP_BIND_TON", "1"), 1)
    bind_npi = _safe_int(os.getenv("SMPP_BIND_NPI", "1"), 1)
    address_range = os.getenv("SMPP_ADDRESS_RANGE") or ""
    bind_mode = (os.getenv("SMPP_BIND_MODE","transceiver") or "transceiver").lower()

    db_url = os.getenv("DATABASE_URL")
    engine = create_engine(db_url)

    def handle_sigterm(signum, frame):
        logging.info("Recebido sinal %s, encerrando conector SMPP…", signum)
        sys.exit(0)
    signal.signal(signal.SIGTERM, handle_sigterm)
    signal.signal(signal.SIGINT, handle_sigterm)

    while True:
        try:
            client = smpplib.client.Client(host, port)
            client.set_message_received_handler(lambda pdu: on_deliver_sm(engine, pdu))
            client.connect()

            if bind_mode == "receiver":
                client.bind_receiver(system_id=system_id, password=password, system_type=system_type,
                                     addr_ton=bind_ton, addr_npi=bind_npi, address_range=address_range)
                logging.info("Conectado ao SMSC %s:%s como receiver.", host, port)
            elif bind_mode == "transmitter":
                client.bind_transmitter(system_id=system_id, password=password, system_type=system_type,
                                        addr_ton=bind_ton, addr_npi=bind_npi, address_range=address_range)
                logging.info("Conectado ao SMSC %s:%s como transmitter.", host, port)
            else:
                client.bind_transceiver(system_id=system_id, password=password, system_type=system_type,
                                        addr_ton=bind_ton, addr_npi=bind_npi, address_range=address_range)
                logging.info("Conectado ao SMSC %s:%s como transceiver.", host, port)

            client.listen()
        except Exception as e:
            logging.error("Erro SMPP: %s. Re-conectando em 5s...", e)
            time.sleep(5)

if __name__ == "__main__":
  main()
SMPP_CONNECTOR_EOF

  # Main app - versão otimizada (sem SMSC no painel)
  cat > "$INSTALL_DIR/src/main.py" <<'MAIN_EOF'
from gevent import monkey
monkey.patch_all()

import os, logging, datetime, socket, re, subprocess, sys, tempfile, shutil, requests
from dotenv import load_dotenv
from flask import Flask, render_template, request, redirect, jsonify, abort
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from flask_socketio import SocketIO
from sqlalchemy import select, text
import redis

from models import db, bcrypt, User, Message, Client, Service, ClientService, MessageDelivery, PhoneNumber, seed_services

def _safe_int(val, default):
    try:
        return int(str(val).strip())
    except Exception:
        return default

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
logging.basicConfig(filename='../logs/app.log', level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

app = Flask(__name__, template_folder="../templates/matrix-admin/html", static_folder="../templates/matrix-admin/assets")
app.static_url_path = "/assets"
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "supersecretkey")
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)
bcrypt.init_app(app)

login_manager = LoginManager()
login_manager.login_view = "login"
login_manager.init_app(app)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
socketio = SocketIO(app, async_mode="gevent", cors_allowed_origins="*", message_queue=REDIS_URL)
r = redis.from_url(REDIS_URL)
STREAM_SMPP = os.getenv("STREAM_SMPP", "stream:smpp")
STREAM_CLIENT = os.getenv("STREAM_CLIENT", "stream:client")

def current_vendor():
    return {
        "ip": os.getenv('SMPP_VENDOR_HOST', '198.54.166.74'),
        "port": _safe_int(os.getenv('SMPP_VENDOR_PORT', '2875'), 2875),
        "bind_mode": os.getenv('SMPP_BIND_MODE', 'transceiver'),
        "dcs": 'GSM 03.38 7-bit (DCS=0) | UCS2 ISO/IEC-10646 (DCS=8)',
        "billing": 'Bill by Submitted',
        "currency": 'TBA'
    }

@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

@app.route("/login", methods=["GET", "POST"])
def login():
    from flask import render_template
    if current_user.is_authenticated:
        return redirect("/")
    error = None
    if request.method == "POST":
        username = request.form.get("username","").strip()
        password = request.form.get("password","")
        user = db.session.execute(select(User).where(User.username == username)).scalar_one_or_none()
        if user and user.check_password(password):
            login_user(user)
            return redirect("/")
        error = "Credenciais inválidas"
    return render_template("login.html", error=error)

@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect("/login")

@app.route("/")
@login_required
def index():
    return render_template(
        "dashboard.html",
        redis_url=REDIS_URL, stream_smpp=STREAM_SMPP, stream_client=STREAM_CLIENT,
        smpp_ports=os.getenv("SMPP_PORTS", "2775"), vendor=current_vendor()
    )

@app.get("/healthz")
def healthz():
    try:
        db.session.execute(select(User).limit(1)).first()
        return jsonify(ok=True, db=True), 200
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 500

@app.get("/smpp/status")
def smpp_status():
    v = current_vendor()
    host, port = v["ip"], int(v["port"])
    ok = False; err = None
    try:
        s = socket.create_connection((host, port), timeout=2.0)
        s.close(); ok = True
    except Exception as e:
        err = str(e)[:200]
    return jsonify(ok=ok, vendor=dict(ip=host, port=port), error=err)

@app.get("/smpp/vendor-19854")
@login_required
def vendor_page():
    one_min = datetime.datetime.utcnow() - datetime.timedelta(minutes=1)
    rate = db.session.query(Message).where(Message.timestamp > one_min).count()
    stats = {"rate": rate, "latency": 42, "errors": 0}
    return render_template("vendor-19854.html", vendor=current_vendor(), stats=stats)

@app.get("/smpp/vendor-19854/ping")
def vendor_ping():
    v = current_vendor()
    host, port = v["ip"], int(v["port"])
    ok = False; err = None
    try:
        s = socket.create_connection((host, port), timeout=2.0)
        s.close(); ok = True
    except Exception as e:
        err = str(e)[:200]
    return jsonify(ok=ok, error=err)

@app.get("/smpp/vendor-19854/messages")
@login_required
def vendor_messages():
    msgs = db.session.query(Message).order_by(Message.id.desc()).limit(6).all()
    return jsonify(messages=[{
        "sender": m.sender, "content": m.content,
        "time": m.timestamp.strftime("%H:%M:%S")
    } for m in msgs])

@app.get("/smpp/vendor-19854/stats")
@login_required
def vendor_stats():
    one_min = datetime.datetime.utcnow() - datetime.timedelta(minutes=1)
    return jsonify(rate=db.session.query(Message).where(Message.timestamp > one_min).count(),
                   latency=42, errors=0)

# =========================
# Administração - Clientes
# =========================
@app.get("/admin/clients")
@login_required
def admin_clients():
    rows = []
    for c in db.session.query(Client).order_by(Client.id.desc()).all():
        rows.append(type("Row", (), dict(
            id=c.id, name=c.name, api_key=c.api_key,
            last_seen=c.last_seen,
            webhook_url=c.webhook_url, webhook_enabled=c.webhook_enabled
        )))
    base_url = request.url_root
    return render_template("admin_clients.html", clients=rows, base_url=base_url)

@app.route("/admin/clients/new", methods=["GET","POST"])
@login_required
def admin_client_new():
    from flask import render_template
    if request.method == "POST":
        name = request.form.get("name","").strip()
        webhook_url = (request.form.get("webhook_url") or "").strip() or None
        webhook_token = (request.form.get("webhook_token") or "").strip() or None
        webhook_enabled = request.form.get("webhook_enabled") == "1"
        if not name:
            return render_template("admin_client_form.html", client=None, error="Nome é obrigatório")
        if db.session.query(Client).filter_by(name=name).first():
            return render_template("admin_client_form.html", client=None, error="Nome já existente")
        c = Client(name=name, api_key=Client.new_api_key(), webhook_url=webhook_url, webhook_token=webhook_token, webhook_enabled=webhook_enabled)
        db.session.add(c); db.session.commit()
        return redirect("/admin/clients")
    return render_template("admin_client_form.html", client=None)

@app.route("/admin/clients/<int:cid>/edit", methods=["GET","POST"])
@login_required
def admin_client_edit(cid):
    from flask import render_template
    c = db.session.get(Client, cid) or abort(404)
    if request.method == "POST":
        name = request.form.get("name","").strip()
        webhook_url = (request.form.get("webhook_url") or "").strip() or None
        webhook_token = (request.form.get("webhook_token") or "").strip() or None
        webhook_enabled = request.form.get("webhook_enabled") == "1"
        if not name:
            return render_template("admin_client_form.html", client=c, error="Nome é obrigatório")
        c.name = name
        c.webhook_url = webhook_url
        c.webhook_token = webhook_token
        c.webhook_enabled = webhook_enabled
        db.session.commit()
        return redirect("/admin/clients")
    return render_template("admin_client_form.html", client=c)

@app.get("/admin/clients/<int:cid>/rotate-key")
@login_required
def admin_client_rotate_key(cid):
    c = db.session.get(Client, cid) or abort(404)
    c.rotate_key(); db.session.commit()
    return redirect("/admin/clients")

# ==========
# Admin DIDs
# ==========
@app.get("/admin/dids")
@login_required
def admin_dids():
    rows = db.session.execute(text("""
      SELECT pn.id, pn.e164, pn.provider, pn.status, pn.created_at, c.name as client_name
      FROM phone_number pn
      LEFT JOIN client c ON c.id=pn.client_id
      ORDER BY pn.id DESC
    """)).fetchall()
    dids = []
    for r in rows:
        dids.append(type("Row", (), dict(
            id=r.id, e164=r.e164, provider=r.provider, status=r.status,
            created_at=r.created_at, client_name=r.client_name
        )))
    counts = {
        "total": db.session.execute(text("SELECT COUNT(*) FROM phone_number")).scalar() or 0,
        "available": db.session.execute(text("SELECT COUNT(*) FROM phone_number WHERE status='active' AND (client_id IS NULL OR client_id=0)")).scalar() or 0,
        "used": db.session.execute(text("SELECT COUNT(*) FROM phone_number WHERE status='active' AND client_id IS NOT NULL AND client_id<>0")).scalar() or 0,
    }
    return render_template("admin_dids.html", dids=dids, counts=counts)

@app.route("/admin/dids/new", methods=["GET","POST"])
@login_required
def admin_did_new():
    from flask import render_template
    clients = db.session.query(Client).order_by(Client.name.asc()).all()
    if request.method == "POST":
        e164 = request.form.get("e164","").strip()
        client_id = request.form.get("client_id") or None
        provider = request.form.get("provider","").strip() or None
        status = request.form.get("status","active")
        if not e164:
            return render_template("admin_did_form.html", did=None, clients=clients, error="E164 é obrigatório")
        if db.session.query(PhoneNumber).filter_by(e164=e164).first():
            return render_template("admin_did_form.html", did=None, clients=clients, error="E164 já cadastrado")
        pn = PhoneNumber(e164=e164, client_id=int(client_id) if client_id else None, provider=provider, status=status)
        db.session.add(pn); db.session.commit()
        return redirect("/admin/dids")
    return render_template("admin_did_form.html", did=None, clients=clients)

@app.route("/admin/dids/import", methods=["GET","POST"])
@login_required
def admin_dids_import():
    from flask import render_template
    clients = db.session.query(Client).order_by(Client.name.asc()).all()
    if request.method == "POST":
        client_id = request.form.get("client_id") or None
        provider = (request.form.get("provider") or "").strip() or None
        status = request.form.get("status","active")
        pasted = (request.form.get("numbers") or "").strip()
        file = request.files.get("file")
        raw_lines = []
        if pasted:
            raw_lines.extend(pasted.splitlines())
        if file and file.filename:
            try:
                content = file.read().decode("utf-8", errors="ignore")
                raw_lines.extend(content.splitlines())
            except Exception as e:
                return render_template("admin_dids_import.html", clients=clients, error=f"Falha lendo arquivo: {e}")
        nums = []
        seen = set()
        for ln in raw_lines:
            n = ''.join(ch for ch in ln if ch.isdigit() or ch=='+')
            if not n:
                continue
            if n[0] != '+':
                n = '+' + n
            n = n.replace('++','+')
            if len(n) < 5:
                continue
            if n in seen:
                continue
            seen.add(n)
            nums.append(n)
        if not nums:
            return render_template("admin_dids_import.html", clients=clients, error="Nenhum número válido encontrado.")
        inserted = 0; skipped = 0
        for n in nums:
            if db.session.query(PhoneNumber).filter_by(e164=n).first():
                skipped += 1
                continue
            pn = PhoneNumber(e164=n, client_id=int(client_id) if client_id else None, provider=provider, status=status)
            db.session.add(pn)
            inserted += 1
        if inserted:
            db.session.commit()
        msg = f"Importação concluída. Inseridos: {inserted}. Ignorados (duplicados): {skipped}."
        return render_template("admin_dids_import.html", clients=clients, msg=msg)
    return render_template("admin_dids_import.html", clients=clients)

@app.route("/admin/dids/<int:did_id>/edit", methods=["GET","POST"])
@login_required
def admin_did_edit(did_id):
    from flask import render_template
    did = db.session.get(PhoneNumber, did_id) or abort(404)
    clients = db.session.query(Client).order_by(Client.name.asc()).all()
    if request.method == "POST":
        e164 = request.form.get("e164","").strip()
        client_id = request.form.get("client_id") or None
        provider = request.form.get("provider","").strip() or None
        status = request.form.get("status","active")
        if not e164:
            return render_template("admin_did_form.html", did=did, clients=clients, error="E164 é obrigatório")
        if db.session.query(PhoneNumber).filter(PhoneNumber.e164==e164, PhoneNumber.id!=did.id).first():
            return render_template("admin_did_form.html", did=did, clients=clients, error="E164 já cadastrado em outro DID")
        did.e164 = e164
        did.client_id = int(client_id) if client_id else None
        did.provider = provider
        did.status = status
        db.session.commit()
        return redirect("/admin/dids")
    return render_template("admin_did_form.html", did=did, clients=clients)

# ===========
# Serviços Admin
# ===========
@app.get("/admin/services")
@login_required
def admin_services():
    services = db.session.query(Service).order_by(Service.name.asc()).all()
    return render_template("admin_services.html", services=services)

@app.get("/admin/services/seed")
@login_required
def admin_services_seed():
    created = seed_services(db.session)
    return redirect("/admin/services")

# ===========
# API Cliente
# ===========
def detect_service_for_text(text_content: str):
    services = db.session.query(Service).all()
    for s in services:
        try:
            if re.search(s.code_regex, text_content or "", flags=re.IGNORECASE):
                return s.name
        except re.error:
            continue
    return None

def push_webhook(client_id: int, message: Message):
    if not client_id:
        return
    c = db.session.get(Client, client_id)
    if not c or not c.webhook_enabled or not c.webhook_url:
        return
    headers = {"Content-Type": "application/json"}
    if c.webhook_token:
        headers["X-Webhook-Token"] = c.webhook_token
    payload = {
        "type": "delivery",
        "delivery": {
            "client_id": client_id,
            "message_id": message.id,
            "sender": message.sender,
            "recipient": message.recipient,
            "content": message.content,
            "service": message.detected_service,
            "provider": message.provider,
            "timestamp": message.timestamp.isoformat() + "Z" if message.timestamp else None
        }
    }
    try:
        requests.post(c.webhook_url, json=payload, timeout=5, headers=headers)
    except Exception:
        pass

def create_delivery_to_did_owner(message_id: int, platform: str, recipient_e164: str):
    row = db.session.execute(text("SELECT client_id FROM phone_number WHERE e164=:e AND status='active'"), {"e": recipient_e164}).fetchone()
    if row and row[0]:
        cid = row[0]
        db.session.execute(text("""
          INSERT INTO message_delivery (message_id, client_id, platform, created_at)
          SELECT :mid, :cid, :plat, :ts
          WHERE NOT EXISTS (SELECT 1 FROM message_delivery WHERE message_id=:mid AND client_id=:cid)
        """), {"mid": message_id, "cid": cid, "plat": platform or '', "ts": datetime.datetime.utcnow()})
        db.session.commit()
        msg = db.session.get(Message, message_id)
        if msg:
            push_webhook(cid, msg)

@app.get("/api/v1/messages")
def api_messages_get():
    api_key = request.args.get("api_key") or request.headers.get("X-API-Key")
    if not api_key:
        return jsonify(error="api_key ausente"), 401
    client = db.session.query(Client).filter_by(api_key=api_key).first()
    if not client:
        return jsonify(error="api_key inválida"), 403
    client.last_seen = datetime.datetime.utcnow()
    db.session.commit()

    rows = db.session.execute(text("""
      SELECT md.id, m.id as message_id, m.sender, m.recipient, m.content, m.detected_service, m.provider, m.timestamp
      FROM message_delivery md
      JOIN message m ON m.id=md.message_id
      WHERE md.client_id=:cid
      ORDER BY md.id DESC
      LIMIT 200
    """), {"cid": client.id}).fetchall()

    out = []
    for row in rows:
        out.append({
            "delivery_id": row.id,
            "message_id": row.message_id,
            "sender": row.sender,
            "recipient": row.recipient,
            "content": row.content,
            "service": row.detected_service,
            "provider": row.provider,
            "timestamp": (row.timestamp.isoformat() + "Z") if row.timestamp else None
        })
    return jsonify(messages=out)

@app.post("/api/v1/messages")
def api_messages_post():
    data = request.get_json(silent=True) or {}
    api_key = data.get("api_key") or request.headers.get("X-API-Key")
    if not api_key:
        return jsonify(error="api_key ausente"), 401
    client = db.session.query(Client).filter_by(api_key=api_key).first()
    if not client:
        return jsonify(error="api_key inválida"), 403
    client.last_seen = datetime.datetime.utcnow()
    db.session.commit()
    return api_messages_get()

# ===========
# API MO/DLR da Telecall
# ===========
@app.post("/api/v1/mo")
def api_mo():
    data = request.get_json(silent=True) or {}
    msg_type = data.get("type", "mo")
    sender = data.get("sender", "")
    recipient = data.get("recipient", "")
    content = data.get("content", "")
    provider = data.get("provider", "telecall")
    if not recipient:
        return jsonify(error="recipient é obrigatório"), 400

    m = Message(sender=sender, recipient=recipient, provider=provider, content=content,
                status='dlr' if msg_type == 'dlr' else 'received')

    if msg_type == "mo":
        svc = detect_service_for_text(content); m.detected_service = svc
        db.session.add(m); db.session.commit()
        create_delivery_to_did_owner(m.id, svc, recipient)
        logging.info("MO Telecall: %s -> %s | %s", sender, recipient, content[:100])
    else:
        db.session.add(m); db.session.commit()
        logging.info("DLR Telecall: %s -> %s | %s", sender, recipient, content[:100])
    return jsonify(ok=True, id=m.id, type=msg_type)

@app.post("/api/v1/send")
def api_send_sms():
    data = request.get_json(silent=True) or {}
    api_key = data.get("api_key") or request.headers.get("X-API-Key")
    if not api_key:
        return jsonify(error="api_key ausente"), 401
    client = db.session.query(Client).filter_by(api_key=api_key).first()
    if not client:
        return jsonify(error="api_key inválida"), 403
    to = data.get("to", "").strip(); text = data.get("text", "").strip(); from_number = data.get("from", "").strip()
    if not to or not text:
        return jsonify(error="'to' e 'text' são obrigatórios"), 400
    m = Message(sender=from_number or "system", recipient=to, provider="telecall_mt", content=text, status="sent")
    db.session.add(m); db.session.commit()
    client.last_seen = datetime.datetime.utcnow(); db.session.commit()
    return jsonify(ok=True, message_id=m.id, status="sent")

# ===========
# Webhook SMS
# ===========
@app.post("/webhook/sms")
def webhook_sms():
    token = os.getenv("WEBHOOK_TOKEN","")
    if token:
        got = request.headers.get("X-Webhook-Token","")
        if got != token:
            return jsonify(error="unauthorized"), 401

    data = request.get_json(silent=True) or {}
    sender = (data.get("from") or data.get("sender") or "").strip()
    recipient = (data.get("to") or data.get("recipient") or "").strip()
    content = (data.get("text") or data.get("message") or "").strip()
    provider = (data.get("provider") or "webhook").strip()

    def norm(num):
        n = ''.join(ch for ch in (num or "") if ch.isdigit() or ch=='+')
        if n and n[0] != '+':
            n = '+' + n
        return n
    sender = norm(sender); recipient = norm(recipient)

    if not recipient or not content:
        return jsonify(error="campos obrigatórios: to/recipient e text/message"), 400

    m = Message(sender=sender, recipient=recipient, provider=provider, content=content)
    svc = detect_service_for_text(content); m.detected_service = svc
    db.session.add(m); db.session.commit()
    create_delivery_to_did_owner(m.id, svc, recipient)
    return jsonify(ok=True, id=m.id, service=svc)

# ===========
# Ingestão manual
# ===========
@app.post("/api/v1/ingest")
@login_required
def api_ingest():
    data = request.get_json(silent=True) or {}
    sender = data.get("sender","unknown")
    recipient = data.get("recipient") or data.get("to") or ""
    provider = data.get("provider") or "manual"
    content = data.get("content","")
    m = Message(sender=sender, recipient=recipient, provider=provider, content=content)
    svc = detect_service_for_text(content); m.detected_service = svc
    db.session.add(m); db.session.commit()
    create_delivery_to_did_owner(m.id, svc, recipient)
    return jsonify(ok=True, id=m.id, service=svc)

# Últimas entregas para o dashboard
@app.get("/admin/deliveries/recent")
@login_required
def deliveries_recent():
    rows = db.session.execute(text("""
      SELECT md.id, c.name as client, md.platform, m.sender, m.content, m.timestamp
      FROM message_delivery md
      JOIN client c ON c.id=md.client_id
      JOIN message m ON m.id=md.message_id
      ORDER BY md.id DESC
      LIMIT 200
    """)).fetchall()
    deliveries = []
    for r in rows:
        deliveries.append({
            "id": r.id,
            "client": r.client,
            "platform": r.platform,
            "sender": r.sender,
            "text": r.content,
            "timestamp": r.timestamp.strftime("%Y-%m-%d %H:%M:%S") if r.timestamp else None,
        })
    return jsonify(deliveries=deliveries)

# =============
# Smoke test
# =============
@app.get("/smoke")
def smoke():
    try:
        db.session.execute(select(User).limit(1)).first()
        return jsonify(ok=True)
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 500

if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    socketio.run(app, host="0.0.0.0", port=8000)
MAIN_EOF

  ok "Aplicação escrita"
}

write_supervisor(){
  step "Criando serviços (systemd)…"
  as_root bash -lc "cat > /etc/systemd/system/smpp_web.service" <<'WEB_SERVICE_EOF'
[Unit]
Description=SMPP Admin (Gunicorn)
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=__INSTALL_DIR__/src
Environment="PATH=__INSTALL_DIR__/venv/bin"
ExecStart=__INSTALL_DIR__/venv/bin/gunicorn -k gevent -w __WEB_WORKERS__ -b 0.0.0.0:8000 main:app
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
WEB_SERVICE_EOF

  as_root bash -lc "cat > /etc/systemd/system/smpp_worker.service" <<'WORKER_SERVICE_EOF'
[Unit]
Description=SMPP Worker (classifier/dispatcher)
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=__INSTALL_DIR__/src
Environment="PATH=__INSTALL_DIR__/venv/bin"
ExecStart=__INSTALL_DIR__/venv/bin/python worker.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
WORKER_SERVICE_EOF

  as_root bash -lc "cat > /etc/systemd/system/telecall_client.service" <<'TELECALL_SERVICE_EOF'
[Unit]
Description=Telecall SMPP Client (MO/DLR receiver)
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=__INSTALL_DIR__/src
Environment="PATH=__INSTALL_DIR__/venv/bin"
ExecStart=__INSTALL_DIR__/venv/bin/python telecall_client.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
TELECALL_SERVICE_EOF

  as_root bash -lc "cat > /etc/systemd/system/smpp_connector.service" <<'CONNECTOR_SERVICE_EOF'
[Unit]
Description=SMPP Connector (optional)
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service

[Service]
Type=simple
User=root
WorkingDirectory=__INSTALL_DIR__/src
Environment="PATH=__INSTALL_DIR__/venv/bin"
ExecStart=__INSTALL_DIR__/venv/bin/python smpp_connector.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
CONNECTOR_SERVICE_EOF

  sed -i "s#__INSTALL_DIR__#${INSTALL_DIR}#g" /etc/systemd/system/smpp_web.service /etc/systemd/system/smpp_worker.service /etc/systemd/system/telecall_client.service /etc/systemd/system/smpp_connector.service
  sed -i "s#__WEB_WORKERS__#${WEB_WORKERS}#g" /etc/systemd/system/smpp_web.service
  as_root systemctl daemon-reload
  ok "systemd units criados"
}

setup_firewall(){
  step "Ajustando firewall (ufw)…"
  if command -v ufw >/dev/null 2>&1; then
    as_root ufw allow 8000/tcp || true
    IFS=',' read -ra PORTS <<< "$SMPP_PORTS"
    for p in "${PORTS[@]}"; do
      as_root ufw allow "${p}"/tcp || true
    done
  fi
  ok "Firewall ajustado (porta web 8000 e SMPP ${SMPP_PORTS})"
}

create_venv_and_install(){
  step "Criando venv e instalando dependências…"
  python3 -m venv "$INSTALL_DIR/venv"
  "$INSTALL_DIR/venv/bin/pip" install --upgrade pip setuptools wheel
  "$INSTALL_DIR/venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"
  ok "venv pronto"
}

run_migrations(){
  step "Executando migração inicial…"
  PYTHONPATH="$INSTALL_DIR/src" "$INSTALL_DIR/venv/bin/python" "$INSTALL_DIR/src/migrate.py"
  ok "Migração concluída"
}

start_services(){
  step "Habilitando e iniciando serviços…"
  as_root systemctl enable --now smpp_web.service
  as_root systemctl enable --now smpp_worker.service
  as_root systemctl enable --now telecall_client.service
  if grep -q '^export SMPP_ENABLE_CONNECTOR="1"' "$INSTALL_DIR/.env"; then
    as_root systemctl enable --now smpp_connector.service || true
  else
    warn "Conector SMPP desativado no .env (SMPP_ENABLE_CONNECTOR!=1). Para ativar: systemctl start smpp_connector"
  fi
  ok "Serviços iniciados"
}

print_summary(){
  echo
  ok "Instalação concluída!"
  echo -e "${BLUE}Diretório:${NC} $INSTALL_DIR"
  echo -e "${BLUE}Web UI:${NC} http://$(hostname -I | awk '{print $1}'):8000/"
  echo -e "${BLUE}Credenciais admin:${NC} $INSTALL_DIR/admin_credentials.txt"
  echo -e "${BLUE}Arquivos de log:${NC} $INSTALL_DIR/logs/"
  echo -e "${BLUE}.env:${NC} $INSTALL_DIR/.env"
  echo -e "${BLUE}Services:${NC} smpp_web, smpp_worker, telecall_client, smpp_connector"
  echo
  echo -e "${YELLOW}IMPORTANTE:${NC}"
  echo -e "${YELLOW}• SMSC foi removido do painel admin - configure via .env${NC}"
  echo -e "${YELLOW}• Lógica Telecall otimizada para receber SMS via DID${NC}"
  echo -e "${YELLOW}• Problemas de heredoc corrigidos nos templates${NC}"
  echo -e "${YELLOW}• Para configurar SMSC: edite $INSTALL_DIR/.env e reinicie smpp_connector${NC}"
  echo
}

main(){
  require_cmds
  wipe_install_dir
  setup_postgres
  setup_ui
  apply_templates
  write_requirements
  write_app
  create_venv_and_install
  run_migrations
  write_supervisor
  setup_firewall
  start_services
  print_summary
}

main "$@"