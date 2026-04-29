import Database from "better-sqlite3";
import { app } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  LOL_SMURF_EXTERNAL_PRODUCT_ID,
  TFT_ELOJOB_EXTERNAL_PRODUCT_ID,
  planLolSmurfVariantRepair
} from "./product-variant-catalog.mjs";

const databaseFileName = "hzdk-gamemarket-manager.sqlite";

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

const tableExists = (db, tableName) =>
  Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));

const makeBackupPath = (databasePath) => {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const backupDir = join(dirname(databasePath), "backups");
  mkdirSync(backupDir, { recursive: true });
  return join(backupDir, `${basename(databasePath)}.${stamp}.bak`);
};

const fetchRepairState = (db) => {
  const products = db
    .prepare(
      `
        SELECT id, internal_code, external_id, external_product_id, name, category, game, status
        FROM products
        WHERE status != 'archived'
      `
    )
    .all();

  const variants = db
    .prepare(
      `
        SELECT
          id,
          product_id,
          variant_code,
          name,
          description,
          sale_price_cents,
          unit_cost_cents,
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
        FROM product_variants
      `
    )
    .all();

  return { products, variants };
};

const summarizeProductVariants = (db, productId) =>
  db
    .prepare(
      `
        SELECT variant_code, name
        FROM product_variants
        WHERE product_id = ?
        ORDER BY variant_code ASC
      `
    )
    .all(productId);

const countLolOnTft = (db, productId) =>
  db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM product_variants
        WHERE product_id = ?
          AND (
            variant_code LIKE 'LOL-%'
            OR name LIKE '%[BR] LVL%'
            OR name LIKE '%[BR] Level%'
            OR name LIKE '%Camp%'
            OR name LIKE '%Campeões%'
            OR name LIKE '%Full Acesso%'
          )
      `
    )
    .get(productId).total;

const applyAction = (db, action, timestamp) => {
  const productVariantUpdates = [];
  const dependencyUpdates = {
    inventoryItems: 0,
    orders: 0,
    deletedDuplicateVariants: 0
  };

  const updateVariantParent = db.prepare(
    "UPDATE product_variants SET product_id = ?, updated_at = ? WHERE id = ?"
  );
  const updateInventoryProduct = db.prepare(
    "UPDATE inventory_items SET product_id = ?, updated_at = ? WHERE product_variant_id = ? AND product_id = ?"
  );
  const updateOrdersProduct = db.prepare(
    "UPDATE orders SET product_id = ?, updated_at = ? WHERE product_variant_id = ? AND product_id = ?"
  );
  const moveInventoryVariant = db.prepare(
    "UPDATE inventory_items SET product_variant_id = ?, product_id = ?, updated_at = ? WHERE product_variant_id = ?"
  );
  const moveOrdersVariant = db.prepare(
    "UPDATE orders SET product_variant_id = ?, product_id = ?, updated_at = ? WHERE product_variant_id = ?"
  );
  const deleteVariant = db.prepare("DELETE FROM product_variants WHERE id = ?");

  if (action.type === "move") {
    productVariantUpdates.push(updateVariantParent.run(action.toProductId, timestamp, action.variantId).changes);
    dependencyUpdates.inventoryItems += updateInventoryProduct.run(
      action.toProductId,
      timestamp,
      action.variantId,
      action.fromProductId
    ).changes;
    dependencyUpdates.orders += updateOrdersProduct.run(
      action.toProductId,
      timestamp,
      action.variantId,
      action.fromProductId
    ).changes;
  }

  if (action.type === "merge_into_existing") {
    dependencyUpdates.inventoryItems += moveInventoryVariant.run(
      action.preservedVariantId,
      action.toProductId,
      timestamp,
      action.variantId
    ).changes;
    dependencyUpdates.orders += moveOrdersVariant.run(
      action.preservedVariantId,
      action.toProductId,
      timestamp,
      action.variantId
    ).changes;
    dependencyUpdates.deletedDuplicateVariants += deleteVariant.run(action.variantId).changes;
  }

  if (action.type === "replace_duplicate_with_source") {
    dependencyUpdates.inventoryItems += moveInventoryVariant.run(
      action.variantId,
      action.toProductId,
      timestamp,
      action.duplicateVariantId
    ).changes;
    dependencyUpdates.orders += moveOrdersVariant.run(
      action.variantId,
      action.toProductId,
      timestamp,
      action.duplicateVariantId
    ).changes;
    dependencyUpdates.deletedDuplicateVariants += deleteVariant.run(action.duplicateVariantId).changes;
    productVariantUpdates.push(updateVariantParent.run(action.toProductId, timestamp, action.variantId).changes);
  }

  return {
    productVariants: productVariantUpdates.reduce((total, changes) => total + changes, 0),
    ...dependencyUpdates
  };
};

export const runRepair = async ({ dryRun = false } = {}) => {
  const databasePath = await getDatabasePath();
  if (!existsSync(databasePath)) {
    throw new Error(`SQLite não encontrado em ${databasePath}. Informe HZDK_SQLITE_PATH para usar outro arquivo.`);
  }

  const db = new Database(databasePath);
  if (!tableExists(db, "products") || !tableExists(db, "product_variants")) {
    db.close();
    throw new Error("Tabelas products/product_variants não encontradas. Abra o app e rode o seed antes do repair.");
  }

  const state = fetchRepairState(db);
  const plan = planLolSmurfVariantRepair(state);
  if (plan.errors.length > 0) {
    db.close();
    return {
      databasePath,
      dryRun,
      errors: plan.errors,
      expectedProducts: {
        lolSmurf: LOL_SMURF_EXTERNAL_PRODUCT_ID,
        tftElojob: TFT_ELOJOB_EXTERNAL_PRODUCT_ID
      }
    };
  }

  const affectedCodes = plan.actions.map((action) => action.variantCode).sort();
  let backupPath = null;
  const totals = {
    productVariants: 0,
    inventoryItems: 0,
    orders: 0,
    deletedDuplicateVariants: 0
  };

  if (!dryRun && plan.actions.length > 0) {
    backupPath = makeBackupPath(databasePath);
    await db.backup(backupPath);

    const timestamp = new Date().toISOString();
    const transaction = db.transaction(() => {
      for (const action of plan.actions) {
        const changes = applyAction(db, action, timestamp);
        totals.productVariants += changes.productVariants;
        totals.inventoryItems += changes.inventoryItems;
        totals.orders += changes.orders;
        totals.deletedDuplicateVariants += changes.deletedDuplicateVariants;
      }
    });
    transaction();
  }

  const report = {
    databasePath,
    dryRun,
    backupPath,
    wrongProduct: {
      id: plan.wrongProduct.id,
      internalCode: plan.wrongProduct.internal_code ?? null,
      externalProductId: plan.wrongProduct.external_product_id ?? plan.wrongProduct.external_id ?? null,
      name: plan.wrongProduct.name
    },
    targetProduct: {
      id: plan.targetProduct.id,
      internalCode: plan.targetProduct.internal_code ?? null,
      externalProductId: plan.targetProduct.external_product_id ?? plan.targetProduct.external_id ?? null,
      name: plan.targetProduct.name
    },
    moved: plan.actions.length,
    affectedCodes,
    duplicateResolutions: plan.actions
      .filter((action) => action.type !== "move")
      .map((action) => ({
        type: action.type,
        variantCode: action.variantCode,
        preservedVariantId: action.preservedVariantId,
        duplicateVariantId: action.duplicateVariantId
      })),
    appliedChanges: dryRun ? null : totals,
    after: {
      lolLikeVariantsOnTft: dryRun ? null : countLolOnTft(db, plan.wrongProduct.id),
      tftVariants: dryRun ? null : summarizeProductVariants(db, plan.wrongProduct.id).map((variant) => variant.variant_code),
      lolSmurfVariants: dryRun ? null : summarizeProductVariants(db, plan.targetProduct.id).map((variant) => variant.variant_code)
    }
  };

  db.close();
  return report;
};

const dryRun = process.argv.includes("--dry-run");

runRepair({ dryRun })
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    app.quit();
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    app.exit(1);
  });
