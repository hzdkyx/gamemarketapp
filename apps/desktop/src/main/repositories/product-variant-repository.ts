import { getSqliteDatabase } from "../database/database";
import { toSqliteBoolean, toSqliteDate, toSqliteNullable } from "../database/sqlite-values";
import type {
  DeliveryType,
  ProductVariantRecord,
  ProductVariantSource,
  ProductVariantStatus
} from "../../shared/contracts";

interface ProductVariantRow {
  id: string;
  product_id: string;
  variant_code: string;
  name: string;
  description: string | null;
  sale_price_cents: number;
  unit_cost_cents: number;
  fee_percent: number;
  net_value_cents: number;
  estimated_profit_cents: number;
  margin_percent: number;
  stock_current: number;
  stock_min: number;
  supplier_name: string | null;
  supplier_url: string | null;
  delivery_type: DeliveryType;
  status: ProductVariantStatus;
  notes: string | null;
  source: ProductVariantSource;
  needs_review: number;
  manually_edited_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductVariantWriteRecord {
  id: string;
  productId: string;
  variantCode: string;
  name: string;
  description: string | null;
  salePriceCents: number;
  unitCostCents: number;
  feePercent: number;
  netValueCents: number;
  estimatedProfitCents: number;
  marginPercent: number;
  stockCurrent: number;
  stockMin: number;
  supplierName: string | null;
  supplierUrl: string | null;
  deliveryType: DeliveryType;
  status: ProductVariantStatus;
  notes: string | null;
  source: ProductVariantSource;
  needsReview: boolean;
  manuallyEditedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const centsToMoney = (value: number): number => Math.round(value) / 100;
const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const mapProductVariantRow = (row: ProductVariantRow): ProductVariantRecord => {
  const unitCost = centsToMoney(row.unit_cost_cents);
  const netRate = 1 - row.fee_percent / 100;

  return {
    id: row.id,
    productId: row.product_id,
    variantCode: row.variant_code,
    name: row.name,
    description: row.description,
    salePrice: centsToMoney(row.sale_price_cents),
    unitCost,
    feePercent: row.fee_percent,
    netValue: centsToMoney(row.net_value_cents),
    estimatedProfit: centsToMoney(row.estimated_profit_cents),
    marginPercent: row.margin_percent,
    minimumPrice: netRate <= 0 ? 0 : roundMoney(unitCost / netRate),
    stockCurrent: row.stock_current,
    stockMin: row.stock_min,
    supplierName: row.supplier_name,
    supplierUrl: row.supplier_url,
    deliveryType: row.delivery_type,
    status: row.status,
    notes: row.notes,
    source: row.source,
    needsReview: Boolean(row.needs_review),
    manuallyEditedAt: row.manually_edited_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const variantSelect = `
  SELECT
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
  FROM product_variants
`;

const toSqliteProductVariantWriteRecord = (variant: ProductVariantWriteRecord) => ({
  id: variant.id,
  productId: variant.productId,
  variantCode: variant.variantCode,
  name: variant.name,
  description: toSqliteNullable(variant.description),
  salePriceCents: variant.salePriceCents,
  unitCostCents: variant.unitCostCents,
  feePercent: variant.feePercent,
  netValueCents: variant.netValueCents,
  estimatedProfitCents: variant.estimatedProfitCents,
  marginPercent: variant.marginPercent,
  stockCurrent: variant.stockCurrent,
  stockMin: variant.stockMin,
  supplierName: toSqliteNullable(variant.supplierName),
  supplierUrl: toSqliteNullable(variant.supplierUrl),
  deliveryType: variant.deliveryType,
  status: variant.status,
  notes: toSqliteNullable(variant.notes),
  source: variant.source,
  needsReview: toSqliteBoolean(variant.needsReview),
  manuallyEditedAt: toSqliteDate(variant.manuallyEditedAt),
  createdAt: toSqliteDate(variant.createdAt),
  updatedAt: toSqliteDate(variant.updatedAt)
});

export const productVariantRepository = {
  listByProductId(productId: string): ProductVariantRecord[] {
    const rows = getSqliteDatabase()
      .prepare(`${variantSelect} WHERE product_id = ? ORDER BY LOWER(name) ASC`)
      .all(productId) as ProductVariantRow[];

    return rows.map(mapProductVariantRow);
  },

  listAllForSelect(): Array<
    Pick<
      ProductVariantRecord,
      "id" | "productId" | "variantCode" | "name" | "salePrice" | "unitCost" | "deliveryType" | "status"
    >
  > {
    const rows = getSqliteDatabase()
      .prepare(
        `${variantSelect} WHERE status != 'archived' ORDER BY product_id ASC, LOWER(name) ASC`
      )
      .all() as ProductVariantRow[];

    return rows.map((row) => {
      const variant = mapProductVariantRow(row);
      return {
        id: variant.id,
        productId: variant.productId,
        variantCode: variant.variantCode,
        name: variant.name,
        salePrice: variant.salePrice,
        unitCost: variant.unitCost,
        deliveryType: variant.deliveryType,
        status: variant.status
      };
    });
  },

  getById(id: string): ProductVariantRecord | null {
    const row = getSqliteDatabase()
      .prepare(`${variantSelect} WHERE id = ?`)
      .get(id) as ProductVariantRow | undefined;

    return row ? mapProductVariantRow(row) : null;
  },

  getByVariantCode(variantCode: string): ProductVariantRecord | null {
    const row = getSqliteDatabase()
      .prepare(`${variantSelect} WHERE variant_code = ?`)
      .get(variantCode) as ProductVariantRow | undefined;

    return row ? mapProductVariantRow(row) : null;
  },

  hasActiveVariants(productId: string): boolean {
    return Boolean(
      getSqliteDatabase()
        .prepare("SELECT 1 FROM product_variants WHERE product_id = ? AND status != 'archived' LIMIT 1")
        .get(productId)
    );
  },

  insert(variant: ProductVariantWriteRecord): ProductVariantRecord {
    getSqliteDatabase()
      .prepare(
        `
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
            @status,
            @notes,
            @source,
            @needsReview,
            @manuallyEditedAt,
            @createdAt,
            @updatedAt
          )
        `
      )
      .run(toSqliteProductVariantWriteRecord(variant));

    const created = this.getById(variant.id);
    if (!created) {
      throw new Error("Variação não foi criada.");
    }

    return created;
  },

  update(variant: ProductVariantWriteRecord): ProductVariantRecord {
    getSqliteDatabase()
      .prepare(
        `
          UPDATE product_variants
          SET
            product_id = @productId,
            variant_code = @variantCode,
            name = @name,
            description = @description,
            sale_price_cents = @salePriceCents,
            unit_cost_cents = @unitCostCents,
            fee_percent = @feePercent,
            net_value_cents = @netValueCents,
            estimated_profit_cents = @estimatedProfitCents,
            margin_percent = @marginPercent,
            stock_current = @stockCurrent,
            stock_min = @stockMin,
            supplier_name = @supplierName,
            supplier_url = @supplierUrl,
            delivery_type = @deliveryType,
            status = @status,
            notes = @notes,
            source = @source,
            needs_review = @needsReview,
            manually_edited_at = @manuallyEditedAt,
            updated_at = @updatedAt
          WHERE id = @id
        `
      )
      .run(toSqliteProductVariantWriteRecord(variant));

    const updated = this.getById(variant.id);
    if (!updated) {
      throw new Error("Variação não foi atualizada.");
    }

    return updated;
  },

  delete(id: string): boolean {
    const result = getSqliteDatabase().prepare("DELETE FROM product_variants WHERE id = ?").run(id);
    return result.changes > 0;
  }
};
