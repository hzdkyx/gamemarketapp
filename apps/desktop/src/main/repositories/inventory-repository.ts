import { getSqliteDatabase } from "../database/database";
import type {
  DeliveryType,
  InventoryListInput,
  OperationalStockRecord,
  OperationalStockScope,
  InventoryRecord,
  InventoryStatus,
  ProductStatus,
  ProductVariantStatus
} from "../../shared/contracts";
import { getOperationalStockState, getRealStockUnits } from "../services/stock-rules";

interface InventoryJoinedRow {
  id: string;
  inventory_code: string;
  product_id: string | null;
  product_variant_id: string | null;
  product_variant_code: string | null;
  product_variant_name: string | null;
  product_name: string | null;
  product_internal_code: string | null;
  category: string | null;
  game: string | null;
  product_net_value_cents: number | null;
  variant_net_value_cents: number | null;
  supplier_id: string | null;
  purchase_cost_cents: number;
  status: InventoryStatus;
  account_login_encrypted: string | null;
  account_password_encrypted: string | null;
  account_email_encrypted: string | null;
  account_email_password_encrypted: string | null;
  access_notes_encrypted: string | null;
  public_notes: string | null;
  bought_at: string | null;
  sold_at: string | null;
  delivered_at: string | null;
  order_id: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryEncryptedRow {
  id: string;
  inventory_code: string;
  product_id: string | null;
  product_variant_id: string | null;
  supplier_id: string | null;
  purchase_cost_cents: number;
  status: InventoryStatus;
  account_login_encrypted: string | null;
  account_password_encrypted: string | null;
  account_email_encrypted: string | null;
  account_email_password_encrypted: string | null;
  access_notes_encrypted: string | null;
  public_notes: string | null;
  bought_at: string | null;
  sold_at: string | null;
  delivered_at: string | null;
  order_id: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryWriteRecord {
  id: string;
  inventoryCode: string;
  productId: string | null;
  productVariantId: string | null;
  supplierId: string | null;
  purchaseCostCents: number;
  status: InventoryStatus;
  accountLoginEncrypted: string | null;
  accountPasswordEncrypted: string | null;
  accountEmailEncrypted: string | null;
  accountEmailPasswordEncrypted: string | null;
  accessNotesEncrypted: string | null;
  publicNotes: string | null;
  boughtAt: string | null;
  soldAt: string | null;
  deliveredAt: string | null;
  orderId: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventorySummaryRow {
  available: number;
  sold: number;
  problem: number;
  total_cost_cents: number | null;
  potential_profit_cents: number | null;
}

interface OperationalStockRow {
  id: string;
  scope: OperationalStockScope;
  product_id: string;
  product_internal_code: string;
  product_name: string;
  category: string;
  game: string | null;
  product_variant_id: string | null;
  product_variant_code: string | null;
  product_variant_name: string | null;
  delivery_type: DeliveryType;
  stock_current: number;
  stock_min: number;
  sale_price_cents: number;
  unit_cost_cents: number;
  net_value_cents: number;
  status: ProductStatus | ProductVariantStatus;
  needs_review: number;
  supplier_name: string | null;
  supplier_url: string | null;
}

const centsToMoney = (value: number): number => Math.round(value) / 100;

const mapInventoryRow = (row: InventoryJoinedRow): InventoryRecord => ({
  id: row.id,
  inventoryCode: row.inventory_code,
  productId: row.product_id,
  productVariantId: row.product_variant_id,
  productVariantCode: row.product_variant_code,
  productVariantName: row.product_variant_name,
  productName: row.product_name,
  productInternalCode: row.product_internal_code,
  category: row.category,
  game: row.game,
  supplierId: row.supplier_id,
  purchaseCost: centsToMoney(row.purchase_cost_cents),
  status: row.status,
  hasAccountLogin: Boolean(row.account_login_encrypted),
  hasAccountPassword: Boolean(row.account_password_encrypted),
  hasAccountEmail: Boolean(row.account_email_encrypted),
  hasAccountEmailPassword: Boolean(row.account_email_password_encrypted),
  hasAccessNotes: Boolean(row.access_notes_encrypted),
  publicNotes: row.public_notes,
  boughtAt: row.bought_at,
  soldAt: row.sold_at,
  deliveredAt: row.delivered_at,
  orderId: row.order_id,
  potentialProfit: centsToMoney(
    (row.variant_net_value_cents ?? row.product_net_value_cents ?? 0) - row.purchase_cost_cents
  ),
  createdByUserId: row.created_by_user_id,
  updatedByUserId: row.updated_by_user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapOperationalStockRow = (row: OperationalStockRow): OperationalStockRecord => {
  const stockState = getOperationalStockState({
    deliveryType: row.delivery_type,
    stockCurrent: row.stock_current,
    stockMin: row.stock_min
  });
  const realStockUnits = getRealStockUnits({
    deliveryType: row.delivery_type,
    stockCurrent: row.stock_current
  });
  const unitProfitCents = row.net_value_cents - row.unit_cost_cents;

  return {
    id: row.id,
    scope: row.scope,
    productId: row.product_id,
    productInternalCode: row.product_internal_code,
    productName: row.product_name,
    category: row.category,
    game: row.game,
    productVariantId: row.product_variant_id,
    productVariantCode: row.product_variant_code,
    productVariantName: row.product_variant_name,
    deliveryType: row.delivery_type,
    stockCurrent: row.stock_current,
    stockMin: row.stock_min,
    salePrice: centsToMoney(row.sale_price_cents),
    unitCost: centsToMoney(row.unit_cost_cents),
    netValue: centsToMoney(row.net_value_cents),
    unitProfit: centsToMoney(unitProfitCents),
    potentialProfit: centsToMoney(unitProfitCents * realStockUnits),
    status: row.status,
    stockState,
    needsReview: Boolean(row.needs_review),
    supplierName: row.supplier_name,
    supplierUrl: row.supplier_url
  };
};

const inventorySelect = `
  SELECT
    inventory_items.id,
    inventory_items.inventory_code,
    inventory_items.product_id,
    inventory_items.product_variant_id,
    product_variants.variant_code AS product_variant_code,
    product_variants.name AS product_variant_name,
    products.name AS product_name,
    products.internal_code AS product_internal_code,
    products.category,
    products.game,
    products.net_value_cents AS product_net_value_cents,
    product_variants.net_value_cents AS variant_net_value_cents,
    inventory_items.supplier_id,
    inventory_items.purchase_cost_cents,
    inventory_items.status,
    inventory_items.account_login_encrypted,
    inventory_items.account_password_encrypted,
    inventory_items.account_email_encrypted,
    inventory_items.account_email_password_encrypted,
    inventory_items.access_notes_encrypted,
    inventory_items.public_notes,
    inventory_items.bought_at,
    inventory_items.sold_at,
    inventory_items.delivered_at,
    inventory_items.order_id,
    inventory_items.created_by_user_id,
    inventory_items.updated_by_user_id,
    inventory_items.created_at,
    inventory_items.updated_at
  FROM inventory_items
  LEFT JOIN products ON products.id = inventory_items.product_id
  LEFT JOIN product_variants ON product_variants.id = inventory_items.product_variant_id
`;

const encryptedSelect = `
  SELECT
    id,
    inventory_code,
    product_id,
    product_variant_id,
    supplier_id,
    purchase_cost_cents,
    status,
    account_login_encrypted,
    account_password_encrypted,
    account_email_encrypted,
    account_email_password_encrypted,
    access_notes_encrypted,
    public_notes,
    bought_at,
    sold_at,
    delivered_at,
    order_id,
    created_by_user_id,
    updated_by_user_id,
    created_at,
    updated_at
  FROM inventory_items
`;

const buildInventoryWhere = (filters: InventoryListInput): { sql: string; params: Record<string, unknown> } => {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.search) {
    where.push(`(
      LOWER(inventory_items.inventory_code) LIKE @search OR
      LOWER(COALESCE(products.name, '')) LIKE @search OR
      LOWER(COALESCE(product_variants.name, '')) LIKE @search OR
      LOWER(COALESCE(product_variants.variant_code, '')) LIKE @search OR
      LOWER(COALESCE(products.internal_code, '')) LIKE @search OR
      LOWER(COALESCE(inventory_items.supplier_id, '')) LIKE @search OR
      LOWER(inventory_items.status) LIKE @search OR
      LOWER(COALESCE(inventory_items.public_notes, '')) LIKE @search
    )`);
    params.search = `%${filters.search.toLowerCase()}%`;
  }

  if (filters.productId) {
    where.push("inventory_items.product_id = @productId");
    params.productId = filters.productId;
  }

  if (filters.category) {
    where.push("(products.category = @category OR products.game = @category)");
    params.category = filters.category;
  }

  if (filters.status !== "all") {
    where.push("inventory_items.status = @status");
    params.status = filters.status;
  }

  if (filters.supplierId) {
    where.push("inventory_items.supplier_id = @supplierId");
    params.supplierId = filters.supplierId;
  }

  return {
    sql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
};

const operationalStockSelect = `
  WITH operational_stock AS (
    SELECT
      'variant' AS scope,
      product_variants.id AS id,
      products.id AS product_id,
      products.internal_code AS product_internal_code,
      products.name AS product_name,
      products.category AS category,
      products.game AS game,
      product_variants.id AS product_variant_id,
      product_variants.variant_code AS product_variant_code,
      product_variants.name AS product_variant_name,
      product_variants.delivery_type AS delivery_type,
      product_variants.stock_current AS stock_current,
      product_variants.stock_min AS stock_min,
      product_variants.sale_price_cents AS sale_price_cents,
      product_variants.unit_cost_cents AS unit_cost_cents,
      product_variants.net_value_cents AS net_value_cents,
      product_variants.status AS status,
      product_variants.needs_review AS needs_review,
      product_variants.supplier_name AS supplier_name,
      product_variants.supplier_url AS supplier_url
    FROM product_variants
    INNER JOIN products ON products.id = product_variants.product_id
    WHERE product_variants.status != 'archived'
      AND products.status != 'archived'

    UNION ALL

    SELECT
      'product' AS scope,
      products.id AS id,
      products.id AS product_id,
      products.internal_code AS product_internal_code,
      products.name AS product_name,
      products.category AS category,
      products.game AS game,
      NULL AS product_variant_id,
      NULL AS product_variant_code,
      NULL AS product_variant_name,
      products.delivery_type AS delivery_type,
      products.stock_current AS stock_current,
      products.stock_min AS stock_min,
      products.sale_price_cents AS sale_price_cents,
      products.unit_cost_cents AS unit_cost_cents,
      products.net_value_cents AS net_value_cents,
      products.status AS status,
      0 AS needs_review,
      products.supplier_id AS supplier_name,
      NULL AS supplier_url
    FROM products
    WHERE products.status != 'archived'
      AND NOT EXISTS (
        SELECT 1
        FROM product_variants
        WHERE product_variants.product_id = products.id
          AND product_variants.status != 'archived'
      )
  )
  SELECT *
  FROM operational_stock
`;

const buildOperationalStockWhere = (filters: InventoryListInput): { sql: string; params: Record<string, unknown> } => {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.search) {
    where.push(`(
      LOWER(product_internal_code) LIKE @search OR
      LOWER(product_name) LIKE @search OR
      LOWER(COALESCE(product_variant_name, '')) LIKE @search OR
      LOWER(COALESCE(product_variant_code, '')) LIKE @search OR
      LOWER(category) LIKE @search OR
      LOWER(COALESCE(game, '')) LIKE @search OR
      LOWER(COALESCE(supplier_name, '')) LIKE @search OR
      LOWER(status) LIKE @search OR
      LOWER(delivery_type) LIKE @search
    )`);
    params.search = `%${filters.search.toLowerCase()}%`;
  }

  if (filters.productId) {
    where.push("product_id = @productId");
    params.productId = filters.productId;
  }

  if (filters.category) {
    where.push("(category = @category OR game = @category)");
    params.category = filters.category;
  }

  if (filters.supplierId) {
    where.push("supplier_name = @supplierId");
    params.supplierId = filters.supplierId;
  }

  return {
    sql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
};

export const inventoryRepository = {
  list(filters: InventoryListInput): InventoryRecord[] {
    const db = getSqliteDatabase();
    const where = buildInventoryWhere(filters);
    const direction = filters.sortDirection === "desc" ? "DESC" : "ASC";
    const rows = db
      .prepare(`${inventorySelect} ${where.sql} ORDER BY LOWER(inventory_items.inventory_code) ${direction}`)
      .all(where.params) as InventoryJoinedRow[];

    return rows.map(mapInventoryRow);
  },

  listOperational(filters: InventoryListInput): OperationalStockRecord[] {
    const db = getSqliteDatabase();
    const where = buildOperationalStockWhere(filters);
    const rows = db
      .prepare(
        `${operationalStockSelect} ${where.sql} ORDER BY LOWER(product_name) ASC, scope DESC, LOWER(COALESCE(product_variant_name, '')) ASC`
      )
      .all(where.params) as OperationalStockRow[];

    return rows.map(mapOperationalStockRow);
  },

  getById(id: string): InventoryRecord | null {
    const db = getSqliteDatabase();
    const row = db
      .prepare(`${inventorySelect} WHERE inventory_items.id = ?`)
      .get(id) as InventoryJoinedRow | undefined;

    return row ? mapInventoryRow(row) : null;
  },

  getEncryptedById(id: string): InventoryEncryptedRow | null {
    const db = getSqliteDatabase();
    const row = db
      .prepare(`${encryptedSelect} WHERE id = ?`)
      .get(id) as InventoryEncryptedRow | undefined;

    return row ?? null;
  },

  insert(item: InventoryWriteRecord): InventoryRecord {
    const db = getSqliteDatabase();
    db.prepare(
      `
        INSERT INTO inventory_items (
          id,
          inventory_code,
          product_id,
          product_variant_id,
          supplier_id,
          purchase_cost_cents,
          status,
          account_login_encrypted,
          account_password_encrypted,
          account_email_encrypted,
          account_email_password_encrypted,
          access_notes_encrypted,
          public_notes,
          bought_at,
          sold_at,
          delivered_at,
          order_id,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @inventoryCode,
          @productId,
          @productVariantId,
          @supplierId,
          @purchaseCostCents,
          @status,
          @accountLoginEncrypted,
          @accountPasswordEncrypted,
          @accountEmailEncrypted,
          @accountEmailPasswordEncrypted,
          @accessNotesEncrypted,
          @publicNotes,
          @boughtAt,
          @soldAt,
          @deliveredAt,
          @orderId,
          @createdByUserId,
          @updatedByUserId,
          @createdAt,
          @updatedAt
        )
      `
    ).run(item);

    const created = this.getById(item.id);
    if (!created) {
      throw new Error("Inventory item was not created.");
    }

    return created;
  },

  update(item: InventoryWriteRecord): InventoryRecord {
    const db = getSqliteDatabase();
    db.prepare(
      `
        UPDATE inventory_items
        SET
          inventory_code = @inventoryCode,
          product_id = @productId,
          product_variant_id = @productVariantId,
          supplier_id = @supplierId,
          purchase_cost_cents = @purchaseCostCents,
          status = @status,
          account_login_encrypted = @accountLoginEncrypted,
          account_password_encrypted = @accountPasswordEncrypted,
          account_email_encrypted = @accountEmailEncrypted,
          account_email_password_encrypted = @accountEmailPasswordEncrypted,
          access_notes_encrypted = @accessNotesEncrypted,
          public_notes = @publicNotes,
          bought_at = @boughtAt,
          sold_at = @soldAt,
          delivered_at = @deliveredAt,
          order_id = @orderId,
          created_by_user_id = @createdByUserId,
          updated_by_user_id = @updatedByUserId,
          updated_at = @updatedAt
        WHERE id = @id
      `
    ).run(item);

    const updated = this.getById(item.id);
    if (!updated) {
      throw new Error("Inventory item was not updated.");
    }

    return updated;
  },

  delete(id: string): boolean {
    const db = getSqliteDatabase();
    const result = db.prepare("DELETE FROM inventory_items WHERE id = ?").run(id);
    return result.changes > 0;
  },

  getSummary(): InventorySummaryRow {
    const db = getSqliteDatabase();
    return db
      .prepare(
        `
          SELECT
            SUM(CASE WHEN inventory_items.status = 'available' THEN 1 ELSE 0 END) AS available,
            SUM(CASE WHEN inventory_items.status IN ('sold', 'delivered') THEN 1 ELSE 0 END) AS sold,
            SUM(CASE WHEN inventory_items.status = 'problem' THEN 1 ELSE 0 END) AS problem,
            SUM(CASE WHEN inventory_items.status = 'available' THEN inventory_items.purchase_cost_cents ELSE 0 END) AS total_cost_cents,
            SUM(
              CASE
                WHEN inventory_items.status = 'available'
                  THEN COALESCE(product_variants.net_value_cents, products.net_value_cents, 0) - inventory_items.purchase_cost_cents
                ELSE 0
              END
            ) AS potential_profit_cents
          FROM inventory_items
          LEFT JOIN products ON products.id = inventory_items.product_id
          LEFT JOIN product_variants ON product_variants.id = inventory_items.product_variant_id
        `
      )
      .get() as InventorySummaryRow;
  },

  listSuppliers(): string[] {
    const db = getSqliteDatabase();
    const rows = db
      .prepare(
        "SELECT DISTINCT supplier_id AS value FROM inventory_items WHERE supplier_id IS NOT NULL AND supplier_id != '' ORDER BY LOWER(supplier_id)"
      )
      .all() as Array<{ value: string }>;

    return rows.map((row) => row.value);
  },

  countSoldOperationalOrders(): number {
    const db = getSqliteDatabase();
    const row = db
      .prepare("SELECT COUNT(*) AS total FROM orders WHERE status IN ('delivered', 'completed')")
      .get() as { total: number } | undefined;

    return row?.total ?? 0;
  },

  listForOrderSelect(): Array<
    Pick<
      InventoryRecord,
      | "id"
      | "inventoryCode"
      | "productId"
      | "productVariantId"
      | "productName"
      | "productVariantName"
      | "status"
    >
  > {
    const db = getSqliteDatabase();
    const rows = db
      .prepare(
        `
          SELECT
            inventory_items.id,
            inventory_items.inventory_code,
            inventory_items.product_id,
            inventory_items.product_variant_id,
            products.name AS product_name,
            product_variants.name AS product_variant_name,
            inventory_items.status
          FROM inventory_items
          LEFT JOIN products ON products.id = inventory_items.product_id
          LEFT JOIN product_variants ON product_variants.id = inventory_items.product_variant_id
          WHERE inventory_items.status != 'archived'
          ORDER BY
            CASE inventory_items.status
              WHEN 'available' THEN 0
              WHEN 'reserved' THEN 1
              ELSE 2
            END,
            LOWER(inventory_items.inventory_code) ASC
        `
      )
      .all() as Array<{
      id: string;
      inventory_code: string;
      product_id: string | null;
      product_variant_id: string | null;
      product_name: string | null;
      product_variant_name: string | null;
      status: InventoryStatus;
    }>;

    return rows.map((row) => ({
      id: row.id,
      inventoryCode: row.inventory_code,
      productId: row.product_id,
      productVariantId: row.product_variant_id,
      productName: row.product_name,
      productVariantName: row.product_variant_name,
      status: row.status
    }));
  },

  countAvailableByProduct(productId: string): number {
    const db = getSqliteDatabase();
    const row = db
      .prepare(
        "SELECT COUNT(*) AS total FROM inventory_items WHERE product_id = ? AND status = 'available'"
      )
      .get(productId) as { total: number } | undefined;

    return row?.total ?? 0;
  },

  countAvailableByProductVariant(productVariantId: string): number {
    const db = getSqliteDatabase();
    const row = db
      .prepare(
        "SELECT COUNT(*) AS total FROM inventory_items WHERE product_variant_id = ? AND status = 'available'"
      )
      .get(productVariantId) as { total: number } | undefined;

    return row?.total ?? 0;
  }
};
