"""
Worker para processamento assíncrono de mensagens
"""
import os
import sys
import json
import time
import requests
import re
from datetime import datetime
from flask import Flask
from dotenv import load_dotenv

# Adiciona o diretório src ao path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db, Message, Service, MessageDelivery, SystemLog
import redis

# Carrega variáveis de ambiente
load_dotenv()

# Configuração do Redis
redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'localhost'),
    port=int(os.getenv('REDIS_PORT', '6379')),
    password=os.getenv('REDIS_PASSWORD') or None,
    db=int(os.getenv('REDIS_DB', '0')),
    decode_responses=True
)

# Configuração da aplicação Flask para o worker
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

class MessageProcessor:
    """Processador de mensagens"""
    
    def __init__(self):
        self.webhook_timeout = int(os.getenv('WEBHOOK_TIMEOUT', '30'))
        self.webhook_retry_attempts = int(os.getenv('WEBHOOK_RETRY_ATTEMPTS', '3'))
    
    def log_system(self, level, message, module='worker'):
        """Registra log no sistema"""
        try:
            with app.app_context():
                log_entry = SystemLog(level=level, message=message, module=module)
                db.session.add(log_entry)
                db.session.commit()
        except Exception as e:
            print(f"Erro ao registrar log: {e}")
    
    def classify_message(self, message_text):
        """Classifica mensagem por serviço baseado em regex"""
        try:
            with app.app_context():
                services = Service.query.filter_by(is_active=True).all()
                
                for service in services:
                    try:
                        if re.search(service.regex_pattern, message_text, re.IGNORECASE):
                            return service
                    except re.error as e:
                        self.log_system('ERROR', f'Erro na regex do serviço {service.name}: {e}', 'classifier')
                        continue
                
                return None
        except Exception as e:
            self.log_system('ERROR', f'Erro ao classificar mensagem: {e}', 'classifier')
            return None
    
    def process_message_classification(self, message_id):
        """Processa classificação de mensagem"""
        try:
            with app.app_context():
                message = Message.query.get(message_id)
                if not message:
                    self.log_system('ERROR', f'Mensagem {message_id} não encontrada', 'processor')
                    return False
                
                # Classifica a mensagem se ainda não foi classificada
                if not message.service_id:
                    service = self.classify_message(message.short_message)
                    if service:
                        message.service_id = service.id
                        message.status = 'classified'
                        self.log_system('INFO', f'Mensagem {message.message_id} classificada como {service.name}', 'processor')
                    else:
                        message.status = 'unclassified'
                        self.log_system('INFO', f'Mensagem {message.message_id} não classificada', 'processor')
                
                message.processed_at = datetime.utcnow()
                db.session.commit()
                
                return True
                
        except Exception as e:
            self.log_system('ERROR', f'Erro ao processar classificação da mensagem {message_id}: {e}', 'processor')
            return False
    
    def deliver_to_client(self, message_id, client_id, webhook_url):
        """Entrega mensagem para cliente via webhook"""
        try:
            with app.app_context():
                message = Message.query.get(message_id)
                if not message:
                    return False
                
                # Prepara payload para webhook
                payload = {
                    'message_id': message.message_id,
                    'source_addr': message.source_addr,
                    'destination_addr': message.destination_addr,
                    'short_message': message.short_message,
                    'message_type': message.message_type,
                    'service_name': message.service.name if message.service else None,
                    'created_at': message.created_at.isoformat(),
                    'timestamp': int(datetime.utcnow().timestamp())
                }
                
                # Tenta entregar via webhook
                success = self.send_webhook(webhook_url, payload)
                
                # Registra tentativa de entrega
                delivery = MessageDelivery(
                    message_id=message_id,
                    client_id=client_id,
                    webhook_url=webhook_url,
                    webhook_status='sent' if success else 'failed',
                    webhook_attempts=1
                )
                
                if success:
                    delivery.sent_at = datetime.utcnow()
                    self.log_system('INFO', f'Mensagem {message.message_id} entregue para cliente {client_id}', 'delivery')
                else:
                    self.log_system('WARNING', f'Falha ao entregar mensagem {message.message_id} para cliente {client_id}', 'delivery')
                
                db.session.add(delivery)
                db.session.commit()
                
                return success
                
        except Exception as e:
            self.log_system('ERROR', f'Erro ao entregar mensagem {message_id} para cliente {client_id}: {e}', 'delivery')
            return False
    
    def send_webhook(self, webhook_url, payload):
        """Envia webhook para cliente"""
        try:
            response = requests.post(
                webhook_url,
                json=payload,
                timeout=self.webhook_timeout,
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code in [200, 201, 202]:
                return True
            else:
                self.log_system('WARNING', f'Webhook retornou status {response.status_code}: {response.text}', 'webhook')
                return False
                
        except requests.exceptions.Timeout:
            self.log_system('WARNING', f'Timeout ao enviar webhook para {webhook_url}', 'webhook')
            return False
        except requests.exceptions.RequestException as e:
            self.log_system('WARNING', f'Erro ao enviar webhook para {webhook_url}: {e}', 'webhook')
            return False
    
    def process_message_delivery(self, message_id):
        """Processa entrega de mensagem para clientes"""
        try:
            with app.app_context():
                message = Message.query.get(message_id)
                if not message:
                    return False
                
                # Busca clientes que devem receber esta mensagem
                # (baseado no DID ou configuração global)
                from models import PhoneNumber, Client
                
                # Se a mensagem tem um DID associado, entrega apenas para o cliente dono do DID
                if message.phone_number_id:
                    phone_number = PhoneNumber.query.get(message.phone_number_id)
                    if phone_number and phone_number.client.webhook_url:
                        self.deliver_to_client(
                            message_id,
                            phone_number.client_id,
                            phone_number.client.webhook_url
                        )
                else:
                    # Se não tem DID específico, entrega para todos os clientes ativos
                    clients = Client.query.filter_by(is_active=True).all()
                    for client in clients:
                        if client.webhook_url:
                            self.deliver_to_client(
                                message_id,
                                client.id,
                                client.webhook_url
                            )
                
                return True
                
        except Exception as e:
            self.log_system('ERROR', f'Erro ao processar entrega da mensagem {message_id}: {e}', 'delivery')
            return False

def process_message_queue():
    """Processa fila de mensagens"""
    processor = MessageProcessor()
    
    while True:
        try:
            # Busca mensagem na fila (bloqueia por 5 segundos se vazia)
            result = redis_client.brpop('message_queue', timeout=5)
            
            if result:
                queue_name, data = result
                task = json.loads(data)
                
                message_id = task.get('message_id')
                action = task.get('action')
                
                if action == 'classify_and_deliver':
                    # Classifica a mensagem
                    processor.process_message_classification(message_id)
                    
                    # Processa entrega
                    processor.process_message_delivery(message_id)
                    
                elif action == 'classify_only':
                    processor.process_message_classification(message_id)
                    
                elif action == 'deliver_only':
                    processor.process_message_delivery(message_id)
                
                processor.log_system('INFO', f'Task processada: {action} para mensagem {message_id}', 'worker')
            
        except KeyboardInterrupt:
            processor.log_system('INFO', 'Worker interrompido pelo usuário', 'worker')
            break
        except Exception as e:
            processor.log_system('ERROR', f'Erro no worker: {e}', 'worker')
            time.sleep(5)  # Aguarda antes de tentar novamente

def process_send_queue():
    """Processa fila de envio de SMS"""
    processor = MessageProcessor()
    
    while True:
        try:
            # Busca mensagem na fila de envio
            result = redis_client.brpop('send_queue', timeout=5)
            
            if result:
                queue_name, data = result
                task = json.loads(data)
                
                message_id = task.get('message_id')
                destination_addr = task.get('destination_addr')
                short_message = task.get('short_message')
                
                # Aqui você integraria com o conector SMPP
                # Por enquanto, apenas marca como enviado
                with app.app_context():
                    message = Message.query.get(message_id)
                    if message:
                        message.status = 'sent'
                        message.processed_at = datetime.utcnow()
                        db.session.commit()
                        processor.log_system('INFO', f'SMS {message.message_id} enviado para {destination_addr}', 'sender')
            
        except KeyboardInterrupt:
            processor.log_system('INFO', 'Sender worker interrompido pelo usuário', 'worker')
            break
        except Exception as e:
            processor.log_system('ERROR', f'Erro no sender worker: {e}', 'worker')
            time.sleep(5)

def main():
    """Função principal do worker"""
    import threading
    
    processor = MessageProcessor()
    processor.log_system('INFO', 'Worker iniciado', 'worker')
    
    # Inicia threads para diferentes filas
    message_thread = threading.Thread(target=process_message_queue, daemon=True)
    send_thread = threading.Thread(target=process_send_queue, daemon=True)
    
    message_thread.start()
    send_thread.start()
    
    try:
        # Mantém o worker rodando
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        processor.log_system('INFO', 'Worker finalizado', 'worker')

if __name__ == '__main__':
    main()