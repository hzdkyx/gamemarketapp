import Database from "better-sqlite3";
import { app } from "electron";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  canAssignVariantToProduct,
  catalog,
  feePercent,
  financials,
  findProductMatch
} from "./product-variant-catalog.mjs";

const databaseFileName = "hzdk-gamemarket-manager.sqlite";

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

export const runSeed = async () => {
  const databasePath = await getDatabasePath();
  if (!existsSync(databasePath)) {
    throw new Error(
      `SQLite não encontrado em ${databasePath}. Informe HZDK_SQLITE_PATH para usar outro arquivo.`
    );
  }

  const db = new Database(databasePath);
  applyVariantSchema(db);

  const products = db
    .prepare("SELECT id, name, category, game, status FROM products WHERE status != 'archived'")
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
  const blockedVariants = [];
  const timestamp = new Date().toISOString();

  const transaction = db.transaction(() => {
    for (const group of catalog) {
      const match = findProductMatch(products, group);
      if (!match.product) {
        missingProducts.push({
          key: group.key,
          reason: match.reason,
          candidates: match.candidates.map((candidate) => ({
            id: candidate.id,
            name: candidate.name
          }))
        });
        continue;
      }

      for (const variant of group.variants) {
        if (!canAssignVariantToProduct(match.product, variant, group.key)) {
          blockedVariants.push({
            key: group.key,
            variantCode: variant.variantCode,
            productId: match.product.id,
            productName: match.product.name
          });
          continue;
        }

        if (existingCodes.has(variant.variantCode)) {
          skipped.push(variant.variantCode);
          continue;
        }

        const values = financials(variant.salePrice, variant.unitCost);
        insert.run({
          id: randomUUID(),
          productId: match.product.id,
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
          product: match.product.name,
          needsReview: Boolean(variant.needsReview)
        });
      }
    }
  });

  transaction();

  const needsReview = created.filter((variant) => variant.needsReview);
  const report = {
    databasePath,
    created: created.length,
    skipped: skipped.length,
    missingProducts,
    blockedVariants,
    needsReview: needsReview.map((variant) => ({
      code: variant.code,
      product: variant.product
    }))
  };

  db.close();
  return report;
};

const isExecutedAsScript = () => {
  const entry = process.argv[1];
  return Boolean(entry && import.meta.url === pathToFileURL(resolve(entry)).href);
};

if (isExecutedAsScript()) {
  runSeed()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      app.quit();
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
      app.exit(1);
    });
}
