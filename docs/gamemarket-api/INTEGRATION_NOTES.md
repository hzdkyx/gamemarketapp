# GameMarket API Integration Notes

## Arquivos lidos

- `docs/gamemarket-api/README.md`

## Documentacao encontrada

- Base URL documentada: `https://gamemarket.com.br`
- Autenticacao documentada: header `x-api-key`
- Permissoes documentadas: `read`, `write`, `delete`
- Rate limits documentados: `20/min` e `500/dia` por chave, com headers `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset`

## Endpoints read documentados

- `GET /api/v1/products`
- `GET /api/v1/products/:id`
- `GET /api/v1/orders`
- `GET /api/v1/orders/:id`
- `GET /api/v1/balance`
- `GET /api/v1/stats`
- `GET /api/v1/games`

## Endpoints write documentados, nao implementados nesta fase

- `POST /api/v1/products`
- `PATCH /api/v1/products/:id`
- Endpoints de gestao de chaves `/api/api-keys`, porque a propria documentacao diz que requerem sessao no site.

## Endpoints implementados

- Teste de conexao: `GET /api/v1/games`
- Sync manual de produtos: `GET /api/v1/products`
- Sync manual de pedidos: `GET /api/v1/orders`

## Contratos mapeados

- Produtos: `id`, `title`, `description`, `price`, `game`, `category`, `listingType`, `isAutoDelivery`, `status`, `createdAt` e campos booleanos documentados.
- Pedidos: `id`, `productId`, `buyerName`, `sellerName`, `price`, `quantity`, `status`, `createdAt`, `updatedAt`.
- Jogos: `name`, `slug`, `isActive`.

Os schemas Zod aceitam campos extras com `passthrough`, mas validam os campos documentados usados pelo app.

## Regras de sync aplicadas

- Produtos sao vinculados por `externalMarketplace = gamemarket` e `externalProductId`.
- Pedidos sao vinculados por `externalMarketplace = gamemarket` e `externalOrderId`.
- Hash SHA-256 do payload externo controla duplicidade e atualizacao.
- Dados locais existentes nao sao sobrescritos sem criterio: produtos e pedidos existentes recebem apenas metadados externos, status externo, hash e data de sync.
- Pedidos importados ficam como `draft`, sem `actionRequired`, porque a documentacao nao define uma tabela completa de equivalencia operacional de status.

## Webhooks

Nao foi encontrada secao formal de webhooks na documentacao local lida. A UI da GameMarket, porem, mostra criacao de webhook com URL, descricao e selecao de eventos.

Eventos visiveis na UI:

Produtos:

- Produto Criado
- Produto Aprovado
- Produto Rejeitado
- Sem Estoque
- Variante Esgotada

Pedidos:

- Pedido Criado
- Venda Confirmada
- Pedido Entregue
- Pedido Concluido
- Pedido Cancelado

Financeiro:

- Saldo Atualizado
- Fundos Liberados
- Saque Solicitado
- Saque Concluido
- Saque Rejeitado
- Reembolso Iniciado

Mediacao e avaliacoes:

- Mediacao Aberta
- Mediacao Atualizada
- Mediacao Resolvida
- Avaliacao Recebida

Estrategia implementada na Fase 5:

- receber `POST /webhooks/gamemarket/:secret`;
- validar `WEBHOOK_INGEST_SECRET` pela URL cadastrada no painel;
- salvar payload bruto somente mascarado;
- salvar headers filtrados, IP/origem, user-agent, hash SHA-256 e timestamps;
- normalizar apenas quando campos claros indicarem evento;
- salvar como `gamemarket.unknown` se o payload real vier diferente;
- expor sync protegido para o app desktop por `Authorization: Bearer APP_SYNC_TOKEN`;
- nao automatizar entrega.

Eventos prioritarios para cadastrar primeiro:

- Venda Confirmada
- Mediacao Aberta
- Reembolso Iniciado
- Avaliacao Recebida
- Sem Estoque
- Variante Esgotada

Depois de validar volume e ruido:

- Pedido Criado
- Pedido Entregue
- Pedido Concluido
- Pedido Cancelado
- Fundos Liberados

## Duvidas abertas

- Existe endpoint oficial `me`, `account` ou `health` para teste de conexao menos indireto?
- Quais sao todos os status possiveis de pedidos e seus significados operacionais?
- Existe payload oficial de webhook?
- Existe assinatura, segredo, HMAC ou header especifico para webhooks?
- Existe endpoint oficial de paginação por data para pedidos?

## Limitacoes atuais

- A chave atual deve ser de leitura.
- Escrita de produtos, exclusao, automacao de entrega e webhooks ficaram fora do escopo.
- A sync busca no maximo 10 paginas por recurso por execucao manual para reduzir risco de rate limit.
