import Database from "better-sqlite3";
import { app } from "electron";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const databaseFileName = "hzdk-gamemarket-manager.sqlite";
const feePercent = 13;
const netRate = 0.87;

const normalize = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

const moneyToCents = (value) => Math.round((value + Number.EPSILON) * 100);

const financials = (salePrice, unitCost) => {
  const salePriceCents = moneyToCents(salePrice);
  const unitCostCents = moneyToCents(unitCost);
  const netValueCents = Math.round(salePriceCents * netRate);
  const estimatedProfitCents = netValueCents - unitCostCents;

  return {
    salePriceCents,
    unitCostCents,
    netValueCents,
    estimatedProfitCents,
    marginPercent: salePriceCents === 0 ? 0 : estimatedProfitCents / salePriceCents
  };
};

const createTableSql = `
  CREATE TABLE IF NOT EXISTS product_variants (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    sale_price_cents INTEGER NOT NULL DEFAULT 0,
    unit_cost_cents INTEGER NOT NULL DEFAULT 0,
    fee_percent REAL NOT NULL DEFAULT 13,
    net_value_cents INTEGER NOT NULL DEFAULT 0,
    estimated_profit_cents INTEGER NOT NULL DEFAULT 0,
    margin_percent REAL NOT NULL DEFAULT 0,
    stock_current INTEGER NOT NULL DEFAULT 0,
    stock_min INTEGER NOT NULL DEFAULT 0,
    supplier_name TEXT,
    supplier_url TEXT,
    delivery_type TEXT NOT NULL DEFAULT 'manual' CHECK (delivery_type IN ('manual', 'automatic', 'on_demand', 'service')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'out_of_stock', 'archived')),
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'seeded_from_conversation', 'gamemarket_sync', 'imported')),
    needs_review INTEGER NOT NULL DEFAULT 0,
    manually_edited_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const catalog = [
  {
    key: "melodyne",
    matchers: ["CELEMONY MELODYNE", "MELODYNE 5 ESSENTIAL"],
    variants: [
      {
        variantCode: "MEL-ESSENTIAL-001",
        name: "Melodyne 5 Essential Vitalício | Licença Original",
        salePrice: 100,
        unitCost: 0,
        stockCurrent: 1,
        stockMin: 0,
        supplierName: "Licença própria",
        deliveryType: "manual",
        needsReview: true,
        notes:
          "Custo real da licença deve ser preenchido manualmente se quiser lucro real. Licença não ativada, entrega manual da serial key."
      }
    ]
  },
  {
    key: "lol-smurf",
    matchers: ["CONTA SMURF LOL", "FULL ACESSO SERVIDOR BR", "LEAGUE OF LEGENDS"],
    variants: [
      {
        variantCode: "LOL-BR-BASE-20-29",
        name: "[BR] Level 20-29 | 10-30 Campeões | Full Acesso",
        salePrice: 15,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 1,
        supplierName: "Fornecedor LoL / a definir",
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-GRAVES-VERAO",
        name: "[BR] LVL 20 | 20 Camp | Graves Curtindo Verão | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-LEBLANC-SABUGUEIRO",
        name: "[BR] LVL 21 | 21 Camp | LeBlanc Sabugueiro | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-MF-WATERLOO",
        name: "[BR] LVL 20 | 21 Camp | Miss Fortune Waterloo | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-LUCIAN-PALADINO",
        name: "[BR] LVL 24 | 21 Camp | Lucian Paladino de Ataque | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-ASHE-SHERWOOD",
        name: "[BR] LVL 21 | 22 Camp | Ashe Floresta Sherwood | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-SSW-TALON",
        name: "[BR] LVL 22 | 27 Camp | SSW Talon | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-JINX-ZOMBIE",
        name: "[BR] LVL 22 | 26 Camp | Jinx Zombie | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-GRAVES-PORCELANA",
        name: "[BR] LVL 16 | 26 Camp | Graves Porcelana | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-GALIO-DRAGOES",
        name: "[BR] LVL 17 | 19 Camp | Galio Guardião dos Dragões | Full Acesso",
        salePrice: 25,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-3SKINS",
        name: "[BR] LVL 16 | 16 Camp | 3 Skins | Full Acesso",
        salePrice: 29.9,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "LOL-BR-ARCANE-4SKINS",
        name: "[BR] LVL 21 | 4 Camp | 4 Skins Arcane | Full Acesso",
        salePrice: 29.9,
        unitCost: 7.5,
        stockCurrent: 0,
        stockMin: 0,
        deliveryType: "manual",
        needsReview: false
      }
    ]
  },
  {
    key: "wild-rift",
    matchers: ["WILD RIFT", "31K CISCOS"],
    variants: [
      {
        variantCode: "WR-BR-PREMIUM-LV8",
        name: "[BR] Conta Premium LVL 8+ | Ranked disponível | 31K ciscos azuis",
        salePrice: 24.9,
        unitCost: 9,
        stockCurrent: 0,
        stockMin: 1,
        supplierName: "Fornecedor Wild Rift / a definir",
        deliveryType: "manual",
        needsReview: false
      }
    ]
  },
  {
    key: "mobile-legends",
    matchers: ["MOBILE LEGENDS", "SMURF MOONTON"],
    variants: [
      {
        variantCode: "MLBB-32K-WR100",
        name: "[Moonton] MLBB Smurf | 32K BP | WR 100% | LVL 7+ | Rank Warrior",
        salePrice: 24.9,
        unitCost: 7,
        stockCurrent: 0,
        stockMin: 1,
        supplierName: "Fornecedor Mobile Legends / a definir",
        deliveryType: "manual",
        needsReview: false
      },
      {
        variantCode: "MLBB-76K-PREMIUM",
        name: "[Moonton] MLBB Premium | 76K BP | WR 100% | LVL 8+ | Rank Disponível",
        salePrice: 34.9,
        unitCost: 15,
        stockCurrent: 0,
        stockMin: 1,
        supplierName: "Fornecedor Mobile Legends / a definir",
        deliveryType: "manual",
        needsReview: false
      }
    ]
  },
  {
    key: "clash-of-clans",
    matchers: ["CLASH OF CLANS", "CV11 AO CV18"],
    variants: [
      ["COC-CV11-3BUILDERS", "[GLOBAL] Clash of Clans CV11 | 3 Construtores | Não Vinculada", 14.9, 2.33],
      ["COC-CV12-3BUILDERS", "[GLOBAL] Clash of Clans CV12 | 3 Construtores | Não Vinculada", 19.9, 3],
      ["COC-CV13-4BUILDERS", "[GLOBAL] Clash of Clans CV13 | 4 Construtores | Não Vinculada", 29.9, 4],
      ["COC-CV14-5BUILDERS", "[GLOBAL] Clash of Clans CV14 | 5 Construtores | Não Vinculada", 39.9, 4.5],
      ["COC-CV15-SUPER-TROOPS", "[GLOBAL] Clash of Clans CV15 | 5 Construtores | Super Tropas", 59.9, 6],
      ["COC-CV18-3000-GEMS", "[GLOBAL] Clash of Clans CV18 | 5 Construtores | 3000+ Gemas", 149.9, 42]
    ].map(([variantCode, name, salePrice, unitCost], index) => ({
      variantCode,
      name,
      salePrice,
      unitCost,
      stockCurrent: 0,
      stockMin: 1,
      supplierName: "Fornecedor Clash of Clans / a definir",
      deliveryType: "manual",
      needsReview: false,
      preserveStockOnExisting: index === 0
    }))
  },
  {
    key: "cs2",
    matchers: ["CS2 COM PRIME", "COM OU SEM PREMIER"],
    variants: [
      {
        variantCode: "CS2-PRIME-NO-PREMIER",
        name: "CS2 Prime | Sem Premier Ativo | Full Acesso",
        salePrice: 109.9,
        unitCost: 77,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor CS2 / a definir",
        deliveryType: "on_demand",
        needsReview: false
      },
      {
        variantCode: "CS2-PRIME-PREMIER",
        name: "CS2 Prime | Premier Ativo | Full Acesso",
        salePrice: 129.9,
        unitCost: 87.26,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor CS2 / a definir",
        deliveryType: "on_demand",
        needsReview: true,
        notes: "Preço de venda sugerido. Revisar conforme estratégia atual."
      }
    ]
  },
  {
    key: "dead-by-daylight",
    matchers: ["DEAD BY DAYLIGHT", "STEAM EPIC"],
    variants: [
      {
        variantCode: "DBD-STEAM-0H",
        name: "Dead by Daylight | Steam | 0 horas | Full Email Access",
        salePrice: 49.9,
        unitCost: 25,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor DBD / a definir",
        deliveryType: "on_demand",
        needsReview: false
      },
      {
        variantCode: "DBD-EPIC-20GAMES",
        name: "Dead by Daylight | Epic Games | +20 jogos | Full Access",
        salePrice: 59.9,
        unitCost: 32,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor DBD / a definir",
        deliveryType: "on_demand",
        needsReview: true,
        notes: "Preço de venda sugerido. Revisar."
      },
      {
        variantCode: "DBD-EPIC-ARK",
        name: "Dead by Daylight | Epic Games | +ARK + bônus | Full Access",
        salePrice: 69.9,
        unitCost: 37,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor DBD / a definir",
        deliveryType: "on_demand",
        needsReview: true,
        notes: "Preço de venda sugerido. Revisar."
      },
      {
        variantCode: "DBD-EPIC-ALL-DLC",
        name: "Dead by Daylight | Epic Games | All DLC/Characters | Merge",
        salePrice: 79.9,
        unitCost: 39,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor DBD / a definir",
        deliveryType: "on_demand",
        needsReview: true,
        notes: "Preço de venda sugerido. Produto precisa de atenção especial por uso para merge."
      }
    ]
  },
  {
    key: "genshin",
    matchers: ["GENSHIN IMPACT", "REROLL AR55"],
    variants: [
      {
        variantCode: "GENSHIN-REROLL-AR55-AMERICA",
        name: "Genshin Impact | Reroll AR55+ | América",
        salePrice: 149.9,
        unitCost: 0,
        stockCurrent: 0,
        stockMin: 0,
        supplierName: "Fornecedor Genshin / a definir",
        deliveryType: "on_demand",
        needsReview: true,
        notes: "Custo do fornecedor precisa ser preenchido manualmente."
      }
    ]
  },
  {
    key: "tft-elojob",
    matchers: ["TFT ELOJOB", "FERRO AO ESMERALDA"],
    variants: [
      ["TFT-FERRO-BRONZE", "[ELOJOB TFT] Ferro → Bronze", 9.9],
      ["TFT-BRONZE-PRATA", "[ELOJOB TFT] Bronze → Prata", 12.9],
      ["TFT-PRATA-OURO", "[ELOJOB TFT] Prata → Ouro", 17.9],
      ["TFT-OURO-PLATINA", "[ELOJOB TFT] Ouro → Platina", 24.9],
      ["TFT-PLATINA-ESMERALDA", "[ELOJOB TFT] Platina → Esmeralda", 59.9]
    ].map(([variantCode, name, salePrice]) => ({
      variantCode,
      name,
      salePrice,
      unitCost: 0,
      stockCurrent: 99999,
      stockMin: 0,
      supplierName: "Serviço próprio",
      deliveryType: "service",
      needsReview: false
    }))
  },
  {
    key: "site-profissional",
    matchers: ["CRIACAO DE SITE PROFISSIONAL", "STREAMER SERVIDOR GUILD"],
    variants: [
      {
        variantCode: "SITE-PROFISSIONAL-BASE",
        name: "Criação de site profissional | Base",
        salePrice: 99.9,
        unitCost: 0,
        stockCurrent: 99999,
        stockMin: 0,
        supplierName: "Serviço próprio",
        deliveryType: "service",
        needsReview: false,
        notes: "Serviço próprio. Custo unitário pode ser 0 ou calculado manualmente por horas de trabalho."
      }
    ]
  }
];

const getDatabasePath = async () => {
  if (process.env.HZDK_SQLITE_PATH) {
    return process.env.HZDK_SQLITE_PATH;
  }

  await app.whenReady();
  const appDataDirectory = app.getPath("appData");
  const candidates = [
    join(appDataDirectory, "@hzdk", "gamemarket-desktop", databaseFileName),
    join(appDataDirectory, "HzdKyx GameMarket Manager", databaseFileName),
    join(app.getPath("userData"), databaseFileName),
    join(appDataDirectory, "Electron", databaseFileName)
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
};

const columnExists = (db, table, column) =>
  db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);

const applyVariantSchema = (db) => {
  const hasProducts = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'products'")
    .get();

  if (!hasProducts) {
    throw new Error("Tabela products não encontrada. Abra o app ao menos uma vez antes de rodar o seed.");
  }

  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);");
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(createTableSql);

  if (!columnExists(db, "inventory_items", "product_variant_id")) {
    db.exec("ALTER TABLE inventory_items ADD COLUMN product_variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL;");
  }

  if (!columnExists(db, "orders", "product_variant_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN product_variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL;");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_variants_status ON product_variants(status);
    CREATE INDEX IF NOT EXISTS idx_product_variants_delivery_type ON product_variants(delivery_type);
    CREATE INDEX IF NOT EXISTS idx_inventory_product_variant ON inventory_items(product_variant_id);
    CREATE INDEX IF NOT EXISTS idx_orders_product_variant ON orders(product_variant_id);
    PRAGMA foreign_keys = ON;
  `);

  db.prepare("INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES ('0006_product_variants', ?)")
    .run(new Date().toISOString());
};

const findProduct = (products, matchers) => {
  const normalizedMatchers = matchers.map(normalize);

  return products.find((product) => {
    const haystack = normalize([product.name, product.category, product.game].filter(Boolean).join(" "));
    return normalizedMatchers.some((matcher) =>
      matcher
        .split(" ")
        .filter(Boolean)
        .every((token) => haystack.includes(token))
    );
  });
};

const main = async () => {
  const databasePath = await getDatabasePath();
  if (!existsSync(databasePath)) {
    throw new Error(
      `SQLite não encontrado em ${databasePath}. Informe HZDK_SQLITE_PATH para usar outro arquivo.`
    );
  }

  const db = new Database(databasePath);
  applyVariantSchema(db);

  const products = db
    .prepare("SELECT id, name, category, game FROM products WHERE status != 'archived'")
    .all();
  const existingCodes = new Set(
    db.prepare("SELECT variant_code FROM product_variants").all().map((row) => row.variant_code)
  );
  const insert = db.prepare(`
    INSERT INTO product_variants (
      id,
      product_id,
      variant_code,
      name,
      description,
      sale_price_cents,
      unit_cost_cents,
      fee_percent,
      net_value_cents,
      estimated_profit_cents,
      margin_percent,
      stock_current,
      stock_min,
      supplier_name,
      supplier_url,
      delivery_type,
      status,
      notes,
      source,
      needs_review,
      manually_edited_at,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @productId,
      @variantCode,
      @name,
      @description,
      @salePriceCents,
      @unitCostCents,
      @feePercent,
      @netValueCents,
      @estimatedProfitCents,
      @marginPercent,
      @stockCurrent,
      @stockMin,
      @supplierName,
      @supplierUrl,
      @deliveryType,
      'active',
      @notes,
      'seeded_from_conversation',
      @needsReview,
      NULL,
      @createdAt,
      @updatedAt
    )
  `);

  const created = [];
  const skipped = [];
  const missingProducts = [];
  const timestamp = new Date().toISOString();

  const transaction = db.transaction(() => {
    for (const group of catalog) {
      const product = findProduct(products, group.matchers);
      if (!product) {
        missingProducts.push(group.key);
        continue;
      }

      for (const variant of group.variants) {
        if (existingCodes.has(variant.variantCode)) {
          skipped.push(variant.variantCode);
          continue;
        }

        const values = financials(variant.salePrice, variant.unitCost);
        insert.run({
          id: randomUUID(),
          productId: product.id,
          variantCode: variant.variantCode,
          name: variant.name,
          description: null,
          ...values,
          feePercent,
          stockCurrent: variant.stockCurrent,
          stockMin: variant.stockMin,
          supplierName: variant.supplierName ?? "Fornecedor / a definir",
          supplierUrl: null,
          deliveryType: variant.deliveryType,
          notes: variant.notes ?? null,
          needsReview: variant.needsReview ? 1 : 0,
          createdAt: timestamp,
          updatedAt: timestamp
        });
        existingCodes.add(variant.variantCode);
        created.push({
          code: variant.variantCode,
          product: product.name,
          needsReview: Boolean(variant.needsReview)
        });
      }
    }
  });

  transaction();

  const needsReview = created.filter((variant) => variant.needsReview);
  console.log(JSON.stringify({
    databasePath,
    created: created.length,
    skipped: skipped.length,
    missingProducts,
    needsReview: needsReview.map((variant) => ({
      code: variant.code,
      product: variant.product
    }))
  }, null, 2));

  db.close();
  app.quit();
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
  app.exit(1);
});
