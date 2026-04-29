# GameMarket Integration Module

O módulo runtime da Fase 4 fica em:

`apps/desktop/src/main/integrations/gamemarket/`

Este diretório foi mantido apenas como marcador compartilhado. O renderer não chama a API diretamente; toda operação passa por IPC seguro `gamemarket:*` e pelo módulo de main process.
