# Arquitetura

## Visão Atual

O HzdKyx GameMarket Manager é um app desktop local. O renderer React não acessa SQLite, filesystem ou criptografia diretamente. Essas responsabilidades ficam no processo principal do Electron e são expostas por canais IPC fechados.

```mermaid
flowchart LR
  UI["Renderer React"] --> Preload["Preload seguro"]
  Preload --> IPC["IPC validado por Zod"]
  IPC --> Auth["Sessão e permissões"]
  IPC --> Services["Services"]
  Services --> Repos["Repositories SQLite"]
  Services --> Crypto["safeStorage / fallback AES-GCM"]
  Repos --> DB["SQLite local"]
```

## Fluxo Produto → Variação → Estoque → Pedido → Evento

```mermaid
flowchart LR
  Product["Produto"] --> Inventory["Itens de estoque"]
  Product --> Variant["Variações do anúncio"]
  Variant --> Inventory
  Variant --> Order
  Product --> Order["Pedido manual"]
  Inventory --> Order
  Order --> Event["Evento interno"]
  Inventory --> Event
  Product --> Event
  Variant --> Event
```

Na operação atual:

- Produto representa o anúncio importado da GameMarket ou cadastrado manualmente.
- Variação representa a opção operacional vendida dentro do anúncio.
- Estoque registra itens concretos vinculados a produtos e, opcionalmente, a uma variação.
- Pedido manual guarda snapshots de produto, variação, categoria/jogo, preço, custo, taxa, líquido, lucro e margem.
- Pedido pode vincular um item de estoque compatível com o produto e com a variação.
- Mudanças de status de pedido geram eventos internos e atualizam o status do item de estoque quando aplicável.
- Eventos formam a timeline/auditoria local do pedido.

Essa separação mantém a operação manual e auditável sem inventar endpoints, eventos ou automações reais da GameMarket.

## SQLite e Migrations

O banco fica em `app.getPath("userData")/hzdk-gamemarket-manager.sqlite`.

As migrations runtime estão em `apps/desktop/src/main/database/migrations.ts`:

- `0000_initial_schema`: base da Fase 1.
- `0001_phase2_products_inventory`: amplia produtos e estoque, recria tabelas quando necessário para corrigir enums/check constraints e preservar dados existentes.
- `0002_phase3_orders_events`: recria pedidos e eventos com snapshots financeiros, vínculos com estoque/produto, timeline e índices de consulta.
- `0003_phase35_auth_users_audit`: adiciona `users`, colunas de auditoria por usuário e o evento `security.secret_revealed`.
- `0004_phase4_gamemarket_api`: adiciona metadados externos em produtos/pedidos e amplia eventos internos da integração GameMarket.
- `0005_phase5_webhook_server`: amplia eventos internos para Webhook Server e cria `webhook_server_event_imports` para deduplicar importações remotas.
- `0006_product_variants`: adiciona `product_variants`, vínculos opcionais `product_variant_id` em estoque e pedidos, e índices de consulta por produto, código, status e revisão.

A tabela `schema_migrations` registra o que já foi aplicado. O app executa migrations na inicialização do main process.

## Produtos

Campos persistidos:

- `internal_code`, `name`, `category`, `game`, `platform`
- `listing_url`
- `sale_price_cents`, `unit_cost_cents`, `fee_percent`
- `net_value_cents`, `estimated_profit_cents`, `margin_percent`
- `stock_current`, `stock_min`
- `status`, `delivery_type`, `supplier_id`, `notes`
- metadados GameMarket: `external_marketplace`, `external_product_id`, `external_status`, `external_payload_hash`, `last_synced_at`
- auditoria: `created_by_user_id`, `updated_by_user_id`

O cálculo financeiro é feito no service usando `packages/shared/src/financial.ts`, nunca duplicado na UI.

## Variações de Produto

Tabela `product_variants`:

- `id`
- `product_id`
- `variant_code`
- `name`
- `description`
- `sale_price_cents`
- `unit_cost_cents`
- `fee_percent`
- `net_value_cents`
- `estimated_profit_cents`
- `margin_percent`
- `stock_current`
- `stock_min`
- `supplier_name`
- `supplier_url`
- `delivery_type`: `manual`, `automatic`, `on_demand`, `service`
- `status`: `active`, `paused`, `out_of_stock`, `archived`
- `notes`
- `source`: `manual`, `seeded_from_conversation`, `gamemarket_sync`, `imported`
- `needs_review`
- `manually_edited_at`
- `created_at`, `updated_at`

Regras:

- `needs_review` é persistido como inteiro `0/1`.
- Valores financeiros são salvos em centavos.
- `net_value_cents`, `estimated_profit_cents`, `margin_percent` e preço mínimo são calculados no service com as fórmulas compartilhadas.
- `manual` e `automatic` exigem estoque real.
- `on_demand` e `service` não entram em métricas de sem estoque ou estoque baixo.
- Sync da GameMarket não apaga variações e não sobrescreve custo, fornecedor, tipo de entrega, estoque ou notas locais.

## Estoque

Campos persistidos:

- `inventory_code`
- `product_id`, `product_variant_id`, `supplier_id`
- `purchase_cost_cents`
- `status`
- colunas criptografadas para login, senha, email, senha do email e notas de acesso
- `public_notes`
- datas de compra, venda e entrega
- `order_id` futuro
- auditoria: `created_by_user_id`, `updated_by_user_id`

Listagens e exportações retornam apenas metadados e flags sobre segredos. O segredo em texto aberto só retorna pelo IPC `inventory:revealSecret` após ação explícita do usuário na UI.

## Pedidos

Campos persistidos:

- `order_code`, `external_order_id`, `marketplace`
- metadados GameMarket: `external_marketplace`, `external_status`, `external_payload_hash`, `last_synced_at`
- `product_id`, `product_variant_id`, `inventory_item_id`
- `buyer_name`, `buyer_contact`
- snapshots: `product_name_snapshot`, `category_snapshot`
- financeiros: `sale_price_cents`, `unit_cost_cents`, `fee_percent`, `net_value_cents`, `profit_cents`, `margin_percent`
- `status`, `action_required`, `marketplace_url`, `notes`
- datas de auditoria: `created_at`, `updated_at`, `confirmed_at`, `delivered_at`, `completed_at`, `cancelled_at`, `refunded_at`
- usuário: `created_by_user_id`, `updated_by_user_id`

O cálculo financeiro usa `calculateProductFinancials` de `packages/shared`. A UI pode sugerir valores vindos do produto, mas o cálculo final acontece no main process.

Quando `product_variant_id` existe, o pedido usa o custo, preço e taxa da variação como base do snapshot. Sem variação, usa o produto pai. Pedidos importados da GameMarket que apontam para produto com variações, mas sem variação detectada, ficam com `variantPending` para revisão manual.

Regras de estoque vinculadas ao status do pedido:

- `payment_confirmed` e `awaiting_delivery`: reservam item `available`.
- `delivered`: marca item como `delivered`.
- `completed`: garante item `delivered` ou `sold`.
- `cancelled`: libera item `reserved` ainda não entregue.
- `refunded`: se não entregue, libera; se entregue/vendido, mantém como `refunded` para revisão.
- `mediation` e `problem`: não liberam automaticamente, apenas destacam ação manual.

## Eventos Internos

Eventos são auditoria local do app. Os tipos iniciais são controlados em `contracts.ts`:

- `order.created`
- `order.payment_confirmed`
- `order.awaiting_delivery`
- `order.delivered`
- `order.completed`
- `order.cancelled`
- `order.refunded`
- `order.mediation`
- `order.problem`
- `inventory.reserved`
- `inventory.released`
- `inventory.sold`
- `inventory.delivered`
- `inventory.problem`
- `product.low_stock`
- `product.out_of_stock`
- `security.secret_revealed`
- `integration.gamemarket.settings_updated`
- `integration.gamemarket.connection_tested`
- `integration.gamemarket.connection_failed`
- `integration.gamemarket.token_revealed`
- `integration.gamemarket.sync_started`
- `integration.gamemarket.sync_completed`
- `integration.gamemarket.sync_failed`
- `integration.gamemarket.order_imported`
- `integration.gamemarket.order_updated`
- `integration.gamemarket.product_imported`
- `integration.gamemarket.product_updated`
- `integration.webhook_server.settings_updated`
- `integration.webhook_server.connection_tested`
- `integration.webhook_server.connection_failed`
- `integration.webhook_server.token_revealed`
- `integration.webhook_server.sync_started`
- `integration.webhook_server.sync_completed`
- `integration.webhook_server.sync_failed`
- `integration.webhook_server.test_event_sent`
- `integration.webhook_server.event_imported`
- `integration.webhook_server.review_received`
- `integration.webhook_server.variant_sold_out`
- `integration.webhook_server.unknown_event`
- `system.notification_test`

`gamemarket_api` identifica eventos criados pela integração local de leitura. `webhook_server` identifica eventos importados do backend público. `gamemarket_future` e `webhook_future` continuam reservados para normalização futura.

Payload bruto é opcional, limitado e passa por mascaramento de chaves sensíveis como senha, token, secret, key e login.

Eventos também podem registrar `actor_user_id`. Para `security.secret_revealed`, o payload nunca contém o segredo revelado; contém apenas usuário, campo, item de estoque e data/hora.

## Autenticação Local

Fluxo:

```mermaid
flowchart TD
  Start["App abriu"] --> Check["Existe admin?"]
  Check -->|não| Setup["Configuração inicial"]
  Setup --> Login["Login local"]
  Check -->|sim| Login
  Login -->|válido| Session["Sessão em memória no main process"]
  Session --> Dashboard["Dashboard"]
  Login -->|inválido| Error["Erro genérico"]
  Session --> Logout["Logout"]
  Logout --> Login
```

A sessão local vive no main process e é perdida ao sair do app. Mesmo com UI protegida, os canais IPC também chamam `requireSession` ou `requirePermission`, então o renderer não consegue executar ações internas sem autenticação.

Tabela `users`:

- `id`
- `name`
- `username`
- `password_hash`
- `role`: `admin`, `operator`, `viewer`
- `status`: `active`, `disabled`
- `last_login_at`
- `failed_login_attempts`
- `locked_until`
- `must_change_password`
- `allow_reveal_secrets`
- `created_at`, `updated_at`

Senha:

- hash com `bcryptjs`;
- senha em texto puro nunca é persistida;
- hash nunca é enviado ao renderer;
- login inválido retorna “Usuário ou senha inválidos.”;
- após várias tentativas inválidas, o usuário fica bloqueado temporariamente.

## Permissões

Permissões calculadas por sessão:

- `canManageUsers`
- `canManageSettings`
- `canRevealSecrets`
- `canEditProducts`
- `canEditInventory`
- `canEditOrders`
- `canExportCsv`

Mapeamento:

- `admin`: todas as permissões.
- `operator`: edita produtos, estoque, pedidos e eventos; exporta CSV; revela segredos somente quando `allow_reveal_secrets = 1`.
- `viewer`: visualização de dashboard, produtos, pedidos e eventos; sem edição, exportação ou revelação de segredos.

O service de usuários impede desativar ou rebaixar o último admin ativo.

## Auditoria Local

Cada ação operacional importante cria um evento persistido no SQLite. A timeline do pedido consulta `events.order_id` em ordem cronológica. Essa estratégia permite:

- investigar mudança de status;
- ver quando estoque foi reservado, liberado, entregue ou marcado com problema;
- manter histórico local mesmo sem backend;
- preparar sincronização futura sem depender dela agora.

Não há deleção de segredos quando um pedido é entregue ou concluído. Segredos continuam protegidos no estoque e só aparecem mediante `inventory:revealSecret`.

## IPC

Canais da Fase 2:

Produtos:

- `products:list`
- `products:get`
- `products:create`
- `products:update`
- `products:delete`
- `products:exportCsv`

Variações de produto:

- `productVariants:list`
- `productVariants:get`
- `productVariants:create`
- `productVariants:update`
- `productVariants:duplicate`
- `productVariants:archive`
- `productVariants:markNeedsReview`
- `productVariants:delete`
- `productVariants:exportCsv`

Estoque:

- `inventory:list`
- `inventory:get`
- `inventory:create`
- `inventory:update`
- `inventory:delete`
- `inventory:revealSecret`
- `inventory:exportCsv`

Canais adicionados na Fase 3:

Pedidos:

- `orders:list`
- `orders:get`
- `orders:create`
- `orders:update`
- `orders:delete`
- `orders:archive`
- `orders:changeStatus`
- `orders:linkInventoryItem`
- `orders:unlinkInventoryItem`
- `orders:exportCsv`

Eventos:

- `events:list`
- `events:get`
- `events:markRead`
- `events:markAllRead`
- `events:createManual`
- `events:exportCsv`

Dashboard:

- `dashboard:getSummary`

Configurações:

- `settings:getNotificationSettings`
- `settings:updateNotificationSettings`

GameMarket API:

- `gamemarket:getSettings`
- `gamemarket:updateSettings`
- `gamemarket:revealToken`
- `gamemarket:testConnection`
- `gamemarket:syncNow`
- `gamemarket:getLastSyncSummary`

Webhook Server:

- `webhookServer:getSettings`
- `webhookServer:updateSettings`
- `webhookServer:revealToken`
- `webhookServer:testConnection`
- `webhookServer:sendTestEvent`
- `webhookServer:syncEventsNow`
- `webhookServer:getLastSyncSummary`

Autenticação e usuários:

- `auth:getBootstrap`
- `auth:setupAdmin`
- `auth:login`
- `auth:logout`
- `auth:getSession`
- `auth:changeOwnPassword`
- `users:list`
- `users:create`
- `users:update`
- `users:resetPassword`

Todos os payloads são validados por schemas Zod em `apps/desktop/src/shared/contracts.ts` antes de tocar em repositories ou banco.

Os canais internos são protegidos por sessão. Ações de escrita e exportação exigem permissões específicas.

## Integração GameMarket API

O módulo oficial da Fase 4 fica em `apps/desktop/src/main/integrations/gamemarket/`.

```mermaid
flowchart LR
  UI["Configurações GameMarket API"] --> IPCGM["IPC gamemarket:*"]
  IPCGM --> Settings["Settings service"]
  IPCGM --> GMService["GameMarket service"]
  GMService --> Client["GameMarket client HTTP"]
  GMService --> Sync["Sync service"]
  Client --> API["GameMarket API"]
  Sync --> DB["SQLite local"]
  Sync --> Events["Eventos internos"]
```

Regras da Fase 4:

- autenticação por `x-api-key`, conforme documentação local;
- token criptografado em `settings.gamemarket_api_token_encrypted`;
- token mascarado por padrão no renderer;
- logs/eventos recebem apenas metadados seguros;
- teste de conexão usa `GET /api/v1/games`;
- sync manual usa `GET /api/v1/products` e `GET /api/v1/orders`;
- produtos e pedidos usam `externalPayloadHash` para evitar duplicatas;
- dados locais existentes não são sobrescritos por payload externo sem critério;
- variações locais não são apagadas nem sobrescritas pelo sync;
- custo unitário, fornecedor, tipo de entrega, estoque e notas locais permanecem sob controle do usuário;
- pedidos importados ficam para revisão manual quando não há mapeamento oficial completo de status.

Diferença entre sync manual e webhook futuro:

- sync manual é uma ação admin local que puxa dados da API documentada de leitura;
- webhook futuro exige backend público, porque o app desktop local não tem URL pública estável, TLS público, fila de retries nem disponibilidade garantida.

Na Fase 5, o backend público poderá rodar na Railway, receber webhooks da GameMarket, validar assinatura/token oficial, normalizar eventos e entregar mudanças ao desktop por um fluxo próprio.

## Segurança

Responsabilidades:

- Renderer: coleta dados digitados e mostra segredos apenas após confirmação.
- Preload: expõe métodos tipados, sem canal IPC arbitrário.
- Main process: valida payloads, criptografa/descriptografa e persiste.
- Repositories: executam SQL parametrizado.
- Auth services: validam senha, mantêm sessão e calculam permissões.

Criptografia:

- Preferencial: `safeStorage` do Electron.
- Fallback: AES-256-GCM com chave aleatória local em `userData`.
- Tokens criptografados recebem prefixo de versão para permitir migrações futuras.
- Segredos antigos sem prefixo ainda tentam descriptografia via `safeStorage` para compatibilidade.

Limitações de segurança local:

- O app é desktop local; um usuário com acesso ao perfil do sistema operacional e privilégios sobre os arquivos locais pode tentar copiar o banco.
- `safeStorage` depende do cofre do sistema operacional.
- O fallback AES-GCM protege contra leitura casual, mas usa chave local em `userData`.
- A autenticação protege o uso normal do app e os canais IPC, não substitui criptografia de disco do Windows.

## Empacotamento Electron

O pacote desktop usa `electron-builder`.

Scripts:

- raiz: `npm run dist`
- workspace: `npm run dist --workspace @hzdk/gamemarket-desktop`

Configuração:

- `appId`: `br.com.hzdk.gamemarketmanager`
- `productName`: `HzdKyx GameMarket Manager`
- saída: `apps/desktop/release/`
- targets Windows: `nsis` e `portable`

O SQLite fica em `app.getPath("userData")`, portanto o caminho continua válido no app empacotado. As migrations rodam no main process durante a inicialização, tanto em desenvolvimento quanto no build.

## Webhook Server da Fase 5

O app desktop não é endpoint direto de webhook porque não tem URL pública estável, TLS público, disponibilidade contínua, retry externo nem isolamento apropriado para receber tráfego da internet. A Fase 5 usa um backend público pequeno para receber eventos e o desktop continua puxando dados de forma autenticada.

```mermaid
flowchart LR
  GM["GameMarket UI Webhook"] --> WH["Railway webhook-server"]
  WH --> PG["PostgreSQL Railway"]
  Desktop["App desktop"] -->|"Bearer APP_SYNC_TOKEN"| WH
  Desktop --> Events["Eventos locais"]
  Desktop --> LocalDB["SQLite local"]
  Desktop --> Notify["Notificação desktop"]
```

Servidor:

- `POST /webhooks/gamemarket/:secret` valida `WEBHOOK_INGEST_SECRET` por comparação segura.
- `GET /api/events`, `GET /api/events/:id`, `PATCH /api/events/:id/ack` exigem `Authorization: Bearer APP_SYNC_TOKEN`.
- `POST /api/test-events` cria eventos de teste protegidos pelo mesmo token.
- Payload bruto é salvo somente mascarado.
- Headers são filtrados e `authorization`, `cookie`, `token`, `password`, `secret`, `login` e emails são mascarados.
- Produção exige `DATABASE_URL`; o fallback local em arquivo JSON é apenas para desenvolvimento.

Desktop:

- Salva Backend URL e App Sync Token em **Configurações → Webhook Server / Tempo Real**.
- Token fica criptografado via `safeStorage` ou fallback AES-GCM local.
- Sync importa eventos remotos para `events`.
- `webhook_server_event_imports` evita duplicar eventos já importados.
- Eventos prioritários geram notificação local/fallback conforme as regras já existentes.

## Normalização de Webhooks

A documentação local da GameMarket não contém payload formal de webhook. A UI mostra eventos selecionáveis, então a estratégia é progressiva:

1. Receber e persistir qualquer JSON aceito.
2. Mapear apenas quando campos claros indicarem evento (`event`, `type`, `event_type`, `action`, `category`, `resource`, `status`, `data`, `payload`).
3. Salvar `gamemarket.unknown` quando a estrutura for inesperada.
4. Analisar payloads reais depois sem expor token, cookie, senha, login ou email.
5. Ajustar o normalizador sem automatizar entrega.

Nenhum endpoint novo da GameMarket foi inventado na Fase 5.

## Estratégia Futura para WhatsApp

WhatsApp deve entrar somente após:

- fluxo de pedidos e eventos local estar estável;
- política de envio/manual review estar definida;
- templates e consentimento do cliente estarem claros;
- backend externo existir para filas, retries e auditoria.

Na Fase 3, notificações são apenas desktop local/fallback visual.

## Riscos e Mitigações

- Documentação GameMarket incompleta: chamadas reais ficam limitadas aos endpoints presentes em `docs/gamemarket-api/`.
- Dados sensíveis: não logar, não exportar e não renderizar por padrão.
- SQLite nativo no Electron: manter acesso isolado no main process e usar `electron-rebuild` quando necessário.
- Evolução de schema: usar migrations incrementais registradas em `schema_migrations`.
- Automação futura de estoque: manter status e datas manuais agora para não assumir regras de negócio sem validação.
