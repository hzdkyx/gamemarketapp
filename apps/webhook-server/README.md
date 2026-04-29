# HzdKyx Webhook Server

Backend publico da Fase 5 para receber webhooks da GameMarket e expor eventos para o app desktop.

## Stack

- Node.js + TypeScript
- Fastify
- Zod
- Pino
- Helmet
- Rate limit basico
- CORS controlado
- PostgreSQL em producao via `DATABASE_URL`
- Storage local em arquivo JSON apenas para desenvolvimento

O fallback local fica em `apps/webhook-server/data/webhook-events.json` e nao deve ser usado na Railway. Em `NODE_ENV=production`, o servidor exige `DATABASE_URL`.

## Env

Crie `apps/webhook-server/.env` a partir de `.env.example`:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=
WEBHOOK_INGEST_SECRET=change_me_to_a_long_random_secret
APP_SYNC_TOKEN=change_me_to_a_long_random_token
ALLOWED_ORIGINS=http://localhost:5173
LOG_LEVEL=info
```

Regras:

- `WEBHOOK_INGEST_SECRET` vai na URL cadastrada na GameMarket.
- `APP_SYNC_TOKEN` e usado pelo app desktop em `Authorization: Bearer`.
- Nunca commitar `.env`.
- Em producao, use valores aleatorios longos, com pelo menos 32 caracteres.

## Rodar Local

```bash
npm run dev --workspace @hzdk/webhook-server
```

Build e start:

```bash
npm run build --workspace @hzdk/webhook-server
npm run start --workspace @hzdk/webhook-server
```

## Endpoints

### GET /health

Retorna:

```json
{
  "ok": true,
  "uptime": 123,
  "version": "0.1.0",
  "environment": "development"
}
```

### POST /webhooks/gamemarket/:secret

Endpoint publico para cadastrar na GameMarket:

```text
https://SEU-BACKEND.up.railway.app/webhooks/gamemarket/WEBHOOK_INGEST_SECRET
```

Comportamento:

- valida `:secret`;
- aceita JSON;
- limita body;
- aplica rate limit;
- mascara payload e headers sensiveis;
- salva hash do payload;
- tenta normalizar evento;
- salva como `gamemarket.unknown` quando nao houver estrutura clara.

Teste local:

```bash
curl -X POST "http://localhost:3001/webhooks/gamemarket/SEU_WEBHOOK_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"Venda Confirmada\",\"event_id\":\"teste-1\",\"order_id\":\"pedido-externo-1\"}"
```

### GET /api/events

Protegido por:

```http
Authorization: Bearer APP_SYNC_TOKEN
```

Query params:

- `since`
- `limit`
- `unreadOnly`
- `type`
- `severity`

Nao retorna payload bruto por padrao.

### GET /api/events/:id

Retorna detalhe com `rawPayloadMasked` e `headersMasked`.

### PATCH /api/events/:id/ack

Marca evento como lido/consumido.

### POST /api/test-events

Cria evento de teste protegido por `APP_SYNC_TOKEN`.

```bash
curl -X POST "http://localhost:3001/api/test-events" \
  -H "Authorization: Bearer SEU_APP_SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"eventType\":\"gamemarket.order.sale_confirmed\"}"
```

## Eventos Normalizados

O payload oficial ainda nao esta documentado localmente. O normalizador le campos defensivos como:

- `event`
- `type`
- `event_type`
- `action`
- `category`
- `resource`
- `status`
- `data`
- `payload`

Tipos internos:

- `gamemarket.product.created`
- `gamemarket.product.approved`
- `gamemarket.product.rejected`
- `gamemarket.product.out_of_stock`
- `gamemarket.product.variant_sold_out`
- `gamemarket.order.created`
- `gamemarket.order.sale_confirmed`
- `gamemarket.order.delivered`
- `gamemarket.order.completed`
- `gamemarket.order.cancelled`
- `gamemarket.financial.balance_updated`
- `gamemarket.financial.funds_released`
- `gamemarket.financial.withdrawal_requested`
- `gamemarket.financial.withdrawal_completed`
- `gamemarket.financial.withdrawal_rejected`
- `gamemarket.financial.refund_started`
- `gamemarket.mediation.opened`
- `gamemarket.mediation.updated`
- `gamemarket.mediation.resolved`
- `gamemarket.review.received`
- `gamemarket.unknown`

## Railway

Recomendado:

- Root directory: `apps/webhook-server`
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Healthcheck path: `/health`

Env vars de producao:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://...
WEBHOOK_INGEST_SECRET=valor_longo_aleatorio
APP_SYNC_TOKEN=valor_longo_aleatorio
ALLOWED_ORIGINS=
LOG_LEVEL=info
```

Passo a passo completo: `docs/railway-webhook-deploy.md`.

## Seguranca

- Nao logar tokens.
- Nao retornar tokens pela API.
- Nao aceitar webhook sem segredo correto.
- Nao expor `rawPayload` sem mascaramento.
- Mascarar authorization, cookie, token, password, secret, login e emails.
- Nao implementar entrega automatica.
- Nao criar endpoint da GameMarket.
