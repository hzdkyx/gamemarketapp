# HzdKyx GameMarket Manager

Aplicativo desktop para Windows, em Electron + React + TypeScript, para organizar produtos, estoque, pedidos, eventos e indicadores financeiros da operação GameMarket.

## Status

Fase 5 implementada com backend público para captura segura de webhooks GameMarket e sync para o desktop.

- CRUD local de produtos usando SQLite.
- CRUD local de itens de estoque vinculados a produtos.
- CRUD local de pedidos manuais vinculados a produtos e, quando aplicável, a itens de estoque.
- Eventos internos persistidos para auditoria local e timeline por pedido.
- Dashboard com dados reais de produtos, estoque, pedidos e eventos.
- Notificações desktop locais para eventos operacionais importantes, com fallback visual no app.
- Login local obrigatório após a criação do primeiro admin.
- Tela de configuração inicial quando ainda não existe admin.
- Gestão de usuários em **Configurações → Usuários e Acesso**.
- Papéis `admin`, `operator` e `viewer`, com permissões locais.
- Hash de senha com `bcryptjs`; senha nunca é salva em texto puro.
- Bloqueio local temporário após tentativas inválidas de login.
- Auditoria com usuário ator em eventos internos quando disponível.
- Build Windows com `electron-builder`, NSIS e portable `.exe`.
- Validação de payloads com Zod antes de acessar o banco.
- IPC seguro e explícito entre renderer e main process.
- Cálculo automático da taxa GameMarket, valor líquido, lucro e margem.
- Variações operacionais por anúncio, com custo, preço, estoque, fornecedor, entrega e revisão próprios.
- Exportação CSV de produtos, estoque, pedidos e eventos.
- Proteção de dados sensíveis de estoque no main process.
- Configurações → GameMarket API para base URL, token, ambiente, status e sync manual.
- Token GameMarket criptografado com a mesma camada de segredos local.
- Client HTTP isolado no main process, com timeout, Zod e erros seguros.
- Teste de conexão por endpoint documentado de leitura.
- Sync manual de produtos e pedidos por endpoints documentados, sem escrita na API.
- Backend `apps/webhook-server` em Node.js + TypeScript + Fastify.
- Recepção de `POST /webhooks/gamemarket/:secret` com segredo forte na URL.
- Persistência de eventos do webhook-server em PostgreSQL na produção e arquivo local apenas em desenvolvimento.
- Normalização defensiva de eventos GameMarket sem assumir payload não documentado.
- Payload bruto mascarado, headers filtrados, hash SHA-256 e ack/read status.
- Configurações → Webhook Server / Tempo Real no app desktop.
- App Sync Token protegido localmente e mascarado por padrão.
- Sync backend → desktop por `GET /api/events`, importando eventos locais e notificações.
- Railway documentado em `docs/railway-webhook-deploy.md`.

A integração não faz scraping, não cria endpoint inventado da GameMarket, não automatiza entrega e não usa a chave para escrita.

## Como Rodar

```bash
npm install
npm run dev
```

`npm run dev` e `start-app.bat` são apenas modo desenvolvimento/debug. Eles abrem terminal porque carregam Vite/Electron em modo de desenvolvimento.

## Como abrir o app sem CMD

Para uso diário no Windows, não abra o app com `npm run dev` nem com `start-app.bat`.

1. Gere o build de produção:

```bash
npm run dist
```

2. Use um dos arquivos gerados em `apps/desktop/release/`:

- `HzdKyx GameMarket Manager Setup 0.1.0.exe`: instalador NSIS recomendado para uso normal.
- `HzdKyx GameMarket Manager Portable 0.1.0.exe`: versão portable, sem instalação.

Depois de instalar pelo Setup, abra o app pelo atalho **HzdKyx GameMarket Manager** no menu iniciar ou na área de trabalho. Esses atalhos apontam para o `.exe` do Electron e não dependem de CMD.

O Portable pode demorar mais para inicializar dependendo do Windows, SmartScreen, antivírus e extração interna do executável. O Setup instalado tende a abrir mais rápido porque já fica extraído no disco. O app funciona nos dois formatos e exibe uma splash nativa imediatamente enquanto banco local, migrações e interface são preparados.

Para usar em outro PC, envie o instalador `HzdKyx GameMarket Manager Setup 0.1.0.exe`. O `start-app.bat` continua existindo apenas como atalho local de desenvolvimento.

Se o SQLite nativo falhar após troca de versão do Electron ou Node:

```bash
npm run rebuild:native --workspace @hzdk/gamemarket-desktop
```

## Validação

```bash
npm run lint
npm run test
npm run build
npm run dist
```

## Webhook Server Local

O backend público da Fase 5 fica em `apps/webhook-server`.

1. Copie `apps/webhook-server/.env.example` para `apps/webhook-server/.env`.
2. Defina valores longos para `WEBHOOK_INGEST_SECRET` e `APP_SYNC_TOKEN`.
3. Rode:

```bash
npm run dev --workspace @hzdk/webhook-server
```

Healthcheck:

```bash
curl http://localhost:3001/health
```

Webhook fake:

```bash
curl -X POST "http://localhost:3001/webhooks/gamemarket/SEU_WEBHOOK_INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d "{\"event\":\"Venda Confirmada\",\"event_id\":\"teste-1\",\"order_id\":\"pedido-externo-1\"}"
```

Listar eventos pelo token do app:

```bash
curl "http://localhost:3001/api/events?unreadOnly=true&limit=20" \
  -H "Authorization: Bearer SEU_APP_SYNC_TOKEN"
```

Em produção, `NODE_ENV=production` exige `DATABASE_URL`, `WEBHOOK_INGEST_SECRET` e `APP_SYNC_TOKEN` fortes. Sem `DATABASE_URL`, o servidor falha de propósito para evitar storage em filesystem efêmero da Railway.

## Primeiro Acesso e Login

Fluxo local:

1. Abra o app pelo atalho instalado, pelo portable `.exe` ou, em desenvolvimento, com `npm run dev`.
2. Se não existir admin, a tela **Configuração inicial** será exibida.
3. Crie o admin informando nome, usuário, senha e confirmação.
4. Depois da criação, o app volta para a tela de login.
5. Entre com o usuário e senha criados.
6. Use **Sair** no topo do app para encerrar a sessão local.

Senhas são validadas com Zod e armazenadas somente como hash `bcryptjs`. O app não loga senha e não retorna hash ao renderer.

## Usuários e Permissões

Admins acessam **Configurações → Usuários e Acesso** para:

- listar usuários;
- criar operadores e visualizadores;
- editar nome, login, papel, status e permissão de revelar segredos;
- resetar senha;
- forçar troca de senha no próximo login;
- desativar usuários.

Regras principais:

- `admin`: acesso total, gestão de usuários/configurações, exportação CSV e revelação de segredos.
- `operator`: edita produtos, estoque, pedidos e eventos; só revela segredos quando `allowRevealSecrets` está habilitado.
- `viewer`: visualiza dashboard, produtos, pedidos e eventos; não edita, não exporta CSV e nunca revela segredos.

O app impede desativar ou rebaixar o último admin ativo.

## Build .exe para Windows

Para gerar instalador e executável portable:

```bash
npm run dist
```

O script da raiz chama o workspace desktop, limpa `apps/desktop/release/`, executa build e depois `electron-builder --win`.

Saída esperada:

- `apps/desktop/release/HzdKyx GameMarket Manager Setup 0.1.0.exe`: instalador NSIS.
- `apps/desktop/release/HzdKyx GameMarket Manager Portable 0.1.0.exe`: executável portable.
- `apps/desktop/release/win-unpacked/HzdKyx GameMarket Manager.exe`: app empacotado usado pelo build.

O instalador cria atalho no menu iniciar e na área de trabalho com o nome **HzdKyx GameMarket Manager**. O AppUserModelID usado pelo app e pelo build é `com.hzdk.gamemarket.manager`, mantendo notificações e identidade do Windows estáveis.

Diferenças:

- `npm run dev`: abre Electron em modo desenvolvimento e pode mostrar terminal, logs e menu nativo.
- `start-app.bat`: atalho local para desenvolvimento, equivalente a `npm run dev`.
- `npm run start:production`: abre `release/win-unpacked/HzdKyx GameMarket Manager.exe` para teste local do build empacotado.
- `npm run dist`: gera artefatos Windows para uso normal.
- Setup ou Portable `.exe`: caminho correto para uso final sem CMD.

## Sincronização cloud automática

Quando o modo cloud tem sessão e workspace ativos, o app agenda sync inicial em background depois que a janela principal aparece. O intervalo padrão é 30 segundos, com mínimo seguro de 10 segundos. A tela **Conta e Sincronização** permite 10s, 30s, 1min, 5min ou valor customizado validado.

O cloud sync é separado do polling da GameMarket API. Alterações locais em produtos, variações, estoque operacional e pedidos ficam pendentes e disparam uma tentativa automática em poucos segundos. Se o backend falhar, o app aplica backoff de 10s, 30s, 60s e 120s sem travar a UI.

## Produtos

Na tela **Produtos**:

1. Clique em **Novo produto**.
2. Preencha nome, categoria/jogo, preço de venda, custo unitário, estoque e status.
3. A taxa padrão fica em 13%, mas pode ser ajustada por produto.
4. O app calcula automaticamente valor líquido, lucro estimado, margem e preço mínimo.
5. Use busca, filtros e ordenação para localizar produtos.
6. Use as ações da linha para editar, duplicar, arquivar, excluir ou abrir o link do anúncio.
7. Use **Variações** para gerenciar opções operacionais do anúncio.
8. Clique em **Exportar CSV** para exportar a visão filtrada.

Quando `stockCurrent <= 0`, o formulário sugere o status `out_of_stock`, mas não altera automaticamente sem ação do usuário.

### Produto x Variação

Produto continua sendo o anúncio importado ou cadastrado no catálogo. Variação representa a opção realmente vendida dentro desse anúncio, como CV11/CV12 no Clash of Clans, pacote 32K/76K BP no Mobile Legends, serviço TFT por elo ou conta LoL específica.

Cada variação tem preço de venda, custo unitário, valor líquido, lucro, margem, estoque, fornecedor, tipo de entrega, status, notas e flag de revisão. Quando o produto tem variações, o Dashboard e os pedidos preferem os dados das variações. Quando não tem, usam o produto pai.

Regras operacionais:

- `manual` e `automatic`: exigem estoque real; `stockCurrent <= 0` entra como sem estoque.
- `on_demand`: não entra como sem estoque e aparece como sob demanda.
- `service`: não entra como sem estoque; pode usar `stockCurrent = 99999` ou ser tratado como ilimitado na UI.
- `unitCost = 0` em produto físico deixa o lucro inflado e deve ser tratado como custo pendente.

Seed operacional seguro:

```bash
npm run seed:product-variants --workspace @hzdk/gamemarket-desktop
```

O seed cria apenas variações operacionais, não cria contas reais, senhas, logins ou automação de entrega. Ele é idempotente, não duplica códigos existentes e não sobrescreve custo ou dados locais editados manualmente.

## Estoque

Na tela **Estoque**:

1. Clique em **Novo item**.
2. Vincule o item a um produto existente.
3. Se o produto tiver variações, escolha a variação correspondente. Produtos sem variações continuam aceitando estoque direto no produto.
4. Informe fornecedor, custo de compra, status e datas operacionais.
5. Cadastre login, senha, email, senha do email e notas protegidas somente quando necessário.
6. Use as ações da linha para editar, marcar como vendido, entregue, problema, arquivar ou excluir.
7. Use **Revelar** para abrir o painel de dados sensíveis com confirmação.
8. Copie segredos apenas depois de revelá-los explicitamente.
9. Clique em **Exportar CSV** para exportar a visão filtrada sem expor segredos em texto aberto.

## Pedidos

Na tela **Pedidos**:

1. Clique em **Novo pedido**.
2. Selecione um produto cadastrado. O app busca preço, custo e taxa atuais para criar snapshots no pedido.
3. Selecione uma variação quando a venda corresponder a uma opção interna do anúncio. O app recalcula preço, custo, líquido, lucro e margem com base nela.
4. Opcionalmente vincule um item de estoque disponível ou reservado compatível com o produto e com a variação escolhida.
5. Informe comprador, contato, ID externo, link GameMarket e observações internas quando existirem.
6. Escolha status inicial entre `draft`, `payment_confirmed` e `awaiting_delivery`.
7. Use o painel lateral para marcar como entregue, concluído, mediação, problema ou cancelado.
8. Alterações de status criam eventos internos e atualizam o estoque vinculado de forma controlada.
9. Clique em **Exportar CSV** para exportar pedidos sem dados sensíveis de estoque.

Regras principais:

- `payment_confirmed` cria `order.payment_confirmed`, marca ação pendente e reserva item disponível.
- `awaiting_delivery` cria `order.awaiting_delivery` e mantém ação pendente.
- `delivered` cria `order.delivered`, limpa ação pendente e marca estoque como entregue.
- `completed` cria `order.completed`, limpa ação pendente e garante estoque entregue ou vendido.
- `cancelled` cria `order.cancelled`, limpa ação pendente e libera estoque reservado não entregue.
- `refunded` cria `order.refunded`; por decisão da Fase 3, mantém ação pendente para revisão manual.
- `mediation` e `problem` criam eventos destacados e exigem atenção operacional.
- Se `productVariantId` estiver preenchido, o custo usado no pedido vem da variação.
- Se não houver variação, o custo vem do produto pai.
- Se não houver custo nem na variação nem no produto, a UI mostra custo pendente.
- Pedidos importados da GameMarket para produtos com variações, mas sem variação detectada, aparecem com **Variação pendente**.

## Eventos

Na tela **Eventos**:

1. Consulte eventos internos persistidos no SQLite.
2. Filtre por tipo, severidade, leitura e data.
3. Marque um evento como lido ou marque todos como lidos.
4. Abra o detalhe para ver mensagem, vínculos com pedido/produto/estoque e payload bruto opcional.
5. Exporte CSV sem segredos.

Os tipos `order.*`, `inventory.*`, `product.*` e `system.notification_test` são eventos internos do app. Eles não são nomes oficiais da GameMarket.

## Dashboard

O Dashboard usa dados reais locais:

- vendas hoje e no mês;
- faturamento bruto, valor líquido e lucro estimado no mês;
- pedidos com ação pendente;
- pedidos em mediação/problema;
- produtos com estoque baixo e sem estoque;
- últimos eventos;
- vendas por dia, lucro por categoria/jogo e distribuição de status.

Quando não há dados, a UI mostra empty states em vez de quebrar gráficos ou listas.

Para produtos com variações, as métricas de estoque e lucro preferem as variações. Produtos/variações `service` e `on_demand` não entram em **sem estoque** ou **estoque baixo**. Apenas `manual` e `automatic` contam como estoque real.

## GameMarket API

A documentação oficial usada pela integração deve ficar em `docs/gamemarket-api/`. Nesta fase foi lido `docs/gamemarket-api/README.md`, com autenticação por header `x-api-key`, base URL `https://gamemarket.com.br`, endpoints read de produtos, pedidos, saldo, estatísticas e jogos, e rate limits.

Como configurar:

1. Salve a documentação real em `docs/gamemarket-api/`.
2. Abra **Configurações → GameMarket API** com usuário admin.
3. Confira ou altere a **API Base URL**.
4. Cole a **API Key / Token** de leitura.
5. Escolha o ambiente: `production`, `sandbox` ou `custom`.
6. Clique em **Salvar configuração**.
7. Use **Testar conexão** para validar `GET /api/v1/games`.
8. Use **Sincronizar agora** para buscar `GET /api/v1/products` e `GET /api/v1/orders`.

Cuidados:

- Nunca commite `.env.local`.
- Nunca coloque a chave no código.
- O token fica mascarado na UI por padrão.
- O token só retorna ao renderer em **Revelar token**, com confirmação e apenas para admin.
- Eventos e logs não recebem o token puro.
- A chave criada para esta fase deve ter somente permissão de leitura.

Limitações da Fase 4:

- Não cria, edita ou exclui produtos via API.
- Não implementa automação de entrega.
- Não implementa WhatsApp, Telegram, Discord ou entrega automática.
- Pedidos importados mantêm o status externo em metadados; não há mapeamento automático de status operacional sem tabela oficial.

## Webhook Server / Tempo Real

A Fase 5 adiciona uma ponte segura para eventos que a GameMarket mostra na UI de webhooks, mesmo sem payload formal documentado localmente.

Fluxo:

1. GameMarket envia evento para `https://URL-RAILWAY/webhooks/gamemarket/WEBHOOK_INGEST_SECRET`.
2. O backend valida o segredo, mascara payload/headers, calcula hash e salva o evento.
3. O desktop busca eventos com `Authorization: Bearer APP_SYNC_TOKEN`.
4. Eventos são importados para a tela **Eventos**.
5. Eventos prioritários disparam notificação desktop/fallback visual conforme configuração local.
6. O desktop marca o evento remoto como `ack` após importar ou detectar duplicidade.

Como configurar no desktop:

1. Abra **Configurações → Webhook Server / Tempo Real** com usuário admin.
2. Preencha **Backend URL** com a URL local ou Railway.
3. Cole o **App Sync Token**.
4. Salve.
5. Use **Testar backend** para validar `/health`.
6. Use **Enviar evento de teste** para criar um evento remoto.
7. Use **Buscar eventos agora** para importar eventos para o SQLite local.
8. Ative polling somente depois de validar manualmente.

Eventos priorizados para o painel GameMarket:

- Venda Confirmada
- Mediação Aberta
- Reembolso Iniciado
- Avaliação Recebida
- Sem Estoque
- Variante Esgotada

Depois de estabilizar o volume, adicionar:

- Pedido Criado
- Pedido Entregue
- Pedido Concluído
- Pedido Cancelado
- Fundos Liberados

Limitações da Fase 5:

- O payload oficial de webhook ainda não está documentado localmente.
- O normalizador só mapeia campos claros (`event`, `type`, `event_type`, `action`, `category`, `resource`, `status`, `data`, `payload`).
- Payload desconhecido vira `gamemarket.unknown` sem quebrar.
- Não há WhatsApp, Telegram, Discord, scraping ou entrega automática.

## Notificações Locais

Em **Configurações → Notificações**:

1. Ative/desative notificações desktop.
2. Ative/desative som.
3. Escolha quais tipos de evento geram notificação.
4. Use **Enviar teste** para criar `system.notification_test`.

Se a API de notificação do Electron não estiver disponível, o app envia um fallback visual no canto inferior direito. Não há WhatsApp, Telegram ou backend externo nesta fase.

## Fórmulas Financeiras

A taxa padrão da GameMarket é 13%.

- `valorLiquido = precoVenda * 0.87`
- `lucro = valorLiquido - custoUnitario`
- `margemSobreVenda = lucro / precoVenda`
- `precoMinimo = custoUnitario / 0.87`
- `precoIdeal = (custoUnitario + lucroDesejado) / 0.87`

As fórmulas ficam centralizadas em `packages/shared/src/financial.ts` e são reutilizadas no main process e na interface.

As mesmas fórmulas são aplicadas em variações. Para cada variação:

- `valorLiquido = precoVenda * 0.87`
- `lucro = valorLiquido - custoUnitario`
- `margemSobreVenda = lucro / precoVenda`
- `precoMinimoParaNaoPerder = custoUnitario / 0.87`

## Segurança dos Dados Sensíveis

Dados sensíveis de estoque não são exibidos por padrão:

- login da conta
- senha da conta
- email da conta
- senha do email
- notas de acesso

O renderer envia esses dados apenas no cadastro/edição ou quando o usuário confirma a revelação. A criptografia e descriptografia ficam centralizadas no main process em `apps/desktop/src/main/security/`.

Na Fase 3.5, revelar segredo também exige permissão:

- admin sempre pode revelar;
- operator só pode revelar se `allowRevealSecrets` estiver ativo;
- viewer nunca pode revelar.

Cada revelação cria evento interno `security.secret_revealed`. O payload registra usuário, campo, item de estoque e data/hora, mas nunca contém o segredo.

Estratégia atual:

- Usa `safeStorage` do Electron quando disponível.
- Se `safeStorage` não estiver disponível, usa fallback AES-256-GCM com chave aleatória local em `userData`.
- O fallback não usa segredo hardcoded, mas é menos forte que o cofre do sistema operacional.
- CSV de estoque exporta apenas flags como “tem senha”, nunca o segredo em texto aberto.

## Git/GitHub

O repositório Git deve ficar na raiz real do projeto: `E:\PROJETOS!`.

Remote configurado:

```bash
origin https://github.com/hzdkyx/gamemarketapp.git
```

Não faça commit de:

- `.env` ou `.env.*`;
- tokens, chaves da GameMarket e credenciais;
- banco SQLite real;
- logs;
- `node_modules`;
- `dist`, `out`, `release`;
- chaves locais como `hzdk-local-secret-fallback.key`.

## Arquitetura

- `apps/desktop`: app Electron + React + Vite.
- `apps/desktop/src/main/repositories`: SQL e leitura/escrita SQLite.
- `apps/desktop/src/main/services`: regras de negócio, cálculo financeiro, auditoria e criptografia.
- `apps/desktop/src/main/ipc`: canais IPC validados por Zod.
- `apps/desktop/src/shared`: contratos Zod e utilitários compartilhados do app desktop.
- `packages/shared`: fórmulas financeiras e formatação reutilizável.
- `apps/webhook-server`: backend público Fastify para webhooks GameMarket e sync protegido para o desktop.
- `docs/gamemarket-api`: local para documentação oficial da GameMarket.

## Limitações Atuais

- A API GameMarket está limitada a leitura documentada e sync manual.
- Webhooks dependem de cadastrar manualmente a URL pública no painel da GameMarket.
- Não há WhatsApp, Telegram, Discord ou entrega automática.
- Não há integração com fornecedor nem automação de entrega.
- Pedidos locais continuam operacionais/manual review; eventos são internos do app.
- Não há automação de entrega real nem scraping.
- O fallback de criptografia existe para ambientes sem `safeStorage`, mas deve ser tratado como proteção local básica.

## Próximas Fases

1. Fase 6: notificações avançadas e canais externos como WhatsApp/Telegram.
3. Fase 7: automação de entrega somente após contratos oficiais e revisão de segurança.
4. Fase 8: build final `.exe` e rotina de atualização.
