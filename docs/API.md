# 🔌 Documentação da API

## 📋 Visão Geral

A API do SMPP Admin fornece endpoints REST para gerenciar mensagens SMS, DIDs, usuários e plataformas.

**Base URL**: `http://localhost:3000/api`

## 🔐 Autenticação

### JWT Token

```http
Authorization: Bearer <token>
```

### API Key

```http
X-API-Key: <api_key>
```

## 📚 Endpoints

### 🔑 Autenticação

#### POST /auth/login
Fazer login no sistema

**Request:**
```json
{
  "email": "admin@smpp.com",
  "password": "admin123"
}
```

**Response:**
```json
{
  "message": "Login realizado com sucesso",
  "user": {
    "id": 1,
    "email": "admin@smpp.com",
    "name": "Administrador",
    "role": "admin",
    "status": "active"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST /auth/register
Registrar novo usuário

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "Nome do Usuário",
  "role": "client"
}
```

#### GET /auth/profile
Obter perfil do usuário autenticado

**Response:**
```json
{
  "user": {
    "id": 1,
    "email": "admin@smpp.com",
    "name": "Administrador",
    "role": "admin",
    "status": "active",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

#### PUT /auth/profile
Atualizar perfil do usuário

**Request:**
```json
{
  "name": "Novo Nome",
  "email": "novo@email.com"
}
```

#### PUT /auth/change-password
Alterar senha

**Request:**
```json
{
  "currentPassword": "senha_atual",
  "newPassword": "nova_senha"
}
```

#### POST /auth/generate-api-key
Gerar nova API key

**Response:**
```json
{
  "message": "Nova API key gerada com sucesso",
  "api_key": "abc123def456ghi789..."
}
```

### 📨 Mensagens

#### GET /messages
Listar mensagens do usuário

**Query Parameters:**
- `page` (int): Página (padrão: 1)
- `limit` (int): Itens por página (padrão: 50)
- `platform` (string): Filtrar por plataforma
- `status` (string): Filtrar por status
- `search` (string): Buscar por texto
- `date_from` (string): Data inicial (ISO 8601)
- `date_to` (string): Data final (ISO 8601)

**Response:**
```json
{
  "messages": [
    {
      "id": 1,
      "did": "5511999999999",
      "sender": "5511888888888",
      "receiver": "5511999999999",
      "message": "Código de verificação: 123456",
      "platform": "wa",
      "status": "received",
      "user_id": 1,
      "created_at": "2024-01-01T12:00:00.000Z",
      "processed_at": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2
  }
}
```

#### GET /messages/:id
Obter mensagem específica

**Response:**
```json
{
  "message": {
    "id": 1,
    "did": "5511999999999",
    "sender": "5511888888888",
    "receiver": "5511999999999",
    "message": "Código de verificação: 123456",
    "platform": "wa",
    "status": "received",
    "user_id": 1,
    "created_at": "2024-01-01T12:00:00.000Z",
    "processed_at": null
  }
}
```

#### PUT /messages/:id/process
Marcar mensagem como processada

**Response:**
```json
{
  "message": "Mensagem marcada como processada",
  "message": {
    "id": 1,
    "status": "processed",
    "processed_at": "2024-01-01T12:05:00.000Z"
  }
}
```

#### DELETE /messages/:id
Deletar mensagem

**Response:**
```json
{
  "message": "Mensagem deletada com sucesso"
}
```

### 📱 DIDs

#### GET /dids
Listar DIDs do usuário

**Query Parameters:**
- `page` (int): Página
- `limit` (int): Itens por página
- `status` (string): Filtrar por status
- `platform` (string): Filtrar por plataforma
- `search` (string): Buscar por número

**Response:**
```json
{
  "dids": [
    {
      "id": 1,
      "number": "5511999999999",
      "user_id": 1,
      "status": "assigned",
      "platforms": ["wa", "tg"],
      "price": 0.50,
      "created_at": "2024-01-01T00:00:00.000Z",
      "assigned_at": "2024-01-01T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 10,
    "pages": 1
  }
}
```

#### GET /dids/:id
Obter DID específico

#### POST /dids/:id/assign (Admin)
Atribuir DID a usuário

**Request:**
```json
{
  "user_id": 2,
  "platforms": ["wa", "tg", "ig"],
  "expires_at": "2024-12-31T23:59:59.000Z"
}
```

#### POST /dids/:id/release (Admin)
Liberar DID

#### PUT /dids/:id/platforms
Atualizar plataformas do DID

**Request:**
```json
{
  "platforms": ["wa", "tg", "ig", "fb"]
}
```

#### POST /dids/bulk (Admin)
Criar múltiplos DIDs

**Request:**
```json
{
  "numbers": ["5511999999999", "5511999999998", "5511999999997"],
  "platforms": ["wa", "tg"],
  "price": 0.50,
  "notes": "DIDs de exemplo"
}
```

### 🏢 Plataformas

#### GET /platforms
Listar plataformas

**Query Parameters:**
- `page` (int): Página
- `limit` (int): Itens por página
- `status` (string): Filtrar por status
- `search` (string): Buscar por nome

**Response:**
```json
{
  "platforms": [
    {
      "id": 1,
      "code": "wa",
      "name": "WhatsApp",
      "description": "Mensagens do WhatsApp",
      "status": "active",
      "price": 0.50,
      "webhook_url": "https://webhook.example.com/wa",
      "auto_forward": false,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 20,
    "pages": 1
  }
}
```

#### GET /platforms/:id
Obter plataforma específica

#### GET /platforms/code/:code
Obter plataforma por código

#### POST /platforms (Admin)
Criar nova plataforma

**Request:**
```json
{
  "code": "new_platform",
  "name": "Nova Plataforma",
  "description": "Descrição da plataforma",
  "price": 0.30,
  "webhook_url": "https://webhook.example.com/new",
  "auto_forward": true
}
```

#### PUT /platforms/:id (Admin)
Atualizar plataforma

#### POST /platforms/:id/activate (Admin)
Ativar plataforma

#### POST /platforms/:id/deactivate (Admin)
Desativar plataforma

#### PUT /platforms/:id/price (Admin)
Atualizar preço da plataforma

**Request:**
```json
{
  "price": 0.75
}
```

#### PUT /platforms/:id/webhook (Admin)
Atualizar webhook da plataforma

**Request:**
```json
{
  "webhook_url": "https://new-webhook.example.com"
}
```

#### DELETE /platforms/:id (Admin)
Deletar plataforma

#### GET /platforms/:id/stats
Estatísticas da plataforma

**Query Parameters:**
- `date_from` (string): Data inicial
- `date_to` (string): Data final

**Response:**
```json
{
  "platform": {
    "id": 1,
    "code": "wa",
    "name": "WhatsApp"
  },
  "stats": {
    "total_messages": 1500,
    "received": 1200,
    "processed": 1100,
    "failed": 100
  }
}
```

### 👥 Usuários (Admin)

#### GET /admin/users
Listar todos os usuários

**Query Parameters:**
- `page` (int): Página
- `limit` (int): Itens por página
- `role` (string): Filtrar por role
- `status` (string): Filtrar por status
- `search` (string): Buscar por nome/email

#### GET /admin/users/:id
Obter usuário específico

#### PUT /admin/users/:id
Atualizar usuário

**Request:**
```json
{
  "name": "Novo Nome",
  "email": "novo@email.com",
  "role": "client",
  "status": "active"
}
```

#### DELETE /admin/users/:id
Deletar usuário

### 📊 Dashboard (Admin)

#### GET /admin/dashboard
Estatísticas gerais do sistema

**Response:**
```json
{
  "overview": {
    "totalUsers": 50,
    "totalMessages": 10000,
    "totalDids": 500,
    "totalPlatforms": 20
  },
  "users": {
    "total": 50,
    "admins": 2,
    "clients": 48
  },
  "messages": {
    "total": 10000,
    "received": 8000,
    "processed": 7500,
    "failed": 500,
    "recent": [...]
  },
  "dids": {
    "stats": [...]
  },
  "platforms": {
    "stats": [...]
  }
}
```

### 🔗 Webhooks

#### POST /webhooks/receive
Receber webhook

**Headers:**
```
X-SMPP-Signature: <signature>
X-SMPP-Timestamp: <timestamp>
Content-Type: application/json
```

**Request:**
```json
{
  "type": "message_status",
  "messageId": 123,
  "status": "delivered",
  "details": {
    "delivery_time": "2024-01-01T12:05:00.000Z"
  }
}
```

#### POST /webhooks/test (Admin)
Testar webhook

**Request:**
```json
{
  "url": "https://webhook.example.com/test",
  "data": {
    "test": true,
    "message": "Teste de webhook"
  }
}
```

#### GET /webhooks/active (Admin)
Listar webhooks ativos

**Response:**
```json
{
  "webhooks": [
    {
      "platform": "wa",
      "url": "https://webhook.example.com/wa",
      "name": "WhatsApp"
    }
  ]
}
```

## 📝 Códigos de Status HTTP

| Código | Descrição |
|--------|-----------|
| 200 | Sucesso |
| 201 | Criado com sucesso |
| 400 | Dados inválidos |
| 401 | Não autorizado |
| 403 | Acesso negado |
| 404 | Não encontrado |
| 409 | Conflito (recurso já existe) |
| 429 | Muitas requisições |
| 500 | Erro interno do servidor |

## 🔒 Códigos de Erro

| Código | Descrição |
|--------|-----------|
| NO_TOKEN | Token de acesso necessário |
| INVALID_TOKEN | Token inválido |
| TOKEN_EXPIRED | Token expirado |
| USER_NOT_FOUND | Usuário não encontrado |
| USER_INACTIVE | Usuário inativo |
| INSUFFICIENT_PERMISSIONS | Permissões insuficientes |
| VALIDATION_ERROR | Dados inválidos |
| DUPLICATE_RESOURCE | Recurso já existe |
| FOREIGN_KEY_ERROR | Referência inválida |
| SERVICE_UNAVAILABLE | Serviço indisponível |

## 📊 Rate Limiting

- **Limite**: 100 requisições por 15 minutos por IP
- **Headers de resposta**:
  - `X-RateLimit-Limit`: Limite total
  - `X-RateLimit-Remaining`: Requisições restantes
  - `X-RateLimit-Reset`: Timestamp de reset

## 🔄 WebSocket (Tempo Real)

### Conexão
```javascript
const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Conectado');
});

socket.on('messageReceived', (data) => {
  console.log('Nova mensagem:', data);
});
```

### Eventos Disponíveis

- `messageReceived`: Nova mensagem recebida
- `didAssigned`: DID atribuído
- `didReleased`: DID liberado
- `platformUpdated`: Plataforma atualizada
- `userStatusChanged`: Status do usuário alterado

## 📋 Exemplos de Uso

### JavaScript (Fetch)

```javascript
// Login
const login = async (email, password) => {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  
  const data = await response.json();
  return data;
};

// Listar mensagens
const getMessages = async (token) => {
  const response = await fetch('http://localhost:3000/api/messages', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  
  const data = await response.json();
  return data;
};
```

### Python (Requests)

```python
import requests

# Login
def login(email, password):
    response = requests.post('http://localhost:3000/api/auth/login', json={
        'email': email,
        'password': password
    })
    return response.json()

# Listar mensagens
def get_messages(token):
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.get('http://localhost:3000/api/messages', headers=headers)
    return response.json()
```

### cURL

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smpp.com","password":"admin123"}'

# Listar mensagens
curl -X GET http://localhost:3000/api/messages \
  -H "Authorization: Bearer <token>"
```

---

**API Documentation completa! 🎉**

Para mais informações, consulte os outros arquivos de documentação.