# GameMarket API Integration

Base oficial da Fase 4.

- Autenticacao documentada: header `x-api-key`.
- Base URL padrao documentada: `https://gamemarket.com.br`.
- Teste de conexao implementado: `GET /api/v1/games`.
- Sync manual implementado: `GET /api/v1/products` e `GET /api/v1/orders`.
- Escrita, exclusao, entrega automatica e webhooks publicos nao estao implementados nesta fase.

Toda chamada HTTP deve passar por `gamemarket-client.ts`. O renderer fala apenas via IPC `gamemarket:*`.
Tokens nunca sao retornados ao renderer, exceto pela acao explicita `gamemarket:revealToken` restrita a admin.
