"""
Aplicação Flask principal do Sistema SMPP
"""
import os
import sys
import json
import re
import hashlib
import hmac
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.exceptions import BadRequest
import redis
from dotenv import load_dotenv

# Adiciona o diretório src ao path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db, User, Client, Service, PhoneNumber, Message, MessageDelivery, SMSCConfig, SystemLog

# Carrega variáveis de ambiente
load_dotenv()

# Inicializa Flask
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Inicializa extensões
db.init_app(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Configuração do Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Por favor, faça login para acessar esta página.'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Configuração do Redis
redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'localhost'),
    port=int(os.getenv('REDIS_PORT', '6379')),
    password=os.getenv('REDIS_PASSWORD') or None,
    db=int(os.getenv('REDIS_DB', '0')),
    decode_responses=True
)

# ==================== UTILITÁRIOS ====================

def log_system(level, message, module='main'):
    """Registra log no sistema"""
    try:
        log_entry = SystemLog(level=level, message=message, module=module)
        db.session.add(log_entry)
        db.session.commit()
    except Exception as e:
        print(f"Erro ao registrar log: {e}")

def verify_webhook_signature(payload, signature, secret):
    """Verifica assinatura do webhook"""
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected_signature)

def classify_message(message_text):
    """Classifica mensagem por serviço baseado em regex"""
    services = Service.query.filter_by(is_active=True).all()
    
    for service in services:
        try:
            if re.search(service.regex_pattern, message_text, re.IGNORECASE):
                return service
        except re.error:
            continue
    
    return None

def get_client_by_did(destination_addr):
    """Obtém cliente baseado no DID"""
    phone_number = PhoneNumber.query.filter_by(
        number=destination_addr,
        is_active=True
    ).first()
    
    if phone_number:
        return phone_number.client
    return None

# ==================== ROTAS DE AUTENTICAÇÃO ====================

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        user = User.query.filter_by(username=username).first()
        
        if user and user.check_password(password) and user.is_active:
            login_user(user)
            user.last_login = datetime.utcnow()
            db.session.commit()
            log_system('INFO', f'Usuário {username} fez login', 'auth')
            return redirect(url_for('dashboard'))
        else:
            flash('Credenciais inválidas', 'error')
            log_system('WARNING', f'Tentativa de login inválida para {username}', 'auth')
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    log_system('INFO', f'Usuário {current_user.username} fez logout', 'auth')
    logout_user()
    return redirect(url_for('login'))

# ==================== DASHBOARD ====================

@app.route('/')
@login_required
def dashboard():
    """Dashboard principal"""
    # Estatísticas gerais
    total_messages = Message.query.count()
    total_clients = Client.query.filter_by(is_active=True).count()
    total_services = Service.query.filter_by(is_active=True).count()
    total_phone_numbers = PhoneNumber.query.filter_by(is_active=True).count()
    
    # Mensagens recentes
    recent_messages = Message.query.order_by(Message.created_at.desc()).limit(10).all()
    
    # Estatísticas por serviço
    service_stats = db.session.query(
        Service.name,
        db.func.count(Message.id).label('count')
    ).join(Message).group_by(Service.id).all()
    
    return render_template('dashboard.html',
                         total_messages=total_messages,
                         total_clients=total_clients,
                         total_services=total_services,
                         total_phone_numbers=total_phone_numbers,
                         recent_messages=recent_messages,
                         service_stats=service_stats)

# ==================== GESTÃO DE CLIENTES ====================

@app.route('/clients')
@login_required
def clients():
    """Lista de clientes"""
    clients = Client.query.order_by(Client.created_at.desc()).all()
    return render_template('clients.html', clients=clients)

@app.route('/clients/new', methods=['GET', 'POST'])
@login_required
def new_client():
    """Criar novo cliente"""
    if request.method == 'POST':
        client = Client(
            name=request.form['name'],
            email=request.form['email'],
            webhook_url=request.form.get('webhook_url'),
            is_active=bool(request.form.get('is_active'))
        )
        db.session.add(client)
        db.session.commit()
        log_system('INFO', f'Cliente {client.name} criado', 'clients')
        flash('Cliente criado com sucesso', 'success')
        return redirect(url_for('clients'))
    
    return render_template('client_form.html')

@app.route('/clients/<int:client_id>/edit', methods=['GET', 'POST'])
@login_required
def edit_client(client_id):
    """Editar cliente"""
    client = Client.query.get_or_404(client_id)
    
    if request.method == 'POST':
        client.name = request.form['name']
        client.email = request.form['email']
        client.webhook_url = request.form.get('webhook_url')
        client.is_active = bool(request.form.get('is_active'))
        client.updated_at = datetime.utcnow()
        db.session.commit()
        log_system('INFO', f'Cliente {client.name} atualizado', 'clients')
        flash('Cliente atualizado com sucesso', 'success')
        return redirect(url_for('clients'))
    
    return render_template('client_form.html', client=client)

# ==================== GESTÃO DE SERVIÇOS ====================

@app.route('/services')
@login_required
def services():
    """Lista de serviços"""
    services = Service.query.order_by(Service.name).all()
    return render_template('services.html', services=services)

@app.route('/services/new', methods=['GET', 'POST'])
@login_required
def new_service():
    """Criar novo serviço"""
    if request.method == 'POST':
        service = Service(
            name=request.form['name'],
            description=request.form.get('description'),
            regex_pattern=request.form['regex_pattern'],
            is_active=bool(request.form.get('is_active'))
        )
        db.session.add(service)
        db.session.commit()
        log_system('INFO', f'Serviço {service.name} criado', 'services')
        flash('Serviço criado com sucesso', 'success')
        return redirect(url_for('services'))
    
    return render_template('service_form.html')

# ==================== GESTÃO DE DIDs ====================

@app.route('/phone-numbers')
@login_required
def phone_numbers():
    """Lista de números telefônicos"""
    phone_numbers = PhoneNumber.query.order_by(PhoneNumber.number).all()
    clients = Client.query.filter_by(is_active=True).all()
    return render_template('phone_numbers.html', phone_numbers=phone_numbers, clients=clients)

@app.route('/phone-numbers/new', methods=['GET', 'POST'])
@login_required
def new_phone_number():
    """Criar novo número telefônico"""
    if request.method == 'POST':
        phone_number = PhoneNumber(
            number=request.form['number'],
            client_id=request.form['client_id'],
            is_active=bool(request.form.get('is_active'))
        )
        db.session.add(phone_number)
        db.session.commit()
        log_system('INFO', f'DID {phone_number.number} criado', 'phone_numbers')
        flash('Número telefônico criado com sucesso', 'success')
        return redirect(url_for('phone_numbers'))
    
    clients = Client.query.filter_by(is_active=True).all()
    return render_template('phone_number_form.html', clients=clients)

# ==================== MENSAGENS ====================

@app.route('/messages')
@login_required
def messages():
    """Lista de mensagens"""
    page = request.args.get('page', 1, type=int)
    per_page = 20
    
    messages = Message.query.order_by(Message.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    return render_template('messages.html', messages=messages)

# ==================== API REST ====================

@app.route('/api/v1/messages', methods=['GET'])
def api_get_messages():
    """API para consulta de mensagens por cliente"""
    api_key = request.headers.get('X-API-Key')
    if not api_key:
        return jsonify({'error': 'API key required'}), 401
    
    client = Client.query.filter_by(api_key=api_key, is_active=True).first()
    if not client:
        return jsonify({'error': 'Invalid API key'}), 401
    
    # Parâmetros de filtro
    limit = request.args.get('limit', 100, type=int)
    offset = request.args.get('offset', 0, type=int)
    service_id = request.args.get('service_id', type=int)
    
    query = Message.query.join(PhoneNumber).filter(PhoneNumber.client_id == client.id)
    
    if service_id:
        query = query.filter(Message.service_id == service_id)
    
    messages = query.order_by(Message.created_at.desc()).offset(offset).limit(limit).all()
    
    result = []
    for msg in messages:
        result.append({
            'id': msg.id,
            'message_id': msg.message_id,
            'source_addr': msg.source_addr,
            'destination_addr': msg.destination_addr,
            'short_message': msg.short_message,
            'message_type': msg.message_type,
            'status': msg.status,
            'service_name': msg.service.name if msg.service else None,
            'created_at': msg.created_at.isoformat()
        })
    
    return jsonify({
        'messages': result,
        'total': query.count(),
        'limit': limit,
        'offset': offset
    })

@app.route('/api/v1/mo', methods=['POST'])
def api_receive_mo():
    """API para recebimento de MO/DLR da Telecall"""
    try:
        data = request.get_json()
        
        # Validação básica
        required_fields = ['source_addr', 'destination_addr', 'short_message']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        # Cria mensagem
        message = Message(
            message_id=data.get('message_id', f"mo_{datetime.utcnow().timestamp()}"),
            source_addr=data['source_addr'],
            destination_addr=data['destination_addr'],
            short_message=data['short_message'],
            message_type=data.get('message_type', 'MO'),
            smpp_message_id=data.get('smpp_message_id')
        )
        
        # Classifica por serviço
        service = classify_message(data['short_message'])
        if service:
            message.service_id = service.id
        
        # Associa ao cliente via DID
        client = get_client_by_did(data['destination_addr'])
        if client:
            phone_number = PhoneNumber.query.filter_by(
                number=data['destination_addr'],
                client_id=client.id
            ).first()
            if phone_number:
                message.phone_number_id = phone_number.id
        
        db.session.add(message)
        db.session.commit()
        
        # Envia para processamento assíncrono
        redis_client.lpush('message_queue', json.dumps({
            'message_id': message.id,
            'action': 'classify_and_deliver'
        }))
        
        log_system('INFO', f'MO recebida: {message.message_id}', 'api')
        
        return jsonify({'status': 'success', 'message_id': message.message_id})
        
    except Exception as e:
        log_system('ERROR', f'Erro ao processar MO: {str(e)}', 'api')
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/v1/send', methods=['POST'])
def api_send_sms():
    """API para envio de SMS"""
    api_key = request.headers.get('X-API-Key')
    if not api_key:
        return jsonify({'error': 'API key required'}), 401
    
    client = Client.query.filter_by(api_key=api_key, is_active=True).first()
    if not client:
        return jsonify({'error': 'Invalid API key'}), 401
    
    try:
        data = request.get_json()
        
        # Validação
        required_fields = ['destination_addr', 'short_message']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing field: {field}'}), 400
        
        # Cria mensagem de envio
        message = Message(
            message_id=f"send_{datetime.utcnow().timestamp()}",
            source_addr=data.get('source_addr', 'SMPP'),
            destination_addr=data['destination_addr'],
            short_message=data['short_message'],
            message_type='SMS',
            status='pending'
        )
        
        db.session.add(message)
        db.session.commit()
        
        # Envia para fila de envio SMPP
        redis_client.lpush('send_queue', json.dumps({
            'message_id': message.id,
            'destination_addr': data['destination_addr'],
            'short_message': data['short_message']
        }))
        
        log_system('INFO', f'SMS enviado via API: {message.message_id}', 'api')
        
        return jsonify({
            'status': 'success',
            'message_id': message.message_id,
            'status': 'queued'
        })
        
    except Exception as e:
        log_system('ERROR', f'Erro ao enviar SMS: {str(e)}', 'api')
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/webhook/sms', methods=['POST'])
def webhook_sms():
    """Webhook genérico para ingestão de SMS"""
    try:
        # Verifica assinatura se fornecida
        signature = request.headers.get('X-Signature')
        if signature:
            webhook_secret = os.getenv('WEBHOOK_SECRET', '')
            if not verify_webhook_signature(request.get_data(as_text=True), signature, webhook_secret):
                return jsonify({'error': 'Invalid signature'}), 401
        
        data = request.get_json()
        
        # Processa mensagem similar ao MO
        message = Message(
            message_id=data.get('message_id', f"webhook_{datetime.utcnow().timestamp()}"),
            source_addr=data.get('source_addr', 'WEBHOOK'),
            destination_addr=data.get('destination_addr', 'UNKNOWN'),
            short_message=data.get('short_message', ''),
            message_type='WEBHOOK'
        )
        
        # Classifica por serviço
        service = classify_message(data.get('short_message', ''))
        if service:
            message.service_id = service.id
        
        db.session.add(message)
        db.session.commit()
        
        # Envia para processamento
        redis_client.lpush('message_queue', json.dumps({
            'message_id': message.id,
            'action': 'classify_and_deliver'
        }))
        
        log_system('INFO', f'Webhook recebido: {message.message_id}', 'webhook')
        
        return jsonify({'status': 'success', 'message_id': message.message_id})
        
    except Exception as e:
        log_system('ERROR', f'Erro ao processar webhook: {str(e)}', 'webhook')
        return jsonify({'error': 'Internal server error'}), 500

# ==================== SOCKET.IO ====================

@socketio.on('connect')
def handle_connect():
    """Cliente conectado via WebSocket"""
    if current_user.is_authenticated:
        join_room(f'user_{current_user.id}')
        emit('status', {'msg': 'Conectado ao sistema'})

@socketio.on('disconnect')
def handle_disconnect():
    """Cliente desconectado via WebSocket"""
    if current_user.is_authenticated:
        leave_room(f'user_{current_user.id}')

@socketio.on('join_room')
def handle_join_room(data):
    """Entra em uma sala específica"""
    room = data.get('room')
    if room:
        join_room(room)
        emit('status', {'msg': f'Entrou na sala {room}'})

# ==================== INICIALIZAÇÃO ====================

def create_app():
    """Factory para criar a aplicação"""
    with app.app_context():
        db.create_all()
    return app

if __name__ == '__main__':
    # Cria tabelas se não existirem
    with app.app_context():
        db.create_all()
    
    # Inicia aplicação
    socketio.run(app, 
                host=os.getenv('HOST', '0.0.0.0'),
                port=int(os.getenv('PORT', '8000')),
                debug=os.getenv('FLASK_ENV') == 'development')