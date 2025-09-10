"""
Cliente SMPP específico para Telecall
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

from models import db, Message, SystemLog

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

class TelecallClient:
    """Cliente SMPP específico para Telecall"""
    
    def __init__(self):
        # Configuração específica da Telecall
        self.config = {
            'host': os.getenv('SMPP_HOST', '198.54.166.74'),
            'port': int(os.getenv('SMPP_PORT', '2875')),
            'username': os.getenv('SMPP_USERNAME', 'WhatsInfo_otp'),
            'password': os.getenv('SMPP_PASSWORD', 'juebkiur'),
            'system_type': os.getenv('SMPP_SYSTEM_TYPE', 'OTP')
        }
        
        self.client = None
        self.connected = False
        self.running = False
        self.thread = None
        self.reconnect_attempts = 0
        self.max_reconnect_attempts = 10
        
    def log_system(self, level, message, module='telecall'):
        """Registra log no sistema"""
        try:
            with app.app_context():
                log_entry = SystemLog(level=level, message=message, module=module)
                db.session.add(log_entry)
                db.session.commit()
        except Exception as e:
            print(f"Erro ao registrar log: {e}")
    
    def connect(self):
        """Conecta ao servidor SMPP da Telecall"""
        try:
            self.client = smpplib.client.Client(
                self.config['host'],
                self.config['port']
            )
            
            # Configura callbacks específicos da Telecall
            self.client.set_message_received_handler(self.handle_message_received)
            self.client.set_message_sent_handler(self.handle_message_sent)
            self.client.set_state_changed_handler(self.handle_state_changed)
            
            # Conecta
            self.client.connect()
            
            # Bind específico para Telecall
            self.client.bind_transceiver(
                system_id=self.config['username'],
                password=self.config['password'],
                system_type=self.config['system_type'],
                interface_version=0x34,  # SMPP 3.4
                addr_ton=0,
                addr_npi=0,
                address_range=''
            )
            
            self.connected = True
            self.reconnect_attempts = 0
            self.log_system('INFO', f'Conectado à Telecall {self.config["host"]}:{self.config["port"]}', 'telecall')
            return True
            
        except Exception as e:
            self.log_system('ERROR', f'Erro ao conectar Telecall: {e}', 'telecall')
            self.connected = False
            return False
    
    def disconnect(self):
        """Desconecta do servidor SMPP da Telecall"""
        try:
            if self.client and self.connected:
                self.client.unbind()
                self.client.disconnect()
                self.connected = False
                self.log_system('INFO', 'Desconectado da Telecall', 'telecall')
        except Exception as e:
            self.log_system('ERROR', f'Erro ao desconectar Telecall: {e}', 'telecall')
    
    def handle_state_changed(self, old_state, new_state):
        """Processa mudança de estado da conexão"""
        self.log_system('INFO', f'Estado SMPP mudou de {old_state} para {new_state}', 'telecall')
        
        if new_state == 'BOUND_TRX':
            self.connected = True
        elif new_state in ['UNBOUND', 'CLOSED']:
            self.connected = False
            if self.running:
                self.log_system('WARNING', 'Conexão perdida, tentando reconectar...', 'telecall')
                self.reconnect()
    
    def reconnect(self):
        """Tenta reconectar à Telecall"""
        if self.reconnect_attempts >= self.max_reconnect_attempts:
            self.log_system('ERROR', 'Máximo de tentativas de reconexão atingido', 'telecall')
            self.running = False
            return
        
        self.reconnect_attempts += 1
        self.log_system('INFO', f'Tentativa de reconexão {self.reconnect_attempts}/{self.max_reconnect_attempts}', 'telecall')
        
        time.sleep(min(30, 5 * self.reconnect_attempts))  # Backoff exponencial
        
        if self.connect():
            self.log_system('INFO', 'Reconectado à Telecall com sucesso', 'telecall')
        else:
            self.reconnect()
    
    def handle_message_received(self, pdu):
        """Processa mensagem recebida da Telecall (MO/DLR)"""
        try:
            if pdu.command == smpplib.consts.SMPP_ESME_DELIVER_SM:
                # Extrai dados da mensagem
                source_addr = pdu.source_addr
                destination_addr = pdu.dest_addr
                short_message = pdu.short_message
                
                # Determina tipo de mensagem
                message_type = 'MO'
                if pdu.esm_class & 0x04:  # Delivery receipt
                    message_type = 'DLR'
                
                # Processa DLR específico da Telecall
                if message_type == 'DLR':
                    self.process_dlr(pdu)
                else:
                    # Processa MO
                    self.process_mo(source_addr, destination_addr, short_message, pdu)
            
            # Responde com submit_sm_resp
            if pdu.command == smpplib.consts.SMPP_ESME_DELIVER_SM:
                self.client.send_pdu(pdu.create_response())
                
        except Exception as e:
            self.log_system('ERROR', f'Erro ao processar mensagem recebida: {e}', 'telecall')
    
    def process_mo(self, source_addr, destination_addr, short_message, pdu):
        """Processa MO (Mobile Originated) da Telecall"""
        try:
            # Cria mensagem no banco
            with app.app_context():
                message = Message(
                    message_id=f"telecall_mo_{int(time.time() * 1000)}",
                    source_addr=source_addr,
                    destination_addr=destination_addr,
                    short_message=short_message.decode('utf-8', errors='ignore'),
                    message_type='MO',
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
                
                self.log_system('INFO', f'MO Telecall recebida: {message.message_id} de {source_addr}', 'telecall')
                
        except Exception as e:
            self.log_system('ERROR', f'Erro ao processar MO: {e}', 'telecall')
    
    def process_dlr(self, pdu):
        """Processa DLR (Delivery Receipt) da Telecall"""
        try:
            # Extrai informações do DLR
            short_message = pdu.short_message.decode('utf-8', errors='ignore')
            
            # Parse do DLR (formato padrão: id:XXXX sub:XXX dlvrd:XXX submit date:YYMMDDHHMM done date:YYMMDDHHMM stat:XXXXXX err:XXX)
            dlr_info = self.parse_dlr(short_message)
            
            if dlr_info:
                # Busca mensagem original pelo ID
                with app.app_context():
                    message = Message.query.filter_by(smpp_message_id=dlr_info['id']).first()
                    if message:
                        # Atualiza status baseado no DLR
                        if dlr_info['stat'] == 'DELIVRD':
                            message.status = 'delivered'
                        elif dlr_info['stat'] in ['EXPIRED', 'DELETED', 'UNDELIV']:
                            message.status = 'failed'
                        else:
                            message.status = 'pending'
                        
                        message.processed_at = datetime.utcnow()
                        db.session.commit()
                        
                        self.log_system('INFO', f'DLR Telecall processado: {dlr_info["id"]} - {dlr_info["stat"]}', 'telecall')
                    else:
                        self.log_system('WARNING', f'DLR recebido para mensagem não encontrada: {dlr_info["id"]}', 'telecall')
                        
        except Exception as e:
            self.log_system('ERROR', f'Erro ao processar DLR: {e}', 'telecall')
    
    def parse_dlr(self, dlr_text):
        """Parse do texto do DLR da Telecall"""
        try:
            dlr_info = {}
            parts = dlr_text.split()
            
            for part in parts:
                if ':' in part:
                    key, value = part.split(':', 1)
                    dlr_info[key] = value
            
            return dlr_info
        except Exception as e:
            self.log_system('ERROR', f'Erro ao fazer parse do DLR: {e}', 'telecall')
            return None
    
    def handle_message_sent(self, pdu):
        """Processa confirmação de envio"""
        try:
            if pdu.command == smpplib.consts.SMPP_ESME_SUBMIT_SM_RESP:
                message_id = pdu.message_id
                status = pdu.command_status
                
                self.log_system('INFO', f'SMS Telecall enviada - ID: {message_id}, Status: {status}', 'telecall')
                
                # Atualiza status no banco
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
            self.log_system('ERROR', f'Erro ao processar confirmação de envio: {e}', 'telecall')
    
    def send_sms(self, destination_addr, short_message, source_addr=None):
        """Envia SMS via Telecall"""
        try:
            if not self.connected:
                if not self.connect():
                    return False
            
            # Usa source_addr padrão se não fornecido
            if not source_addr:
                source_addr = 'SMPP'
            
            # Envia SMS com configurações específicas da Telecall
            pdu = self.client.send_message(
                source_addr_ton=0,
                source_addr_npi=0,
                source_addr=source_addr,
                dest_addr_ton=1,
                dest_addr_npi=1,
                destination_addr=destination_addr,
                short_message=short_message,
                data_coding=0x08,  # UTF-8
                esm_class=0x00,
                protocol_id=0,
                priority_flag=0,
                schedule_delivery_time='',
                validity_period='',
                registered_delivery=1,  # Solicita DLR
                replace_if_present_flag=0,
                sm_default_msg_id=0
            )
            
            self.log_system('INFO', f'SMS Telecall enviada para {destination_addr}: {pdu.message_id}', 'telecall')
            return pdu.message_id
            
        except Exception as e:
            self.log_system('ERROR', f'Erro ao enviar SMS Telecall: {e}', 'telecall')
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
                    
                    # Envia SMS via Telecall
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
                self.log_system('ERROR', f'Erro ao processar fila de envio: {e}', 'telecall')
                time.sleep(5)
    
    def start(self):
        """Inicia o cliente Telecall"""
        if self.running:
            return
        
        self.running = True
        
        # Conecta
        if not self.connect():
            self.log_system('ERROR', 'Falha ao conectar Telecall', 'telecall')
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
            self.log_system('ERROR', f'Erro no listener Telecall: {e}', 'telecall')
            self.stop()
    
    def stop(self):
        """Para o cliente Telecall"""
        self.running = False
        self.disconnect()
        self.log_system('INFO', 'Cliente Telecall parado', 'telecall')

def main():
    """Função principal do cliente Telecall"""
    client = TelecallClient()
    
    try:
        client.start()
    except KeyboardInterrupt:
        client.stop()

if __name__ == '__main__':
    main()