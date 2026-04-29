# Webhook Server

Pasta reservada para a Fase 5.

O backend público será responsável por:

- receber webhooks da GameMarket;
- validar assinatura/token se a documentação oferecer;
- registrar payload bruto para auditoria;
- normalizar evento;
- salvar evento;
- expor sincronização protegida por token para o app desktop.

Nenhum endpoint final da GameMarket foi implementado nesta fase porque a documentação oficial ainda não está disponível no workspace.
