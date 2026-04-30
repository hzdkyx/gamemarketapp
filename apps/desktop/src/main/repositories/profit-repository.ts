import { makeProfitAnalysisRow } from "../../shared/profit-analysis";
import type {
  DeliveryType,
  ProfitAnalysisRow,
  ProfitAnalysisScope,
  ProfitAnalysisStatus,
} from "../../shared/contracts";
import { getSqliteDatabase } from "../database/database";

interface ProfitSourceRow {
  id: string;
  scope: ProfitAnalysisScope;
  product_id: string;
  product_internal_code: string;
  product_name: string;
  product_category: string;
  game: string | null;
  product_variant_id: string | null;
  variant_code: string | null;
  variant_name: string | null;
  sale_price_cents: number;
  unit_cost_cents: number;
  fee_percent: number;
  stock_current: number;
  stock_min: number;
  delivery_type: DeliveryType;
  supplier_name: string | null;
  status: ProfitAnalysisStatus;
  needs_review: number;
}

export interface ProfitRepositoryDiagnostics {
  totalProducts: number;
  totalVariants: number;
  activeVariants: number;
  parentOnlyProducts: number;
}

interface CountRow {
  total: number;
}

const centsToMoney = (value: number): number => Math.round(value) / 100;

const mapProfitSourceRow = (row: ProfitSourceRow): ProfitAnalysisRow =>
  makeProfitAnalysisRow({
    id: row.id,
    scope: row.scope,
    productId: row.product_id,
    productInternalCode: row.product_internal_code,
    productName: row.product_name,
    productCategory: row.product_category,
    game: row.game,
    productVariantId: row.product_variant_id,
    variantCode: row.variant_code,
    variantName: row.variant_name,
    salePrice: centsToMoney(row.sale_price_cents),
    unitCost: centsToMoney(row.unit_cost_cents),
    feePercent: row.fee_percent,
    stockCurrent: row.stock_current,
    stockMin: row.stock_min,
    deliveryType: row.delivery_type,
    supplierName: row.supplier_name,
    status: row.status,
    needsReview: Boolean(row.needs_review),
  });

const profitRowsSelect = `
  SELECT
    product_variants.id AS id,
    'variant' AS scope,
    products.id AS product_id,
    products.internal_code AS product_internal_code,
    products.name AS product_name,
    products.category AS product_category,
    products.game AS game,
    product_variants.id AS product_variant_id,
    product_variants.variant_code AS variant_code,
    product_variants.name AS variant_name,
    product_variants.sale_price_cents AS sale_price_cents,
    product_variants.unit_cost_cents AS unit_cost_cents,
    product_variants.fee_percent AS fee_percent,
    product_variants.stock_current AS stock_current,
    product_variants.stock_min AS stock_min,
    product_variants.delivery_type AS delivery_type,
    product_variants.supplier_name AS supplier_name,
    product_variants.status AS status,
    product_variants.needs_review AS needs_review
  FROM product_variants
  INNER JOIN products ON products.id = product_variants.product_id
  WHERE product_variants.status != 'archived'
    AND products.status != 'archived'

  UNION ALL

  SELECT
    products.id AS id,
    'product' AS scope,
    products.id AS product_id,
    products.internal_code AS product_internal_code,
    products.name AS product_name,
    products.category AS product_category,
    products.game AS game,
    NULL AS product_variant_id,
    NULL AS variant_code,
    NULL AS variant_name,
    products.sale_price_cents AS sale_price_cents,
    products.unit_cost_cents AS unit_cost_cents,
    products.fee_percent AS fee_percent,
    products.stock_current AS stock_current,
    products.stock_min AS stock_min,
    products.delivery_type AS delivery_type,
    products.supplier_id AS supplier_name,
    products.status AS status,
    0 AS needs_review
  FROM products
  WHERE products.status != 'archived'
    AND NOT EXISTS (
      SELECT 1
      FROM product_variants
      WHERE product_variants.product_id = products.id
        AND product_variants.status != 'archived'
    )
`;

export const profitRepository = {
  listRows(): ProfitAnalysisRow[] {
    const rows = getSqliteDatabase()
      .prepare(profitRowsSelect)
      .all() as ProfitSourceRow[];
    return rows.map(mapProfitSourceRow);
  },

  getDiagnostics(): ProfitRepositoryDiagnostics {
    const db = getSqliteDatabase();
    const totalProducts = db
      .prepare("SELECT COUNT(*) AS total FROM products")
      .get() as CountRow;
    const totalVariants = db
      .prepare("SELECT COUNT(*) AS total FROM product_variants")
      .get() as CountRow;
    const activeVariants = db
      .prepare(
        "SELECT COUNT(*) AS total FROM product_variants WHERE status != 'archived'",
      )
      .get() as CountRow;
    const parentOnlyProducts = db
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM products
          WHERE status != 'archived'
            AND NOT EXISTS (
              SELECT 1
              FROM product_variants
              WHERE product_variants.product_id = products.id
                AND product_variants.status != 'archived'
            )
        `,
      )
      .get() as CountRow;

    return {
      totalProducts: totalProducts.total,
      totalVariants: totalVariants.total,
      activeVariants: activeVariants.total,
      parentOnlyProducts: parentOnlyProducts.total,
    };
  },

  listCategories(): string[] {
    const rows = getSqliteDatabase()
      .prepare(
        `
          SELECT value
          FROM (
            SELECT category AS value FROM products WHERE category IS NOT NULL AND category != ''
            UNION
            SELECT game AS value FROM products WHERE game IS NOT NULL AND game != ''
          )
          ORDER BY LOWER(value) ASC
        `,
      )
      .all() as Array<{ value: string }>;

    return rows.map((row) => row.value);
  },

  listSuppliers(): string[] {
    const rows = getSqliteDatabase()
      .prepare(
        `
          SELECT value
          FROM (
            SELECT supplier_name AS value
            FROM product_variants
            WHERE supplier_name IS NOT NULL AND supplier_name != ''
            UNION
            SELECT supplier_id AS value
            FROM products
            WHERE supplier_id IS NOT NULL AND supplier_id != ''
          )
          ORDER BY LOWER(value) ASC
        `,
      )
      .all() as Array<{ value: string }>;

    return rows.map((row) => row.value);
  },
};
