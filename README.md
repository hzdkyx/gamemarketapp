# HzdKyx GameMarket Manager

Aplicativo desktop para Windows, em Electron + React + TypeScript, para organizar produtos, estoque, pedidos, eventos e indicadores financeiros da operação GameMarket.

## Status

Fase 3.5 implementada para segurança local, usuários, auditoria e empacotamento Windows.

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
- Exportação CSV de produtos, estoque, pedidos e eventos.
- Proteção de dados sensíveis de estoque no main process.

A integração real com a GameMarket ainda não foi implementada. A documentação pública em `https://gamemarket.com.br/api-docs` retornou `403 Forbidden` neste ambiente. Antes da fase de integração, salve ou cole a documentação oficial em `docs/gamemarket-api/`.

## Como Rodar

```bash
npm install
npm run dev
```

Também existe `start-app.bat` na raiz. Ele é apenas um atalho de desenvolvimento e executa `npm run dev`.

Se o SQLite nativo falhar após troca de versão do Electron ou Node:

```bash
npm run rebuild:native --workspace @hzdk/gamemarket-desktop
```

## Validação

```bash
npm run lint
npm run test
npm run build
```

## Primeiro Acesso e Login

Fluxo local:

1. Abra o app com `npm run dev`, `start-app.bat` ou pelo `.exe`.
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

O script da raiz chama o workspace desktop, executa build e depois `electron-builder --win`.

Saída esperada:

- `apps/desktop/release/*.exe`
- instalador NSIS;
- portable `.exe`, quando o ambiente permitir.

Diferenças:

- `npm run dev`: abre Electron em modo desenvolvimento.
- `start-app.bat`: atalho local para desenvolvimento, equivalente a `npm run dev`.
- `npm run dist`: gera artefatos Windows para uso normal.

## Produtos

Na tela **Produtos**:

1. Clique em **Novo produto**.
2. Preencha nome, categoria/jogo, preço de venda, custo unitário, estoque e status.
3. A taxa padrão fica em 13%, mas pode ser ajustada por produto.
4. O app calcula automaticamente valor líquido, lucro estimado, margem e preço mínimo.
5. Use busca, filtros e ordenação para localizar produtos.
6. Use as ações da linha para editar, duplicar, arquivar, excluir ou abrir o link do anúncio.
7. Clique em **Exportar CSV** para exportar a visão filtrada.

Quando `stockCurrent <= 0`, o formulário sugere o status `out_of_stock`, mas não altera automaticamente sem ação do usuário.

## Estoque

Na tela **Estoque**:

1. Clique em **Novo item**.
2. Vincule o item a um produto existente.
3. Informe fornecedor, custo de compra, status e datas operacionais.
4. Cadastre login, senha, email, senha do email e notas protegidas somente quando necessário.
5. Use as ações da linha para editar, marcar como vendido, entregue, problema, arquivar ou excluir.
6. Use **Revelar** para abrir o painel de dados sensíveis com confirmação.
7. Copie segredos apenas depois de revelá-los explicitamente.
8. Clique em **Exportar CSV** para exportar a visão filtrada sem expor segredos em texto aberto.

## Pedidos

Na tela **Pedidos**:

1. Clique em **Novo pedido**.
2. Selecione um produto cadastrado. O app busca preço, custo e taxa atuais para criar snapshots no pedido.
3. Opcionalmente vincule um item de estoque disponível ou reservado compatível com o produto.
4. Informe comprador, contato, ID externo, link GameMarket e observações internas quando existirem.
5. Escolha status inicial entre `draft`, `payment_confirmed` e `awaiting_delivery`.
6. Use o painel lateral para marcar como entregue, concluído, mediação, problema ou cancelado.
7. Alterações de status criam eventos internos e atualizam o estoque vinculado de forma controlada.
8. Clique em **Exportar CSV** para exportar pedidos sem dados sensíveis de estoque.

Regras principais:

- `payment_confirmed` cria `order.payment_confirmed`, marca ação pendente e reserva item disponível.
- `awaiting_delivery` cria `order.awaiting_delivery` e mantém ação pendente.
- `delivered` cria `order.delivered`, limpa ação pendente e marca estoque como entregue.
- `completed` cria `order.completed`, limpa ação pendente e garante estoque entregue ou vendido.
- `cancelled` cria `order.cancelled`, limpa ação pendente e libera estoque reservado não entregue.
- `refunded` cria `order.refunded`; por decisão da Fase 3, mantém ação pendente para revisão manual.
- `mediation` e `problem` criam eventos destacados e exigem atenção operacional.

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
- `apps/webhook-server`: reservado para backend público de webhooks em fases futuras.
- `docs/gamemarket-api`: local para documentação oficial da GameMarket.

## Limitações Atuais

- Não há API real da GameMarket.
- Não há webhooks reais.
- Não há WhatsApp, backend online ou sincronização remota.
- Não há integração com fornecedor nem automação de entrega.
- Pedidos são manuais e eventos são internos do app.
- Não há automação de entrega real nem scraping.
- O fallback de criptografia existe para ambientes sem `safeStorage`, mas deve ser tratado como proteção local básica.

## Próximas Fases

1. Fase 4: integração GameMarket somente com documentação oficial disponível.
2. Fase 5: backend público para webhooks.
3. Fase 6: notificações em tempo real e canais externos.
4. Fase 7: build final `.exe` com `electron-builder`.
