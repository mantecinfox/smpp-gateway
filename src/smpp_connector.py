"""
Conector SMPP genérico para provedores
"""
import os
import sys
import time
import json
import threading
from datetime import datetime
from flask import Flask
from dotenv import load_dotenv
import smpplib.gsm
import smpplib.client
import smpplib.consts
import redis

# Adiciona o diretório src ao path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db, Message, SMSCConfig, SystemLog

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

# Configuração da aplicação Flask para o conector
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

class SMPPConnector:
    """Conector SMPP genérico"""
    
    def __init__(self, config_id=None):
        self.config_id = config_id
        self.client = None
        self.connected = False
        self.running = False
        self.thread = None
        
        # Carrega configuração
        self.load_config()
    
    def load_config(self):
        """Carrega configuração SMSC"""
        try:
            with app.app_context():
                if self.config_id:
                    config = SMSCConfig.query.get(self.config_id)
                else:
                    config = SMSCConfig.query.filter_by(is_active=True).first()
                
                if not config:
                    raise Exception("Nenhuma configuração SMSC ativa encontrada")
                
                self.config = {
                    'host': config.host,
                    'port': config.port,
                    'username': config.username,
                    'password': config.password,
                    'system_type': config.system_type
                }
                
                self.log_system('INFO', f'Configuração SMSC carregada: {config.name}', 'smpp')
                
        except Exception as e:
            self.log_system('ERROR', f'Erro ao carregar configuração SMSC: {e}', 'smpp')
            raise
    
    def log_system(self, level, message, module='smpp'):
        """Registra log no sistema"""
        try:
            with app.app_context():
                log_entry = SystemLog(level=level, message=message, module=module)
                db.session.add(log_entry)
                db.session.commit()
        except Exception as e:
            print(f"Erro ao registrar log: {e}")
    
    def connect(self):
        """Conecta ao servidor SMPP"""
        try:
            self.client = smpplib.client.Client(
                self.config['host'],
                self.config['port']
            )
            
            # Configura callbacks
            self.client.set_message_received_handler(self.handle_message_received)
            self.client.set_message_sent_handler(self.handle_message_sent)
            
            # Conecta
            self.client.connect()
            
            # Bind
            self.client.bind_transceiver(
                system_id=self.config['username'],
                password=self.config['password'],
                system_type=self.config['system_type']
            )
            
            self.connected = True
            self.log_system('INFO', f'Conectado ao SMSC {self.config["host"]}:{self.config["port"]}', 'smpp')
            return True
            
        except Exception as e:
            self.log_system('ERROR', f'Erro ao conectar SMPP: {e}', 'smpp')
            self.connected = False
            return False
    
    def disconnect(self):
        """Desconecta do servidor SMPP"""
        try:
            if self.client and self.connected:
                self.client.unbind()
                self.client.disconnect()
                self.connected = False
                self.log_system('INFO', 'Desconectado do SMSC', 'smpp')
        except Exception as e:
            self.log_system('ERROR', f'Erro ao desconectar SMPP: {e}', 'smpp')
    
    def handle_message_received(self, pdu):
        """Processa mensagem recebida (MO/DLR)"""
        try:
            if pdu.command == smpplib.consts.SMPP_ESME_DELIVER_SM:
                # MO (Mobile Originated) ou DLR (Delivery Receipt)
                source_addr = pdu.source_addr_ton, pdu.source_addr_npi, pdu.source_addr
                destination_addr = pdu.dest_addr_ton, pdu.dest_addr_npi, pdu.dest_addr
                short_message = pdu.short_message
                
                # Determina tipo de mensagem
                message_type = 'MO'
                if pdu.esm_class & 0x04:  # Delivery receipt
                    message_type = 'DLR'
                
                # Cria mensagem no banco
                with app.app_context():
                    message = Message(
                        message_id=f"smpp_{int(time.time() * 1000)}",
                        source_addr=source_addr[2],
                        destination_addr=destination_addr[2],
                        short_message=short_message.decode('utf-8', errors='ignore'),
                        message_type=message_type,
                        smpp_message_id=str(pdu.sequence_number),
                        status='received'
                    )
                    
                    db.session.add(message)
                    db.session.commit()
                    
                    # Envia para processamento assíncrono
                    redis_client.lpush('message_queue', json.dumps({
                        'message_id': message.id,
                        'action': 'classify_and_deliver'
                    }))
                    
                    self.log_system('INFO', f'MO/DLR recebida: {message.message_id}', 'smpp')
            
            # Responde com submit_sm_resp
            if pdu.command == smpplib.consts.SMPP_ESME_DELIVER_SM:
                self.client.send_pdu(pdu.create_response())
                
        except Exception as e:
            self.log_system('ERROR', f'Erro ao processar mensagem recebida: {e}', 'smpp')
    
    def handle_message_sent(self, pdu):
        """Processa confirmação de envio"""
        try:
            if pdu.command == smpplib.consts.SMPP_ESME_SUBMIT_SM_RESP:
                message_id = pdu.message_id
                status = pdu.command_status
                
                self.log_system('INFO', f'SMS enviada - ID: {message_id}, Status: {status}', 'smpp')
                
                # Atualiza status no banco se necessário
                with app.app_context():
                    message = Message.query.filter_by(smpp_message_id=message_id).first()
                    if message:
                        if status == 0:  # Sucesso
                            message.status = 'sent'
                        else:
                            message.status = 'failed'
                        message.processed_at = datetime.utcnow()
                        db.session.commit()
                        
        except Exception as e:
            self.log_system('ERROR', f'Erro ao processar confirmação de envio: {e}', 'smpp')
    
    def send_sms(self, destination_addr, short_message, source_addr=None):
        """Envia SMS via SMPP"""
        try:
            if not self.connected:
                if not self.connect():
                    return False
            
            # Usa source_addr padrão se não fornecido
            if not source_addr:
                source_addr = 'SMPP'
            
            # Envia SMS
            pdu = self.client.send_message(
                source_addr_ton=0,
                source_addr_npi=0,
                source_addr=source_addr,
                dest_addr_ton=1,
                dest_addr_npi=1,
                destination_addr=destination_addr,
                short_message=short_message,
                data_coding=0x08,  # UTF-8
                esm_class=0x00
            )
            
            self.log_system('INFO', f'SMS enviada para {destination_addr}: {pdu.message_id}', 'smpp')
            return pdu.message_id
            
        except Exception as e:
            self.log_system('ERROR', f'Erro ao enviar SMS: {e}', 'smpp')
            return None
    
    def process_send_queue(self):
        """Processa fila de envio de SMS"""
        while self.running:
            try:
                # Busca mensagem na fila de envio
                result = redis_client.brpop('send_queue', timeout=5)
                
                if result:
                    queue_name, data = result
                    task = json.loads(data)
                    
                    message_id = task.get('message_id')
                    destination_addr = task.get('destination_addr')
                    short_message = task.get('short_message')
                    source_addr = task.get('source_addr')
                    
                    # Envia SMS
                    smpp_message_id = self.send_sms(destination_addr, short_message, source_addr)
                    
                    if smpp_message_id:
                        # Atualiza mensagem no banco
                        with app.app_context():
                            message = Message.query.get(message_id)
                            if message:
                                message.smpp_message_id = smpp_message_id
                                message.status = 'sent'
                                message.processed_at = datetime.utcnow()
                                db.session.commit()
                    
            except Exception as e:
                self.log_system('ERROR', f'Erro ao processar fila de envio: {e}', 'smpp')
                time.sleep(5)
    
    def start(self):
        """Inicia o conector SMPP"""
        if self.running:
            return
        
        self.running = True
        
        # Conecta
        if not self.connect():
            self.log_system('ERROR', 'Falha ao conectar SMPP', 'smpp')
            return False
        
        # Inicia thread para processar fila de envio
        self.thread = threading.Thread(target=self.process_send_queue, daemon=True)
        self.thread.start()
        
        # Inicia listener
        try:
            self.client.listen()
        except KeyboardInterrupt:
            self.stop()
        except Exception as e:
            self.log_system('ERROR', f'Erro no listener SMPP: {e}', 'smpp')
            self.stop()
    
    def stop(self):
        """Para o conector SMPP"""
        self.running = False
        self.disconnect()
        self.log_system('INFO', 'Conector SMPP parado', 'smpp')

def main():
    """Função principal do conector SMPP"""
    connector = SMPPConnector()
    
    try:
        connector.start()
    except KeyboardInterrupt:
        connector.stop()

if __name__ == '__main__':
    main()