# Catálogo Operacional de Variações

Este catálogo documenta as variações criadas pelo seed seguro de variações de produto.

Comando:

```bash
npm run seed:product-variants --workspace @hzdk/gamemarket-desktop
```

O seed procura produtos já importados da GameMarket pelo nome aproximado, cria variações idempotentes por `variantCode` e não sobrescreve custo, estoque, fornecedor, entrega ou notas já editadas localmente.

Nenhum dado sensível real é criado. O seed não cria contas, logins, senhas, automação de entrega, compra com fornecedor ou escrita na GameMarket.

## Totais

- Total previsto: 35 variações.
- Fonte: `seeded_from_conversation`.
- Taxa padrão usada nos cálculos: 13%.
- Fórmula de líquido: `salePrice * 0.87`.
- Fórmula de lucro: `netValue - unitCost`.
- Fórmula de margem: `estimatedProfit / salePrice`.
- Preço mínimo para não perder: `unitCost / 0.87`.

## Variações Criadas

| Produto aproximado | Código | Variação | Venda | Custo | Entrega | Revisão |
| --- | --- | --- | ---: | ---: | --- | --- |
| CELEMONY MELODYNE 5 ESSENTIAL VITALÍCIO (ORIGINAL) | `MEL-ESSENTIAL-001` | Melodyne 5 Essential Vitalício \| Licença Original | R$ 100,00 | R$ 0,00 | manual | sim |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-BASE-20-29` | [BR] Level 20-29 \| 10-30 Campeões \| Full Acesso | R$ 15,00 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-GRAVES-VERAO` | [BR] LVL 20 \| 20 Camp \| Graves Curtindo Verão \| Full Acesso | R$ 25,00 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-LEBLANC-SABUGUEIRO` | [BR] LVL 21 \| 21 Camp \| LeBlanc Sabugueiro \| Full Acesso | R$ 25,00 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-MF-WATERLOO` | [BR] LVL 20 \| 21 Camp \| Miss Fortune Waterloo \| Full Acesso | R$ 25,00 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-LUCIAN-PALADINO` | [BR] LVL 24 \| 21 Camp \| Lucian Paladino de Ataque \| Full Acesso | R$ 25,00 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-ASHE-SHERWOOD` | [BR] LVL 21 \| 22 Camp \| Ashe Floresta Sherwood \| Full Acesso | R$ 25,00 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-SSW-TALON` | [BR] LVL 22 \| 27 Camp \| SSW Talon \| Full Acesso | R$ 25,00 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-JINX-ZOMBIE` | [BR] LVL 22 \| 26 Camp \| Jinx Zombie \| Full Acesso | R$ 25,00 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-GRAVES-PORCELANA` | [BR] LVL 16 \| 26 Camp \| Graves Porcelana \| Full Acesso | R$ 25,00 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-GALIO-DRAGOES` | [BR] LVL 17 \| 19 Camp \| Galio Guardião dos Dragões \| Full Acesso | R$ 25,00 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-3SKINS` | [BR] LVL 16 \| 16 Camp \| 3 Skins \| Full Acesso | R$ 29,90 | R$ 7,50 | manual | não |
| CONTA SMURF LOL LEVEL 15-30 \| FULL ACESSO \| SERVIDOR BR | `LOL-BR-ARCANE-4SKINS` | [BR] LVL 21 \| 4 Camp \| 4 Skins Arcane \| Full Acesso | R$ 29,90 | R$ 7,50 | manual | não |
| CONTAS WILD RIFT BR \| 31K CISCOS \| RANKED DISPONÍVEL \| FULL ACESSO | `WR-BR-PREMIUM-LV8` | [BR] Conta Premium LVL 8+ \| Ranked disponível \| 31K ciscos azuis | R$ 24,90 | R$ 9,00 | manual | não |
| CONTAS MOBILE LEGENDS \| SMURF MOONTON \| BP + WR 100% \| ENTREGA RÁPIDA | `MLBB-32K-WR100` | [Moonton] MLBB Smurf \| 32K BP \| WR 100% \| LVL 7+ \| Rank Warrior | R$ 24,90 | R$ 7,00 | manual | não |
| CONTAS MOBILE LEGENDS \| SMURF MOONTON \| BP + WR 100% \| ENTREGA RÁPIDA | `MLBB-76K-PREMIUM` | [Moonton] MLBB Premium \| 76K BP \| WR 100% \| LVL 8+ \| Rank Disponível | R$ 34,90 | R$ 15,00 | manual | não |
| CONTAS CLASH OF CLANS \| CV11 AO CV18 \| FULL ACESSO \| ENTREGA RÁPIDA | `COC-CV11-3BUILDERS` | [GLOBAL] Clash of Clans CV11 \| 3 Construtores \| Não Vinculada | R$ 14,90 | R$ 2,33 | manual | não |
| CONTAS CLASH OF CLANS \| CV11 AO CV18 \| FULL ACESSO \| ENTREGA RÁPIDA | `COC-CV12-3BUILDERS` | [GLOBAL] Clash of Clans CV12 \| 3 Construtores \| Não Vinculada | R$ 19,90 | R$ 3,00 | manual | não |
| CONTAS CLASH OF CLANS \| CV11 AO CV18 \| FULL ACESSO \| ENTREGA RÁPIDA | `COC-CV13-4BUILDERS` | [GLOBAL] Clash of Clans CV13 \| 4 Construtores \| Não Vinculada | R$ 29,90 | R$ 4,00 | manual | não |
| CONTAS CLASH OF CLANS \| CV11 AO CV18 \| FULL ACESSO \| ENTREGA RÁPIDA | `COC-CV14-5BUILDERS` | [GLOBAL] Clash of Clans CV14 \| 5 Construtores \| Não Vinculada | R$ 39,90 | R$ 4,50 | manual | não |
| CONTAS CLASH OF CLANS \| CV11 AO CV18 \| FULL ACESSO \| ENTREGA RÁPIDA | `COC-CV15-SUPER-TROOPS` | [GLOBAL] Clash of Clans CV15 \| 5 Construtores \| Super Tropas | R$ 59,90 | R$ 6,00 | manual | não |
| CONTAS CLASH OF CLANS \| CV11 AO CV18 \| FULL ACESSO \| ENTREGA RÁPIDA | `COC-CV18-3000-GEMS` | [GLOBAL] Clash of Clans CV18 \| 5 Construtores \| 3000+ Gemas | R$ 149,90 | R$ 42,00 | manual | não |
| CONTAS CS2 COM PRIME \| COM OU SEM PREMIER \| FULL ACESSO | `CS2-PRIME-NO-PREMIER` | CS2 Prime \| Sem Premier Ativo \| Full Acesso | R$ 109,90 | R$ 77,00 | on_demand | não |
| CONTAS CS2 COM PRIME \| COM OU SEM PREMIER \| FULL ACESSO | `CS2-PRIME-PREMIER` | CS2 Prime \| Premier Ativo \| Full Acesso | R$ 129,90 | R$ 87,26 | on_demand | sim |
| CONTAS DEAD BY DAYLIGHT \| STEAM / EPIC \| FULL ACESSO \| ENTREGA RÁPIDA | `DBD-STEAM-0H` | Dead by Daylight \| Steam \| 0 horas \| Full Email Access | R$ 49,90 | R$ 25,00 | on_demand | não |
| CONTAS DEAD BY DAYLIGHT \| STEAM / EPIC \| FULL ACESSO \| ENTREGA RÁPIDA | `DBD-EPIC-20GAMES` | Dead by Daylight \| Epic Games \| +20 jogos \| Full Access | R$ 59,90 | R$ 32,00 | on_demand | sim |
| CONTAS DEAD BY DAYLIGHT \| STEAM / EPIC \| FULL ACESSO \| ENTREGA RÁPIDA | `DBD-EPIC-ARK` | Dead by Daylight \| Epic Games \| +ARK + bônus \| Full Access | R$ 69,90 | R$ 37,00 | on_demand | sim |
| CONTAS DEAD BY DAYLIGHT \| STEAM / EPIC \| FULL ACESSO \| ENTREGA RÁPIDA | `DBD-EPIC-ALL-DLC` | Dead by Daylight \| Epic Games \| All DLC/Characters \| Merge | R$ 79,90 | R$ 39,00 | on_demand | sim |
| CONTAS GENSHIN IMPACT \| REROLL AR55+ \| GEMAS E DESEJOS \| AMÉRICA | `GENSHIN-REROLL-AR55-AMERICA` | Genshin Impact \| Reroll AR55+ \| América | R$ 149,90 | R$ 0,00 | on_demand | sim |
| TFT ELOJOB \| FERRO AO ESMERALDA \| PLANOS POR ELO \| ORÇAMENTO NO CHAT | `TFT-FERRO-BRONZE` | [ELOJOB TFT] Ferro → Bronze | R$ 9,90 | R$ 0,00 | service | não |
| TFT ELOJOB \| FERRO AO ESMERALDA \| PLANOS POR ELO \| ORÇAMENTO NO CHAT | `TFT-BRONZE-PRATA` | [ELOJOB TFT] Bronze → Prata | R$ 12,90 | R$ 0,00 | service | não |
| TFT ELOJOB \| FERRO AO ESMERALDA \| PLANOS POR ELO \| ORÇAMENTO NO CHAT | `TFT-PRATA-OURO` | [ELOJOB TFT] Prata → Ouro | R$ 17,90 | R$ 0,00 | service | não |
| TFT ELOJOB \| FERRO AO ESMERALDA \| PLANOS POR ELO \| ORÇAMENTO NO CHAT | `TFT-OURO-PLATINA` | [ELOJOB TFT] Ouro → Platina | R$ 24,90 | R$ 0,00 | service | não |
| TFT ELOJOB \| FERRO AO ESMERALDA \| PLANOS POR ELO \| ORÇAMENTO NO CHAT | `TFT-PLATINA-ESMERALDA` | [ELOJOB TFT] Platina → Esmeralda | R$ 59,90 | R$ 0,00 | service | não |
| Criação de site profissional para streamer, servidor, guild, loja gamer ou criador digital | `SITE-PROFISSIONAL-BASE` | Criação de site profissional \| Base | R$ 99,90 | R$ 0,00 | service | não |

## Valores Que Precisam Revisão

Variações marcadas com `needsReview = true`:

- `MEL-ESSENTIAL-001`: custo real da licença deve ser preenchido manualmente.
- `CS2-PRIME-PREMIER`: preço de venda sugerido.
- `DBD-EPIC-20GAMES`: preço de venda sugerido.
- `DBD-EPIC-ARK`: preço de venda sugerido.
- `DBD-EPIC-ALL-DLC`: preço de venda sugerido e atenção especial por uso para merge.
- `GENSHIN-REROLL-AR55-AMERICA`: custo do fornecedor precisa ser preenchido manualmente.

Produtos com custo pendente em variação não-service:

- Melodyne 5 Essential Vitalício.
- Genshin Impact Reroll AR55+ América.

Variações `service` com custo zero por desenho operacional:

- `TFT-FERRO-BRONZE`
- `TFT-BRONZE-PRATA`
- `TFT-PRATA-OURO`
- `TFT-OURO-PLATINA`
- `TFT-PLATINA-ESMERALDA`
- `SITE-PROFISSIONAL-BASE`

## Observações de Estoque

- Onde o catálogo diz "preservar se já existir", o seed só define `stockCurrent` no insert. Se a variação já existe, o seed pula e mantém o valor local.
- Variações `manual` entram em sem estoque quando `stockCurrent <= 0`.
- Variações `on_demand` não entram em sem estoque.
- Variações `service` não entram em sem estoque e podem usar `99999` como estoque operacional ilimitado.

