Autenticação
A API utiliza chaves de API para autenticação. Você pode criar e gerenciar suas chaves na página de configurações.

Usando a chave de API
Inclua sua chave de API no header x-api-key de todas as requisições:

Exemplo de requisição (também aceita /api/gamemarket/...)
curl -X GET "https://gamemarket.com.br/api/v1/products" \
  -H "x-api-key: gm_sk_sua_chave_aqui"

Permissões
Cada chave de API pode ter diferentes permissões:

read
Permite leitura de dados (produtos, pedidos, saldo)
write
Permite criação e atualização de recursos
delete
Permite exclusão de recursos
Gestão de Chaves
Endpoints para gerenciar suas chaves de API. Estes endpoints requerem autenticação por sessão (login no site).

POST
/api/api-keys
Cria uma nova chave de API. Você pode ter no máximo 5 chaves ativas.

Headers
Content-Type: application/json- Tipo do conteúdo
Exemplo de Resposta
{
  "success": true,
  "message": "API key created successfully. Save this key - it will not be shown again!",
  "apiKey": "gm_sk_abc123...",
  "keyPrefix": "gm_sk_abc123...",
  "name": "Minha Integração",
  "permissions": ["read", "write"]
}

GET
/api/api-keys
Lista todas as suas chaves de API.

Exemplo de Resposta
{
  "keys": [
    {
      "id": 1,
      "name": "Minha Integração",
      "keyPrefix": "gm_sk_abc123...",
      "permissions": ["read", "write"],
      "isActive": true,
      "totalRequests": 150,
      "lastUsedAt": "2025-01-05T10:30:00Z",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}

DELETE
/api/api-keys/:id
Revoga uma chave de API. A chave não poderá mais ser usada.

Parâmetros de Path
id
(number)
obrigatório
- ID da chave de API
Exemplo de Resposta
{
  "success": true,
  "message": "API key revoked successfully"
}

GET
/api/api-keys/:id/usage
Retorna o histórico de uso de uma chave de API (últimas 100 requisições).

Parâmetros de Path
id
(number)
obrigatório
- ID da chave de API
Exemplo de Resposta
{
  "logs": [
    {
      "id": 1,
      "endpoint": "/api/v1/products",
      "method": "GET",
      "statusCode": 200,
      "responseTimeMs": 45,
      "ipAddress": "192.168.1.1",
      "createdAt": "2025-01-05T10:30:00Z"
    }
  ]
}

Produtos
Endpoints para gerenciar seus produtos na plataforma.

GET
/api/v1/products
read
Lista todos os seus produtos com paginação. Retorna um campo 'status' calculado para cada produto.

Query Parameters
page
(number)
default: 1
- Número da página
limit
(number)
default: 20
- Itens por página (máx 100)
status
(string)
- Filtrar por status: 'ativo' (aprovado e visível), 'desativado' (inativo manualmente), 'em_analise' (aguardando aprovação), 'rejeitado' (negado pela equipe), 'todos' (sem filtro)
Headers
x-api-key: gm_sk_...- Sua chave de API
Exemplo de Resposta
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Conta Valorant Radiante",
      "description": "Conta com todas as skins...",
      "price": 15000,
      "game": "valorant",
      "category": "account",
      "featured": true,
      "warrantyPeriod": 7,
      "listingType": "single",
      "isAutoDelivery": false,
      "isApproved": true,
      "needsApproval": false,
      "isActive": true,
      "rejectionReason": null,
      "status": "ativo",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  },
  "statusOptions": {
    "ativo": "Anúncio aprovado e ativo, visível para compradores",
    "desativado": "Anúncio desativado manualmente pelo vendedor",
    "em_analise": "Anúncio aguardando aprovação da equipe",
    "rejeitado": "Anúncio rejeitado pela equipe (ver rejectionReason)",
    "todos": "Retorna todos os anúncios sem filtro de status"
  }
}

GET
/api/v1/products/:id
read
Retorna os detalhes de um produto específico.

Parâmetros de Path
id
(number)
obrigatório
- ID do produto
Headers
x-api-key: gm_sk_...- Sua chave de API
Exemplo de Resposta
{
  "success": true,
  "data": {
    "id": 1,
    "title": "Conta Valorant Radiante",
    "description": "Conta com todas as skins...",
    "price": 15000,
    "imageUrls": ["https://example.com/img1.webp"],
    "game": "valorant",
    "category": "account",
    "featured": true,
    "warrantyPeriod": 7,
    "listingType": "single",
    "isAutoDelivery": false,
    "isApproved": true,
    "needsApproval": false,
    "isActive": true,
    "isDeleted": false,
    "rejectionReason": null,
    "salesCount": 12,
    "slug": "conta-valorant-radiante",
    "createdAt": "2025-01-01T00:00:00Z",
    "currencyName": null,
    "currencyAmount": null,
    "currencyIconUrl": null,
    "deliveryTime": "1d",
    "multipleProducts": null
  }
}

POST
/api/v1/products
write
Cria um novo anúncio/produto na plataforma. O anúncio ficará pendente de aprovação. Limite: 100 anúncios por dia por conta.

Headers
x-api-key: gm_sk_...- Sua chave de API
Content-Type: application/json- Tipo do conteúdo
Corpo da Requisição (JSON)
title
(string)
obrigatório
- Título do anúncio (5-200 caracteres)
description
(string)
obrigatório
- Descrição detalhada (20-5000 caracteres)
price
(number)
obrigatório
- Preço em centavos (mín: 100 = R$ 1,00)
game
(string)
obrigatório
- Slug do jogo (use GET /games para listar)
category
(string)
default: account
- Categoria: 'account', 'item', 'currency'
warrantyPeriod
(number)
obrigatório
- Período de garantia em dias (valores aceitos: 7, 14 ou 30)
accountProvenance
(string)
obrigatório
- Procedência: 'creator' (criador original) ou 'resale' (revenda)
listingType
(string)
default: single
- Tipo de listagem: 'single' ou 'multiple'
isAutoDelivery
(boolean)
default: false
- Se é entrega automática (⚠️ APENAS para listingType='single')
autoDeliveryContent
(string)
- ⚠️ OBRIGATÓRIO se isAutoDelivery=true E listingType='single'. Conteúdo entregue automaticamente (máx 10.000 chars)
deliveryTime
(string)
- Prazo de entrega (ex: '1d', '2h', '15min', máx 20 chars)
currencyAmount
(number)
- ⚠️ OBRIGATÓRIO se category='currency'. Quantidade de moeda virtual
currencyName
(string)
- ⚠️ OBRIGATÓRIO se category='currency'. Nome da moeda (ex: 'V-Bucks', 'Riot Points')
currencyRegion
(string)
- Região da moeda (ex: 'BR', 'US', 'EU', 'Global')
imageUrls
(string[])
- Array de URLs HTTPS de imagens (máx 10, apenas URLs públicas)
Exemplo de Requisição
{
  "title": "Conta Valorant Radiante Full Skin",
  "description": "Conta Radiante com mais de 100 skins, todos os agentes desbloqueados, ato 1 até 8 completos. Pronta para rankear!",
  "price": 150000,
  "game": "valorant",
  "category": "account",
  "warrantyPeriod": 30,
  "accountProvenance": "creator",
  "deliveryTime": "1d"
}

Exemplo de Resposta
{
  "success": true,
  "message": "Anúncio criado com sucesso! Aguardando aprovação.",
  "data": {
    "id": 123,
    "title": "Conta Valorant Radiante Full Skin",
    "price": 150000,
    "game": "valorant",
    "category": "account",
    "status": "em_analise",
    "isApproved": false,
    "needsApproval": true,
    "createdAt": "2026-01-06T10:30:00Z"
  },
  "dailyLimit": {
    "limit": 100,
    "used": 1,
    "remaining": 99
  }
}

⚠️ Campos Obrigatórios Condicionalmente:

autoDeliveryContent é obrigatório se isAutoDelivery=true (⚠️ Auto-delivery funciona APENAS com listingType='single')
currencyAmount e currencyName são obrigatórios se category='currency'
imageUrls devem ser HTTPS e acessíveis publicamente (validação automática)
warrantyPeriod aceita apenas os valores: 7, 14 ou 30 dias
PATCH
/api/v1/products/:id
write
Atualiza informações de um produto. Para desativar um anúncio, use isActive: false.

Parâmetros de Path
id
(number)
obrigatório
- ID do produto
Headers
x-api-key: gm_sk_...- Sua chave de API
Content-Type: application/json- Tipo do conteúdo
Corpo da Requisição (JSON)
title
(string)
- Novo título (mín: 5 chars, máx: 200) ⚠️ Requer nova aprovação
description
(string)
- Nova descrição (mín: 20 chars, máx: 5.000) ⚠️ Requer nova aprovação
price
(number)
- Novo preço em centavos (mín: 100 = R$ 1,00)
isActive
(boolean)
- Ativar (true) ou desativar (false) o anúncio
warrantyPeriod
(number)
- Período de garantia em dias (valores aceitos: 7, 14 ou 30)
deliveryTime
(string)
- Prazo de entrega (máx 20 chars, ex: '1d', '2h')
autoDeliveryContent
(string)
- Conteúdo de entrega automática (máx 10.000 chars)
Exemplo de Resposta
{
  "success": true,
  "message": "Product updated successfully",
  "data": {
    "id": 1,
    "title": "Conta Valorant Radiante (Atualizado)",
    "description": "Conta com todas as skins...",
    "price": 14500,
    "game": "valorant",
    "category": "account",
    "isApproved": true,
    "needsApproval": false,
    "isActive": true,
    "rejectionReason": null,
    "slug": "conta-valorant-radiante",
    "createdAt": "2025-01-01T00:00:00Z"
  }
}

⚠️ Importante sobre edições (PATCH):

Alterações em title ou description retornam o produto para status "em_analise" (nova aprovação necessária)
Produtos com status "rejeitado" não podem ser editados via API (HTTP 403)
Para desativar um anúncio temporariamente, use isActive: false
Nota: Por segurança, a exclusão de produtos via API foi desabilitada. Para desativar um anúncio, use PATCH /api/v1/products/:id com isActive: false. Para excluir permanentemente, acesse o painel do vendedor no site.

Saldo
GET
/api/v1/balance
read
Retorna o saldo atual do vendedor.

Headers
x-api-key: gm_sk_...- Sua chave de API
Exemplo de Resposta
{
  "success": true,
  "data": {
    "available": 150000,
    "pending": 25000,
    "blocked": 0,
    "totalSales": 500000,
    "currency": "BRL",
    "formatted": {
      "available": "R$ 1.500,00",
      "pending": "R$ 250,00",
      "blocked": "R$ 0,00"
    }
  }
}

Pedidos
GET
/api/v1/orders
read
Lista todos os seus pedidos (vendas e compras).

Query Parameters
page
(number)
default: 1
- Número da página
limit
(number)
default: 20
- Itens por página (máx 100)
type
(string)
- Filtrar por tipo (sales, purchases)
status
(string)
- Filtrar por status
Headers
x-api-key: gm_sk_...- Sua chave de API
Exemplo de Resposta
{
  "success": true,
  "data": [
    {
      "id": 1,
      "productId": 15,
      "buyerName": "joao_gamer",
      "sellerName": "maria_vendedora",
      "price": 15000,
      "quantity": 1,
      "status": "completed",
      "createdAt": "2025-01-05T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 125,
    "totalPages": 7
  }
}

GET
/api/v1/orders/:id
read
Retorna os detalhes de um pedido específico.

Parâmetros de Path
id
(number)
obrigatório
- ID do pedido
Headers
x-api-key: gm_sk_...- Sua chave de API
Exemplo de Resposta
{
  "success": true,
  "data": {
    "id": 1,
    "productId": 15,
    "buyerName": "joao_gamer",
    "sellerName": "maria_vendedora",
    "price": 15000,
    "quantity": 1,
    "status": "completed",
    "createdAt": "2025-01-05T10:30:00Z",
    "updatedAt": "2025-01-05T12:15:00Z"
  }
}

Estatísticas
GET
/api/v1/stats
read
Retorna estatísticas gerais do vendedor.

Headers
x-api-key: gm_sk_...- Sua chave de API
Exemplo de Resposta
{
  "success": true,
  "data": {
    "totalSales": 500000,
    "rating": 4.8,
    "userLevel": 5,
    "activeProducts": 45,
    "totalOrders": 125,
    "completedOrders": 118
  }
}

Jogos
GET
/api/v1/games
read
Lista todos os jogos disponíveis e ativos na plataforma. Retorna apenas nome e status.

Headers
x-api-key: gm_sk_...- Sua chave de API
Exemplo de Resposta
{
  "success": true,
  "data": [
    {
      "name": "Valorant",
      "slug": "valorant",
      "isActive": true
    },
    {
      "name": "League of Legends",
      "slug": "league-of-legends",
      "isActive": true
    }
  ]
}

Limites & Quotas
Rate Limits
Requisições por minuto
20/min
Requisições por dia
500/dia
💡 Os limites são por chave de API. Headers de resposta incluem: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset (timestamp Unix em segundos)

Limites de Criação
Anúncios por dia (via API)
100/dia
Imagens por anúncio
Máx 10
Conteúdo auto-delivery
Máx 10,000 chars
Limites de Tamanho
Título do produto
5-200 chars
Descrição
20-5,000 chars
Preço mínimo
R$ 1,00
Melhores Práticas
Segurança
🔒
Nunca exponha sua API key no código client-side

Use variáveis de ambiente e sempre faça chamadas pelo backend

🔄
Rotacione suas chaves periodicamente

Recomendamos rotação a cada 90 dias por segurança

👁️
Monitore o uso das suas chaves

Verifique regularmente os logs de acesso em Configurações → API

Performance
💾
Implemente cache local

Liste de jogos (GET /games) raramente muda - cache por 24h

📊
Use paginação eficientemente

Limite máximo é 100 itens. Use limit menor para respostas mais rápidas

🔄
Implemente retry com backoff exponencial

Em caso de erro 429 (rate limit), aguarde o tempo indicado em X-RateLimit-Reset

Validação de Dados
✅
Valide antes de enviar

Verifique tipos, limites e formatos localmente antes de fazer requisições

🔍
Sempre verifique o campo success

Respostas incluem "success": true/false - nunca assuma sucesso sem verificar

⚠️
Produtos editados podem requerer nova aprovação

Alterações em título ou descrição retornam o produto para status "em_analise"

Códigos de Erro
401
API key inválida ou ausente
A chave de API não foi fornecida ou está incorreta.

403
Permissão insuficiente
A chave de API não tem permissão para esta operação.

403
Vendedor em débito (SELLER_IN_DEBT)
A API foi suspensa porque o vendedor possui débito pendente com a plataforma. Regularize as disputas para restaurar o acesso.

429
Rate limit excedido
Você excedeu o limite de requisições. Aguarde antes de tentar novamente.

404
Recurso não encontrado
O recurso solicitado não existe ou você não tem acesso a ele.

500
Erro interno do servidor
Ocorreu um erro inesperado. Tente novamente mais tarde.

Exemplos de Código

$
cURL

⬢
JavaScript

🐍
Python

🐘
PHP

💎
Ruby

◈
Go

#
C#
Listar produtos
curl -X GET "https://gamemarket.com.br/api/v1/products" \
  -H "x-api-key: gm_sk_sua_chave_aqui"

Atualizar produto
curl -X PATCH "https://gamemarket.com.br/api/v1/products/123" \
  -H "x-api-key: gm_sk_sua_chave_aqui" \
  -H "Content-Type: application/json" \
  -d '{"title": "Novo título", "price": 15000}'

Consultar saldo
curl -X GET "https://gamemarket.com.br/api/v1/balance" \
  -H "x-api-key: gm_sk_sua_chave_aqui"