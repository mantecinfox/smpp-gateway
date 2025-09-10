"""
Sistema de classificação automática de mensagens por serviço
"""
import os
import sys
import re
import json
from datetime import datetime
from flask import Flask
from dotenv import load_dotenv

# Adiciona o diretório src ao path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db, Message, Service, SystemLog

# Carrega variáveis de ambiente
load_dotenv()

# Configuração da aplicação Flask para o classificador
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = f"mysql+pymysql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

class MessageClassifier:
    """Classificador de mensagens por serviço"""
    
    def __init__(self):
        self.services = {}
        self.load_services()
    
    def log_system(self, level, message, module='classifier'):
        """Registra log no sistema"""
        try:
            with app.app_context():
                log_entry = SystemLog(level=level, message=message, module=module)
                db.session.add(log_entry)
                db.session.commit()
        except Exception as e:
            print(f"Erro ao registrar log: {e}")
    
    def load_services(self):
        """Carrega serviços ativos do banco de dados"""
        try:
            with app.app_context():
                services = Service.query.filter_by(is_active=True).all()
                self.services = {}
                
                for service in services:
                    try:
                        # Compila regex para melhor performance
                        compiled_regex = re.compile(service.regex_pattern, re.IGNORECASE)
                        self.services[service.id] = {
                            'name': service.name,
                            'regex': compiled_regex,
                            'pattern': service.regex_pattern
                        }
                    except re.error as e:
                        self.log_system('ERROR', f'Erro na regex do serviço {service.name}: {e}', 'classifier')
                        continue
                
                self.log_system('INFO', f'{len(self.services)} serviços carregados para classificação', 'classifier')
                
        except Exception as e:
            self.log_system('ERROR', f'Erro ao carregar serviços: {e}', 'classifier')
    
    def classify_message(self, message_text):
        """Classifica mensagem por serviço"""
        if not message_text:
            return None
        
        # Tenta classificar com cada serviço
        for service_id, service_data in self.services.items():
            try:
                if service_data['regex'].search(message_text):
                    self.log_system('DEBUG', f'Mensagem classificada como {service_data["name"]}', 'classifier')
                    return service_id
            except Exception as e:
                self.log_system('ERROR', f'Erro ao classificar com serviço {service_data["name"]}: {e}', 'classifier')
                continue
        
        return None
    
    def classify_with_confidence(self, message_text):
        """Classifica mensagem com nível de confiança"""
        if not message_text:
            return None, 0.0
        
        best_match = None
        best_confidence = 0.0
        
        for service_id, service_data in self.services.items():
            try:
                match = service_data['regex'].search(message_text)
                if match:
                    # Calcula confiança baseada no tamanho do match e posição
                    match_length = len(match.group(0))
                    message_length = len(message_text)
                    position_factor = 1.0 - (match.start() / message_length) if message_length > 0 else 1.0
                    
                    confidence = (match_length / message_length) * position_factor
                    
                    if confidence > best_confidence:
                        best_confidence = confidence
                        best_match = service_id
                        
            except Exception as e:
                self.log_system('ERROR', f'Erro ao classificar com confiança: {e}', 'classifier')
                continue
        
        return best_match, best_confidence
    
    def classify_batch(self, messages):
        """Classifica lote de mensagens"""
        results = []
        
        for message in messages:
            service_id, confidence = self.classify_with_confidence(message.get('text', ''))
            results.append({
                'message_id': message.get('id'),
                'service_id': service_id,
                'confidence': confidence,
                'classified': service_id is not None
            })
        
        return results
    
    def update_message_classification(self, message_id, service_id=None):
        """Atualiza classificação de mensagem no banco"""
        try:
            with app.app_context():
                message = Message.query.get(message_id)
                if not message:
                    self.log_system('ERROR', f'Mensagem {message_id} não encontrada', 'classifier')
                    return False
                
                # Classifica se não foi fornecido service_id
                if service_id is None:
                    service_id, confidence = self.classify_with_confidence(message.short_message)
                
                if service_id:
                    message.service_id = service_id
                    message.status = 'classified'
                    self.log_system('INFO', f'Mensagem {message.message_id} classificada como serviço {service_id}', 'classifier')
                else:
                    message.status = 'unclassified'
                    self.log_system('INFO', f'Mensagem {message.message_id} não classificada', 'classifier')
                
                message.processed_at = datetime.utcnow()
                db.session.commit()
                
                return True
                
        except Exception as e:
            self.log_system('ERROR', f'Erro ao atualizar classificação da mensagem {message_id}: {e}', 'classifier')
            return False
    
    def reload_services(self):
        """Recarrega serviços do banco de dados"""
        self.load_services()
        self.log_system('INFO', 'Serviços recarregados', 'classifier')
    
    def get_classification_stats(self):
        """Retorna estatísticas de classificação"""
        try:
            with app.app_context():
                total_messages = Message.query.count()
                classified_messages = Message.query.filter(Message.service_id.isnot(None)).count()
                unclassified_messages = total_messages - classified_messages
                
                # Estatísticas por serviço
                service_stats = db.session.query(
                    Service.name,
                    db.func.count(Message.id).label('count')
                ).join(Message).group_by(Service.id).all()
                
                return {
                    'total_messages': total_messages,
                    'classified_messages': classified_messages,
                    'unclassified_messages': unclassified_messages,
                    'classification_rate': (classified_messages / total_messages * 100) if total_messages > 0 else 0,
                    'service_stats': [{'name': stat.name, 'count': stat.count} for stat in service_stats]
                }
                
        except Exception as e:
            self.log_system('ERROR', f'Erro ao obter estatísticas: {e}', 'classifier')
            return None
    
    def test_classification(self, message_text):
        """Testa classificação de uma mensagem"""
        results = []
        
        for service_id, service_data in self.services.items():
            try:
                match = service_data['regex'].search(message_text)
                if match:
                    results.append({
                        'service_id': service_id,
                        'service_name': service_data['name'],
                        'pattern': service_data['pattern'],
                        'match': match.group(0),
                        'position': match.start()
                    })
            except Exception as e:
                results.append({
                    'service_id': service_id,
                    'service_name': service_data['name'],
                    'pattern': service_data['pattern'],
                    'error': str(e)
                })
        
        return results

# Instância global do classificador
classifier = MessageClassifier()

def get_classifier():
    """Retorna instância do classificador"""
    return classifier

def classify_message(message_text):
    """Função de conveniência para classificar mensagem"""
    return classifier.classify_message(message_text)

def classify_with_confidence(message_text):
    """Função de conveniência para classificar com confiança"""
    return classifier.classify_with_confidence(message_text)

if __name__ == '__main__':
    # Teste do classificador
    test_messages = [
        "Seu código WhatsApp é 123456",
        "Código de verificação Gmail: 789012",
        "Instagram: seu código é 456789",
        "Mensagem genérica sem padrão específico"
    ]
    
    print("Testando classificador de mensagens:")
    print("=" * 50)
    
    for msg in test_messages:
        service_id, confidence = classify_with_confidence(msg)
        service_name = classifier.services.get(service_id, {}).get('name', 'Não classificado') if service_id else 'Não classificado'
        print(f"Mensagem: {msg}")
        print(f"Serviço: {service_name} (confiança: {confidence:.2f})")
        print("-" * 30)