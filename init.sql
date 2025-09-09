-- Script de inicialização do banco de dados para Docker
-- Este arquivo é executado automaticamente quando o container PostgreSQL é criado

-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Configurações de performance
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;

-- Recarregar configurações
SELECT pg_reload_conf();

-- Criar usuário se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'smpp_user') THEN
        CREATE USER smpp_user WITH PASSWORD 'smpp_password_2024';
    END IF;
END
$$;

-- Conceder permissões
GRANT ALL PRIVILEGES ON DATABASE smpp_admin TO smpp_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO smpp_user;
ALTER USER smpp_user CREATEDB;

-- Configurar permissões padrão
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO smpp_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO smpp_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO smpp_user;