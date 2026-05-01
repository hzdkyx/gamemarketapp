import { getSqliteDatabase } from "../database/database";
import { toSqliteBoolean } from "../database/sqlite-values";
import type {
  Marketplace,
  OrderListInput,
  OrderRecord,
  OrderStatus,
  OrderSummary
} from "../../shared/contracts";
import { centsToMoney } from "../services/money";

interface OrderRow {
  id: string;
  order_code: string;
  external_order_id: string | null;
  marketplace: Marketplace;
  external_marketplace: Marketplace | null;
  external_status: string | null;
  external_payload_hash: string | null;
  last_synced_at: string | null;
  product_id: string;
  product_variant_id: string | null;
  product_variant_code: string | null;
  product_variant_name: string | null;
  variant_pending: number;
  inventory_item_id: string | null;
  inventory_code: string | null;
  buyer_name: string | null;
  buyer_contact: string | null;
  product_name_snapshot: string;
  category_snapshot: string;
  sale_price_cents: number;
  unit_cost_cents: number;
  fee_percent: number;
  net_value_cents: number;
  profit_cents: number;
  margin_percent: number;
  status: OrderStatus;
  action_required: number;
  marketplace_url: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
}

export interface OrderWriteRecord {
  id: string;
  orderCode: string;
  externalOrderId: string | null;
  marketplace: Marketplace;
  externalMarketplace: Marketplace | null;
  externalStatus: string | null;
  externalPayloadHash: string | null;
  lastSyncedAt: string | null;
  productId: string;
  productVariantId: string | null;
  inventoryItemId: string | null;
  buyerName: string | null;
  buyerContact: string | null;
  productNameSnapshot: string;
  categorySnapshot: string;
  salePriceCents: number;
  unitCostCents: number;
  feePercent: number;
  netValueCents: number;
  profitCents: number;
  marginPercent: number;
  status: OrderStatus;
  actionRequired: boolean;
  marketplaceUrl: string | null;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
}

const mapOrderRow = (row: OrderRow): OrderRecord => ({
  id: row.id,
  orderCode: row.order_code,
  externalOrderId: row.external_order_id,
  marketplace: row.marketplace,
  externalMarketplace: row.external_marketplace,
  externalStatus: row.external_status,
  externalPayloadHash: row.external_payload_hash,
  lastSyncedAt: row.last_synced_at,
  productId: row.product_id,
  productVariantId: row.product_variant_id,
  productVariantCode: row.product_variant_code,
  productVariantName: row.product_variant_name,
  variantPending: Boolean(row.variant_pending),
  inventoryItemId: row.inventory_item_id,
  inventoryCode: row.inventory_code,
  buyerName: row.buyer_name,
  buyerContact: row.buyer_contact,
  productNameSnapshot: row.product_name_snapshot,
  categorySnapshot: row.category_snapshot,
  salePrice: centsToMoney(row.sale_price_cents),
  unitCost: centsToMoney(row.unit_cost_cents),
  feePercent: row.fee_percent,
  netValue: centsToMoney(row.net_value_cents),
  profit: centsToMoney(row.profit_cents),
  marginPercent: row.margin_percent,
  status: row.status,
  actionRequired: Boolean(row.action_required),
  marketplaceUrl: row.marketplace_url,
  notes: row.notes,
  createdByUserId: row.created_by_user_id,
  updatedByUserId: row.updated_by_user_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  confirmedAt: row.confirmed_at,
  deliveredAt: row.delivered_at,
  completedAt: row.completed_at,
  cancelledAt: row.cancelled_at,
  refundedAt: row.refunded_at
});

const orderSelect = `
  SELECT
    orders.id,
    orders.order_code,
    orders.external_order_id,
    orders.marketplace,
    orders.external_marketplace,
    orders.external_status,
    orders.external_payload_hash,
    orders.last_synced_at,
    orders.product_id,
    orders.product_variant_id,
    product_variants.variant_code AS product_variant_code,
    product_variants.name AS product_variant_name,
    CASE
      WHEN orders.product_variant_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM product_variants variants_for_order
          WHERE variants_for_order.product_id = orders.product_id
            AND variants_for_order.status != 'archived'
        )
        THEN 1
      ELSE 0
    END AS variant_pending,
    orders.inventory_item_id,
    inventory_items.inventory_code,
    orders.buyer_name,
    orders.buyer_contact,
    orders.product_name_snapshot,
    orders.category_snapshot,
    orders.sale_price_cents,
    orders.unit_cost_cents,
    orders.fee_percent,
    orders.net_value_cents,
    orders.profit_cents,
    orders.margin_percent,
    orders.status,
    orders.action_required,
    orders.marketplace_url,
    orders.notes,
    orders.created_by_user_id,
    orders.updated_by_user_id,
    orders.created_at,
    orders.updated_at,
    orders.confirmed_at,
    orders.delivered_at,
    orders.completed_at,
    orders.cancelled_at,
    orders.refunded_at
  FROM orders
  LEFT JOIN inventory_items ON inventory_items.id = orders.inventory_item_id
  LEFT JOIN product_variants ON product_variants.id = orders.product_variant_id
`;

const orderBy: Record<OrderListInput["sortBy"], string> = {
  date: "orders.created_at",
  value: "orders.sale_price_cents",
  profit: "orders.profit_cents",
  status: "orders.status",
  product: "LOWER(orders.product_name_snapshot)"
};

const buildOrderWhere = (filters: OrderListInput): { sql: string; params: Record<string, unknown> } => {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.search) {
    where.push(`(
      LOWER(orders.id) LIKE @search OR
      LOWER(orders.order_code) LIKE @search OR
      LOWER(COALESCE(orders.external_order_id, '')) LIKE @search OR
      LOWER(COALESCE(orders.buyer_name, '')) LIKE @search OR
      LOWER(COALESCE(orders.buyer_contact, '')) LIKE @search OR
      LOWER(orders.product_name_snapshot) LIKE @search OR
      LOWER(COALESCE(product_variants.name, '')) LIKE @search OR
      LOWER(COALESCE(product_variants.variant_code, '')) LIKE @search OR
      LOWER(orders.category_snapshot) LIKE @search OR
      LOWER(orders.status) LIKE @search OR
      LOWER(COALESCE(orders.notes, '')) LIKE @search
    )`);
    params.search = `%${filters.search.toLowerCase()}%`;
  }

  if (filters.status !== "all") {
    where.push("orders.status = @status");
    params.status = filters.status;
  }

  if (filters.productId) {
    where.push("orders.product_id = @productId");
    params.productId = filters.productId;
  }

  if (filters.category) {
    where.push("orders.category_snapshot = @category");
    params.category = filters.category;
  }

  if (filters.dateFrom) {
    where.push("orders.created_at >= @dateFrom");
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    where.push("orders.created_at <= @dateTo");
    params.dateTo = filters.dateTo;
  }

  if (filters.actionRequired === "pending") {
    where.push("orders.action_required = 1");
  }

  if (filters.actionRequired === "clear") {
    where.push("orders.action_required = 0");
  }

  return {
    sql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
};

export const orderRepository = {
  list(filters: OrderListInput): OrderRecord[] {
    const db = getSqliteDatabase();
    const where = buildOrderWhere(filters);
    const direction = filters.sortDirection === "asc" ? "ASC" : "DESC";
    const rows = db
      .prepare(
        `${orderSelect} ${where.sql} ORDER BY ${orderBy[filters.sortBy]} ${direction}, orders.created_at DESC`
      )
      .all(where.params) as OrderRow[];

    return rows.map(mapOrderRow);
  },

  getById(id: string): OrderRecord | null {
    const db = getSqliteDatabase();
    const row = db.prepare(`${orderSelect} WHERE orders.id = ?`).get(id) as OrderRow | undefined;
    return row ? mapOrderRow(row) : null;
  },

  getByOrderCode(orderCode: string): OrderRecord | null {
    const db = getSqliteDatabase();
    const row = db
      .prepare(`${orderSelect} WHERE orders.order_code = ?`)
      .get(orderCode) as OrderRow | undefined;
    return row ? mapOrderRow(row) : null;
  },

  insert(order: OrderWriteRecord): OrderRecord {
    const db = getSqliteDatabase();
    db.prepare(
      `
        INSERT INTO orders (
          id,
          order_code,
          external_order_id,
          marketplace,
          external_marketplace,
          external_status,
          external_payload_hash,
          last_synced_at,
          product_id,
          product_variant_id,
          inventory_item_id,
          buyer_name,
          buyer_contact,
          product_name_snapshot,
          category_snapshot,
          sale_price_cents,
          unit_cost_cents,
          fee_percent,
          net_value_cents,
          profit_cents,
          margin_percent,
          status,
          action_required,
          marketplace_url,
          notes,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at,
          confirmed_at,
          delivered_at,
          completed_at,
          cancelled_at,
          refunded_at
        )
        VALUES (
          @id,
          @orderCode,
          @externalOrderId,
          @marketplace,
          @externalMarketplace,
          @externalStatus,
          @externalPayloadHash,
          @lastSyncedAt,
          @productId,
          @productVariantId,
          @inventoryItemId,
          @buyerName,
          @buyerContact,
          @productNameSnapshot,
          @categorySnapshot,
          @salePriceCents,
          @unitCostCents,
          @feePercent,
          @netValueCents,
          @profitCents,
          @marginPercent,
          @status,
          @actionRequired,
          @marketplaceUrl,
          @notes,
          @createdByUserId,
          @updatedByUserId,
          @createdAt,
          @updatedAt,
          @confirmedAt,
          @deliveredAt,
          @completedAt,
          @cancelledAt,
          @refundedAt
        )
      `
    ).run({ ...order, actionRequired: toSqliteBoolean(order.actionRequired) });

    const created = this.getById(order.id);
    if (!created) {
      throw new Error("Pedido não foi criado.");
    }

    return created;
  },

  update(order: OrderWriteRecord): OrderRecord {
    const db = getSqliteDatabase();
    db.prepare(
      `
        UPDATE orders
        SET
          order_code = @orderCode,
          external_order_id = @externalOrderId,
          marketplace = @marketplace,
          external_marketplace = @externalMarketplace,
          external_status = @externalStatus,
          external_payload_hash = @externalPayloadHash,
          last_synced_at = @lastSyncedAt,
          product_id = @productId,
          product_variant_id = @productVariantId,
          inventory_item_id = @inventoryItemId,
          buyer_name = @buyerName,
          buyer_contact = @buyerContact,
          product_name_snapshot = @productNameSnapshot,
          category_snapshot = @categorySnapshot,
          sale_price_cents = @salePriceCents,
          unit_cost_cents = @unitCostCents,
          fee_percent = @feePercent,
          net_value_cents = @netValueCents,
          profit_cents = @profitCents,
          margin_percent = @marginPercent,
          status = @status,
          action_required = @actionRequired,
          marketplace_url = @marketplaceUrl,
          notes = @notes,
          created_by_user_id = @createdByUserId,
          updated_by_user_id = @updatedByUserId,
          sync_status = 'pending',
          updated_at = @updatedAt,
          confirmed_at = @confirmedAt,
          delivered_at = @deliveredAt,
          completed_at = @completedAt,
          cancelled_at = @cancelledAt,
          refunded_at = @refundedAt
        WHERE id = @id
      `
    ).run({ ...order, actionRequired: toSqliteBoolean(order.actionRequired) });

    const updated = this.getById(order.id);
    if (!updated) {
      throw new Error("Pedido não foi atualizado.");
    }

    return updated;
  },

  delete(id: string): boolean {
    const db = getSqliteDatabase();
    const result = db.prepare("DELETE FROM orders WHERE id = ?").run(id);
    return result.changes > 0;
  },

  getSummary(): OrderSummary {
    const db = getSqliteDatabase();
    const row = db
      .prepare(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN action_required = 1 THEN 1 ELSE 0 END) AS pending_action,
            SUM(CASE WHEN status IN ('mediation', 'problem') THEN 1 ELSE 0 END) AS problem_or_mediation,
            SUM(sale_price_cents) AS gross_revenue_cents,
            SUM(net_value_cents) AS net_revenue_cents,
            SUM(profit_cents) AS estimated_profit_cents
          FROM orders
          WHERE status != 'archived'
        `
      )
      .get() as {
      total: number;
      pending_action: number | null;
      problem_or_mediation: number | null;
      gross_revenue_cents: number | null;
      net_revenue_cents: number | null;
      estimated_profit_cents: number | null;
    };

    return {
      total: row.total ?? 0,
      pendingAction: row.pending_action ?? 0,
      problemOrMediation: row.problem_or_mediation ?? 0,
      grossRevenue: centsToMoney(row.gross_revenue_cents),
      netRevenue: centsToMoney(row.net_revenue_cents),
      estimatedProfit: centsToMoney(row.estimated_profit_cents)
    };
  }
};
