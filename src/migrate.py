"""
Sistema de migração e setup inicial do banco de dados
"""
import os
import sys
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
import pymysql

# Adiciona o diretório src ao path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db, User, Client, Service, PhoneNumber, Message, MessageDelivery, SMSCConfig, SystemLog

# Carrega variáveis de ambiente
load_dotenv()

def get_database_url():
    """Constrói a URL de conexão com o banco de dados"""
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = os.getenv('DB_PORT', '3306')
    db_name = os.getenv('DB_NAME', 'smpp_system')
    db_user = os.getenv('DB_USER', 'smpp_user')
    db_password = os.getenv('DB_PASSWORD', 'smpp_password')
    
    return f"mysql+pymysql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"

def create_database():
    """Cria o banco de dados se não existir"""
    db_host = os.getenv('DB_HOST', 'localhost')
    db_port = int(os.getenv('DB_PORT', '3306'))
    db_name = os.getenv('DB_NAME', 'smpp_system')
    db_user = os.getenv('DB_USER', 'smpp_user')
    db_password = os.getenv('DB_PASSWORD', 'smpp_password')
    
    # Conecta sem especificar o banco para criá-lo
    connection_url = f"mysql+pymysql://{db_user}:{db_password}@{db_host}:{db_port}/"
    
    try:
        engine = create_engine(connection_url)
        with engine.connect() as conn:
            # Cria o banco se não existir
            conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {db_name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
            print(f"✅ Banco de dados '{db_name}' criado/verificado com sucesso")
    except Exception as e:
        print(f"❌ Erro ao criar banco de dados: {e}")
        return False
    
    return True

def create_tables():
    """Cria todas as tabelas do sistema"""
    try:
        # Conecta ao banco
        database_url = get_database_url()
        engine = create_engine(database_url)
        
        # Cria todas as tabelas
        db.metadata.create_all(engine)
        print("✅ Tabelas criadas com sucesso")
        return True
    except Exception as e:
        print(f"❌ Erro ao criar tabelas: {e}")
        return False

def create_default_data():
    """Cria dados padrão do sistema"""
    try:
        from flask import Flask
        app = Flask(__name__)
        app.config['SQLALCHEMY_DATABASE_URI'] = get_database_url()
        app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        
        db.init_app(app)
        
        with app.app_context():
            # Verifica se já existem dados
            if User.query.first():
                print("ℹ️  Dados padrão já existem, pulando criação")
                return True
            
            # Cria usuário administrador padrão
            admin_user = User(
                username='admin',
                email='admin@smpp-system.com',
                is_admin=True
            )
            admin_user.set_password('admin123')
            db.session.add(admin_user)
            
            # Cria serviços padrão
            default_services = [
                {
                    'name': 'WhatsApp',
                    'description': 'Detecção de códigos WhatsApp',
                    'regex_pattern': r'(?i)(whatsapp|wa\.me|whats|zap)'
                },
                {
                    'name': 'Gmail',
                    'description': 'Detecção de códigos Gmail',
                    'regex_pattern': r'(?i)(gmail|google|g\.co)'
                },
                {
                    'name': 'Telegram',
                    'description': 'Detecção de códigos Telegram',
                    'regex_pattern': r'(?i)(telegram|t\.me|tg)'
                },
                {
                    'name': 'Mercado Livre',
                    'description': 'Detecção de códigos Mercado Livre',
                    'regex_pattern': r'(?i)(mercadolivre|mercadolibre|ml\.com)'
                },
                {
                    'name': 'Instagram',
                    'description': 'Detecção de códigos Instagram',
                    'regex_pattern': r'(?i)(instagram|insta|ig)'
                },
                {
                    'name': 'TikTok',
                    'description': 'Detecção de códigos TikTok',
                    'regex_pattern': r'(?i)(tiktok|tt)'
                },
                {
                    'name': 'Kwai',
                    'description': 'Detecção de códigos Kwai',
                    'regex_pattern': r'(?i)(kwai)'
                },
                {
                    'name': 'Facebook',
                    'description': 'Detecção de códigos Facebook',
                    'regex_pattern': r'(?i)(facebook|fb\.com|meta)'
                },
                {
                    'name': 'Banco Inter',
                    'description': 'Detecção de códigos Banco Inter',
                    'regex_pattern': r'(?i)(banco\s*inter|inter)'
                },
                {
                    'name': 'Amazon',
                    'description': 'Detecção de códigos Amazon',
                    'regex_pattern': r'(?i)(amazon|aws)'
                }
            ]
            
            for service_data in default_services:
                service = Service(**service_data)
                db.session.add(service)
            
            # Cria configuração SMSC padrão
            smsc_config = SMSCConfig(
                name='Telecall Default',
                host=os.getenv('SMPP_HOST', '198.54.166.74'),
                port=int(os.getenv('SMPP_PORT', '2875')),
                username=os.getenv('SMPP_USERNAME', 'WhatsInfo_otp'),
                password=os.getenv('SMPP_PASSWORD', 'juebkiur'),
                system_type=os.getenv('SMPP_SYSTEM_TYPE', 'OTP')
            )
            db.session.add(smsc_config)
            
            # Cria cliente de teste
            test_client = Client(
                name='Cliente Teste',
                email='teste@exemplo.com',
                webhook_url='http://localhost:3000/webhook'
            )
            db.session.add(test_client)
            
            # Commit das alterações
            db.session.commit()
            print("✅ Dados padrão criados com sucesso")
            return True
            
    except Exception as e:
        print(f"❌ Erro ao criar dados padrão: {e}")
        return False

def test_connection():
    """Testa a conexão com o banco de dados"""
    try:
        database_url = get_database_url()
        engine = create_engine(database_url)
        
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            print("✅ Conexão com banco de dados estabelecida")
            return True
    except Exception as e:
        print(f"❌ Erro de conexão com banco de dados: {e}")
        return False

def main():
    """Função principal de migração"""
    print("🚀 Iniciando setup do banco de dados...")
    
    # Testa conexão
    if not test_connection():
        print("❌ Falha na conexão. Verifique as configurações no .env")
        return False
    
    # Cria banco de dados
    if not create_database():
        return False
    
    # Cria tabelas
    if not create_tables():
        return False
    
    # Cria dados padrão
    if not create_default_data():
        return False
    
    print("🎉 Setup do banco de dados concluído com sucesso!")
    print("\n📋 Informações de acesso:")
    print("   Usuário: admin")
    print("   Senha: admin123")
    print("   URL: http://localhost:8000")
    
    return True

if __name__ == '__main__':
    main()