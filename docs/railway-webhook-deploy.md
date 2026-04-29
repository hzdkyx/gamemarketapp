# Deploy Railway do Webhook Server

Este guia prepara o backend publico da Fase 5. Nao cria webhook automaticamente na GameMarket e nao faz deploy automatico.

## 1. Criar Projeto

1. Acesse Railway.
2. Crie um novo projeto ou use o projeto existente do app.
3. Conecte o GitHub repo `hzdkyx/gamemarketapp`.
4. Selecione o servico do webhook server.

Configuracao recomendada para monorepo:

- Root directory: `apps/webhook-server`
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Healthcheck path: `/health`

Alternativa se o deploy usar a raiz do monorepo:

- Build command: `npm install && npm run build --workspace @hzdk/webhook-server`
- Start command: `npm run start --workspace @hzdk/webhook-server`

## 2. Provisionar PostgreSQL

Adicione PostgreSQL no projeto Railway e exponha `DATABASE_URL` para o servico `webhook-server`.

Em producao, `DATABASE_URL` e obrigatorio. O storage local em arquivo JSON existe apenas para desenvolvimento e nao deve ser usado em filesystem efemero.

## 3. Configurar Env Vars

Defina no Railway:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=${{Postgres.DATABASE_URL}}
WEBHOOK_INGEST_SECRET=valor_longo_aleatorio_com_32_ou_mais_chars
APP_SYNC_TOKEN=outro_valor_longo_aleatorio_com_32_ou_mais_chars
ALLOWED_ORIGINS=
LOG_LEVEL=info
```

Regras:

- `WEBHOOK_INGEST_SECRET` vai na URL cadastrada no painel GameMarket.
- `APP_SYNC_TOKEN` vai no app desktop em **Configurações → Webhook Server / Tempo Real**.
- Use valores diferentes para os dois tokens.
- Nunca cole esses valores em commit, README publico, issue ou screenshot.

## 4. Deploy

Acione o deploy pelo Railway depois de configurar as variaveis.

Validar health:

```bash
curl https://URL-RAILWAY.up.railway.app/health
```

Resposta esperada:

```json
{
  "ok": true,
  "uptime": 123,
  "version": "0.1.0",
  "environment": "production"
}
```

## 5. URL para Cadastrar na GameMarket

Use:

```text
https://URL-RAILWAY.up.railway.app/webhooks/gamemarket/WEBHOOK_INGEST_SECRET
```

Nao cadastre `APP_SYNC_TOKEN` na GameMarket. Ele e exclusivo do desktop.

## 6. Eventos Prioritarios

Comece com:

- Venda Confirmada
- Mediação Aberta
- Reembolso Iniciado
- Avaliação Recebida
- Sem Estoque
- Variante Esgotada

Depois, se o volume estiver controlado:

- Pedido Criado
- Pedido Entregue
- Pedido Concluído
- Pedido Cancelado
- Fundos Liberados

Nao selecione todos no inicio se isso gerar ruido demais.

## 7. Testar Evento

Teste pelo endpoint interno antes de depender de venda real:

```bash
curl -X POST "https://URL-RAILWAY.up.railway.app/api/test-events" \
  -H "Authorization: Bearer APP_SYNC_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"eventType\":\"gamemarket.order.sale_confirmed\"}"
```

No desktop:

1. Abra **Configurações → Webhook Server / Tempo Real**.
2. Informe `https://URL-RAILWAY.up.railway.app`.
3. Informe `APP_SYNC_TOKEN`.
4. Clique em **Testar backend**.
5. Clique em **Buscar eventos agora**.
6. Confirme o evento na tela **Eventos**.

## 8. Limites e Segurança

- O servidor nao automatiza entrega.
- O servidor nao chama endpoints de escrita/exclusao da GameMarket.
- O payload oficial de webhook ainda nao esta documentado localmente.
- Payload desconhecido e salvo como `gamemarket.unknown` para analise posterior.
- Raw payload e headers sempre sao mascarados antes de persistir.
