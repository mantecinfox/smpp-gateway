module.exports = {
  apps: [{
    name: 'smpp-admin-backend',
    script: './server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Configurações de logs
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    
    // Configurações de restart
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 4000,
    
    // Configurações de memória
    max_memory_restart: '1G',
    
    // Configurações de monitoramento
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    
    // Configurações de cluster
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000,
    
    // Configurações de logs
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Configurações de source map
    source_map_support: true,
    
    // Configurações de graceful shutdown
    kill_retry_time: 100,
    
    // Configurações de variáveis de ambiente
    env_file: '.env'
  }]
};