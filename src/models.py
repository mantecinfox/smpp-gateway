"""
Modelos SQLAlchemy para o Sistema SMPP
"""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
import secrets
import string

db = SQLAlchemy()

class User(UserMixin, db.Model):
    """Modelo para usuários administradores"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    is_admin = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def __repr__(self):
        return f'<User {self.username}>'

class Client(db.Model):
    """Modelo para clientes do sistema"""
    __tablename__ = 'clients'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    api_key = db.Column(db.String(64), unique=True, nullable=False, default=lambda: Client.generate_api_key())
    webhook_url = db.Column(db.String(500))
    webhook_secret = db.Column(db.String(64), default=lambda: Client.generate_webhook_secret())
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    phone_numbers = db.relationship('PhoneNumber', backref='client', lazy=True)
    message_deliveries = db.relationship('MessageDelivery', backref='client', lazy=True)
    
    @staticmethod
    def generate_api_key():
        return ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
    
    @staticmethod
    def generate_webhook_secret():
        return ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
    
    def __repr__(self):
        return f'<Client {self.name}>'

class Service(db.Model):
    """Modelo para serviços de detecção"""
    __tablename__ = 'services'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    description = db.Column(db.Text)
    regex_pattern = db.Column(db.Text, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    messages = db.relationship('Message', backref='service', lazy=True)
    
    def __repr__(self):
        return f'<Service {self.name}>'

class PhoneNumber(db.Model):
    """Modelo para DIDs/números telefônicos"""
    __tablename__ = 'phone_numbers'
    
    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(20), nullable=False, unique=True)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    messages = db.relationship('Message', backref='phone_number', lazy=True)
    
    def __repr__(self):
        return f'<PhoneNumber {self.number}>'

class Message(db.Model):
    """Modelo para mensagens"""
    __tablename__ = 'messages'
    
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.String(100), unique=True, nullable=False)
    source_addr = db.Column(db.String(20), nullable=False)
    destination_addr = db.Column(db.String(20), nullable=False)
    short_message = db.Column(db.Text, nullable=False)
    message_type = db.Column(db.String(20), default='SMS')  # SMS, MO, DLR
    status = db.Column(db.String(20), default='received')  # received, processed, delivered, failed
    service_id = db.Column(db.Integer, db.ForeignKey('services.id'))
    phone_number_id = db.Column(db.Integer, db.ForeignKey('phone_numbers.id'))
    smpp_message_id = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    processed_at = db.Column(db.DateTime)
    
    def __repr__(self):
        return f'<Message {self.message_id}>'

class MessageDelivery(db.Model):
    """Modelo para entregas de mensagens para clientes"""
    __tablename__ = 'message_deliveries'
    
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey('messages.id'), nullable=False)
    client_id = db.Column(db.Integer, db.ForeignKey('clients.id'), nullable=False)
    webhook_url = db.Column(db.String(500))
    webhook_status = db.Column(db.String(20), default='pending')  # pending, sent, failed
    webhook_response = db.Column(db.Text)
    webhook_attempts = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sent_at = db.Column(db.DateTime)
    
    # Relacionamentos
    message = db.relationship('Message', backref='deliveries', lazy=True)
    
    def __repr__(self):
        return f'<MessageDelivery {self.id}>'

class SMSCConfig(db.Model):
    """Modelo para configurações SMSC"""
    __tablename__ = 'smsc_configs'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    host = db.Column(db.String(100), nullable=False)
    port = db.Column(db.Integer, nullable=False)
    username = db.Column(db.String(100), nullable=False)
    password = db.Column(db.String(100), nullable=False)
    system_type = db.Column(db.String(50), default='OTP')
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f'<SMSCConfig {self.name}>'

class SystemLog(db.Model):
    """Modelo para logs do sistema"""
    __tablename__ = 'system_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    level = db.Column(db.String(20), nullable=False)  # INFO, WARNING, ERROR, DEBUG
    message = db.Column(db.Text, nullable=False)
    module = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<SystemLog {self.level}: {self.message[:50]}>'