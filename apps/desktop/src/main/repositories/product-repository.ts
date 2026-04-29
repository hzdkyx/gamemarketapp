import { getSqliteDatabase } from "../database/database";
import type {
  DeliveryType,
  ProductListInput,
  ProductRecord,
  ProductStatus
} from "../../shared/contracts";

interface ProductRow {
  id: string;
  internal_code: string;
  name: string;
  category: string;
  game: string | null;
  platform: string | null;
  listing_url: string | null;
  sale_price_cents: number;
  unit_cost_cents: number;
  fee_percent: number;
  net_value_cents: number;
  estimated_profit_cents: number;
  margin_percent: number;
  stock_current: number;
  stock_min: number;
  status: ProductStatus;
  delivery_type: DeliveryType;
  supplier_id: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductWriteRecord {
  id: string;
  internalCode: string;
  name: string;
  category: string;
  game: string | null;
  platform: string | null;
  listingUrl: string | null;
  salePriceCents: number;
  unitCostCents: number;
  feePercent: number;
  netValueCents: number;
  estimatedProfitCents: number;
  marginPercent: number;
  stockCurrent: number;
  stockMin: number;
  status: ProductStatus;
  deliveryType: DeliveryType;
  supplierId: string | null;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSummaryRow {
  total: number;
  active: number;
  out_of_stock: number;
  low_stock: number;
  average_estimated_profit_cents: number | null;
}

const centsToMoney = (value: number): number => Math.round(value) / 100;

const mapProductRow = (row: ProductRow): ProductRecord => ({
  id: row.id,
  internalCode: row.internal_code,
  name: row.name,
  category: row.category,
  game: row.game,
  platform: row.platform,
  listingUrl: row.listing_url,
  salePrice: centsToMoney(row.sale_price_cents),
  unitCost: centsToMoney(row.unit_cost_cents),
  feePercent: row.fee_percent,
  netValue: centsToMoney(row.net_value_cents),
  estimatedProfit: centsToMoney(row.estimated_profit_cents),
  marginPercent: row.margin_percent,
  stockCurrent: row.stock_current,
  stockMin: row.stock_min,
  status: row.status,
  deliveryType: row.delivery_type,
  supplierId: row.supplier_id,
  notes: row.notes,
  createdByUserId: row.created_by_user_id,
  updatedByUserId: row.updated_by_user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const productSelect = `
  SELECT
    id,
    internal_code,
    name,
    category,
    game,
    platform,
    listing_url,
    sale_price_cents,
    unit_cost_cents,
    fee_percent,
    net_value_cents,
    estimated_profit_cents,
    margin_percent,
    stock_current,
    stock_min,
    status,
    delivery_type,
    supplier_id,
    notes,
    created_by_user_id,
    updated_by_user_id,
    created_at,
    updated_at
  FROM products
`;

const productOrderBy: Record<ProductListInput["sortBy"], string> = {
  name: "LOWER(name)",
  price: "sale_price_cents",
  profit: "estimated_profit_cents",
  stock: "stock_current",
  status: "status"
};

const buildProductWhere = (filters: ProductListInput): { sql: string; params: Record<string, unknown> } => {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.search) {
    where.push(`(
      LOWER(internal_code) LIKE @search OR
      LOWER(name) LIKE @search OR
      LOWER(category) LIKE @search OR
      LOWER(COALESCE(game, '')) LIKE @search OR
      LOWER(COALESCE(platform, '')) LIKE @search OR
      LOWER(status) LIKE @search
    )`);
    params.search = `%${filters.search.toLowerCase()}%`;
  }

  if (filters.status !== "all") {
    where.push("status = @status");
    params.status = filters.status;
  }

  if (filters.category) {
    where.push("(category = @category OR game = @category)");
    params.category = filters.category;
  }

  if (filters.stock === "low") {
    where.push("stock_current > 0 AND stock_current <= stock_min");
  }

  if (filters.stock === "out") {
    where.push("stock_current <= 0");
  }

  return {
    sql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
};

export const productRepository = {
  list(filters: ProductListInput): ProductRecord[] {
    const db = getSqliteDatabase();
    const where = buildProductWhere(filters);
    const orderBy = productOrderBy[filters.sortBy];
    const direction = filters.sortDirection === "desc" ? "DESC" : "ASC";

    const rows = db
      .prepare(`${productSelect} ${where.sql} ORDER BY ${orderBy} ${direction}, LOWER(name) ASC`)
      .all(where.params) as ProductRow[];

    return rows.map(mapProductRow);
  },

  listAllForSelect(): Array<Pick<ProductRecord, "id" | "internalCode" | "name" | "category" | "game">> {
    const db = getSqliteDatabase();
    const rows = db
      .prepare(
        "SELECT id, internal_code, name, category, game FROM products WHERE status != 'archived' ORDER BY LOWER(name) ASC"
      )
      .all() as Array<{
      id: string;
      internal_code: string;
      name: string;
      category: string;
      game: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      internalCode: row.internal_code,
      name: row.name,
      category: row.category,
      game: row.game
    }));
  },

  getById(id: string): ProductRecord | null {
    const db = getSqliteDatabase();
    const row = db.prepare(`${productSelect} WHERE id = ?`).get(id) as ProductRow | undefined;
    return row ? mapProductRow(row) : null;
  },

  getByInternalCode(internalCode: string): ProductRecord | null {
    const db = getSqliteDatabase();
    const row = db
      .prepare(`${productSelect} WHERE internal_code = ?`)
      .get(internalCode) as ProductRow | undefined;
    return row ? mapProductRow(row) : null;
  },

  insert(product: ProductWriteRecord): ProductRecord {
    const db = getSqliteDatabase();
    db.prepare(
      `
        INSERT INTO products (
          id,
          internal_code,
          name,
          category,
          game,
          platform,
          listing_url,
          sale_price_cents,
          unit_cost_cents,
          fee_percent,
          net_value_cents,
          estimated_profit_cents,
          margin_percent,
          stock_current,
          stock_min,
          status,
          delivery_type,
          supplier_id,
          notes,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @internalCode,
          @name,
          @category,
          @game,
          @platform,
          @listingUrl,
          @salePriceCents,
          @unitCostCents,
          @feePercent,
          @netValueCents,
          @estimatedProfitCents,
          @marginPercent,
          @stockCurrent,
          @stockMin,
          @status,
          @deliveryType,
          @supplierId,
          @notes,
          @createdByUserId,
          @updatedByUserId,
          @createdAt,
          @updatedAt
        )
      `
    ).run(product);

    const created = this.getById(product.id);
    if (!created) {
      throw new Error("Product was not created.");
    }

    return created;
  },

  update(product: ProductWriteRecord): ProductRecord {
    const db = getSqliteDatabase();
    db.prepare(
      `
        UPDATE products
        SET
          internal_code = @internalCode,
          name = @name,
          category = @category,
          game = @game,
          platform = @platform,
          listing_url = @listingUrl,
          sale_price_cents = @salePriceCents,
          unit_cost_cents = @unitCostCents,
          fee_percent = @feePercent,
          net_value_cents = @netValueCents,
          estimated_profit_cents = @estimatedProfitCents,
          margin_percent = @marginPercent,
          stock_current = @stockCurrent,
          stock_min = @stockMin,
          status = @status,
          delivery_type = @deliveryType,
          supplier_id = @supplierId,
          notes = @notes,
          created_by_user_id = @createdByUserId,
          updated_by_user_id = @updatedByUserId,
          updated_at = @updatedAt
        WHERE id = @id
      `
    ).run(product);

    const updated = this.getById(product.id);
    if (!updated) {
      throw new Error("Product was not updated.");
    }

    return updated;
  },

  delete(id: string): boolean {
    const db = getSqliteDatabase();
    const result = db.prepare("DELETE FROM products WHERE id = ?").run(id);
    return result.changes > 0;
  },

  getSummary(): ProductSummaryRow {
    const db = getSqliteDatabase();
    return db
      .prepare(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN stock_current <= 0 THEN 1 ELSE 0 END) AS out_of_stock,
            SUM(CASE WHEN stock_current > 0 AND stock_current <= stock_min THEN 1 ELSE 0 END) AS low_stock,
            AVG(estimated_profit_cents) AS average_estimated_profit_cents
          FROM products
        `
      )
      .get() as ProductSummaryRow;
  },

  listCategories(): string[] {
    const db = getSqliteDatabase();
    const rows = db
      .prepare(
        `
          SELECT value
          FROM (
            SELECT category AS value FROM products WHERE category IS NOT NULL AND category != ''
            UNION
            SELECT game AS value FROM products WHERE game IS NOT NULL AND game != ''
          )
          ORDER BY LOWER(value) ASC
        `
      )
      .all() as Array<{ value: string }>;

    return rows.map((row) => row.value);
  }
};
