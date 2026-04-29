import { GAMEMARKET_FEE_PERCENT } from "@hzdk/shared";
import { randomUUID } from "node:crypto";
import type { GameMarketSyncSummary } from "../../../shared/contracts";
import { getSqliteDatabase } from "../../database/database";
import { eventService } from "../../services/event-service";
import { GameMarketClient } from "./gamemarket-client";
import type { GameMarketOrderListItem, GameMarketProductListItem } from "./gamemarket-contracts";
import {
  buildImportedOrderNotes,
  buildImportedProductNotes,
  getGameMarketOrderExternalId,
  getGameMarketProductExternalId,
  hashExternalPayload,
  mapGameMarketProductStatus
} from "./gamemarket-mappers";
import { gameMarketSettingsService } from "./gamemarket-settings-service";
import { GameMarketDocsMissingError, toGameMarketSafeError } from "./gamemarket-errors";

const pageLimit = 100;
const maxPagesPerResource = 10;

interface ExternalProductRow {
  id: string;
  internal_code: string;
  external_payload_hash: string | null;
}

interface ExternalOrderRow {
  id: string;
  external_payload_hash: string | null;
}

interface ProductFinancials {
  netValueCents: number;
  profitCents: number;
  marginPercent: number;
}

interface LocalProductForOrder {
  id: string;
  name: string;
  category: string;
  game: string | null;
  unit_cost_cents: number;
  fee_percent: number;
}

const nowIso = (): string => new Date().toISOString();

const makeFinancials = (salePriceCents: number, unitCostCents: number, feePercent: number): ProductFinancials => {
  const netValueCents = Math.round(salePriceCents * (1 - feePercent / 100));
  const profitCents = netValueCents - unitCostCents;

  return {
    netValueCents,
    profitCents,
    marginPercent: salePriceCents === 0 ? 0 : profitCents / salePriceCents
  };
};

const makeUniqueCode = (prefix: string, externalId: string, table: "products" | "orders"): string => {
  const db = getSqliteDatabase();
  const column = table === "products" ? "internal_code" : "order_code";
  const base = `${prefix}-${externalId}`.toUpperCase().replace(/[^A-Z0-9-]/g, "-").slice(0, 42);
  let candidate = base;
  let counter = 1;

  while (db.prepare(`SELECT 1 FROM ${table} WHERE ${column} = ?`).get(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }

  return candidate;
};

const fetchAllProducts = async (client: GameMarketClient): Promise<{
  items: GameMarketProductListItem[];
  partialError: string | null;
}> => {
  const items: GameMarketProductListItem[] = [];
  let totalPages = 1;

  for (let page = 1; page <= Math.min(totalPages, maxPagesPerResource); page += 1) {
    const response = await client.listProducts(page, pageLimit);
    items.push(...response.data);
    totalPages = response.pagination.totalPages;
  }

  return {
    items,
    partialError:
      totalPages > maxPagesPerResource
        ? `Produtos limitados a ${maxPagesPerResource} páginas para respeitar rate limit.`
        : null
  };
};

const fetchAllOrders = async (client: GameMarketClient): Promise<{
  items: GameMarketOrderListItem[];
  partialError: string | null;
}> => {
  const items: GameMarketOrderListItem[] = [];
  let totalPages = 1;

  for (let page = 1; page <= Math.min(totalPages, maxPagesPerResource); page += 1) {
    const response = await client.listOrders(page, pageLimit);
    items.push(...response.data);
    totalPages = response.pagination.totalPages;
  }

  return {
    items,
    partialError:
      totalPages > maxPagesPerResource
        ? `Pedidos limitados a ${maxPagesPerResource} páginas para respeitar rate limit.`
        : null
  };
};

const findProductByExternalId = (externalId: string): ExternalProductRow | null => {
  const row = getSqliteDatabase()
    .prepare(
      `
        SELECT id, internal_code, external_payload_hash
        FROM products
        WHERE external_marketplace = 'gamemarket' AND external_product_id = ?
      `
    )
    .get(externalId) as ExternalProductRow | undefined;

  return row ?? null;
};

const findOrderByExternalId = (externalId: string): ExternalOrderRow | null => {
  const row = getSqliteDatabase()
    .prepare(
      `
        SELECT id, external_payload_hash
        FROM orders
        WHERE external_marketplace = 'gamemarket' AND external_order_id = ?
      `
    )
    .get(externalId) as ExternalOrderRow | undefined;

  return row ?? null;
};

const findLocalProductForOrder = (externalProductId: string): LocalProductForOrder | null => {
  const row = getSqliteDatabase()
    .prepare(
      `
        SELECT id, name, category, game, unit_cost_cents, fee_percent
        FROM products
        WHERE external_marketplace = 'gamemarket' AND external_product_id = ?
      `
    )
    .get(externalProductId) as LocalProductForOrder | undefined;

  return row ?? null;
};

const upsertProduct = (
  product: GameMarketProductListItem,
  actorUserId: string | null,
  syncedAt: string
): "imported" | "updated" | "unchanged" => {
  const db = getSqliteDatabase();
  const externalId = getGameMarketProductExternalId(product);
  const hash = hashExternalPayload(product);
  const existing = findProductByExternalId(externalId);

  if (existing) {
    if (existing.external_payload_hash === hash) {
      db.prepare("UPDATE products SET last_synced_at = ? WHERE id = ?").run(syncedAt, existing.id);
      return "unchanged";
    }

    db.prepare(
      `
        UPDATE products
        SET
          external_status = @externalStatus,
          external_payload_hash = @externalPayloadHash,
          last_synced_at = @lastSyncedAt,
          updated_by_user_id = @updatedByUserId,
          updated_at = @updatedAt
        WHERE id = @id
      `
    ).run({
      id: existing.id,
      externalStatus: product.status,
      externalPayloadHash: hash,
      lastSyncedAt: syncedAt,
      updatedByUserId: actorUserId,
      updatedAt: syncedAt
    });

    eventService.createInternal({
      source: "gamemarket_api",
      type: "integration.gamemarket.product_updated",
      severity: "info",
      title: "Produto GameMarket atualizado",
      message: `Produto externo ${externalId} teve metadados sincronizados.`,
      productId: existing.id,
      actorUserId,
      rawPayload: {
        externalProductId: externalId,
        externalStatus: product.status,
        externalPayloadHash: hash
      }
    });
    return "updated";
  }

  const financials = makeFinancials(product.price, 0, GAMEMARKET_FEE_PERCENT);
  const id = randomUUID();
  const internalCode = makeUniqueCode("GMK-PRD", externalId, "products");

  db.prepare(
    `
      INSERT INTO products (
        id,
        internal_code,
        external_id,
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
        external_marketplace,
        external_product_id,
        external_status,
        external_payload_hash,
        last_synced_at,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      )
      VALUES (
        @id,
        @internalCode,
        @externalId,
        @name,
        @category,
        @game,
        NULL,
        NULL,
        @salePriceCents,
        0,
        @feePercent,
        @netValueCents,
        @profitCents,
        @marginPercent,
        0,
        1,
        @status,
        @deliveryType,
        NULL,
        @notes,
        'gamemarket',
        @externalProductId,
        @externalStatus,
        @externalPayloadHash,
        @lastSyncedAt,
        @createdByUserId,
        @updatedByUserId,
        @createdAt,
        @updatedAt
      )
    `
  ).run({
    id,
    internalCode,
    externalId,
    name: product.title,
    category: product.category || product.game || "GameMarket",
    game: product.game || null,
    salePriceCents: product.price,
    feePercent: GAMEMARKET_FEE_PERCENT,
    ...financials,
    status: mapGameMarketProductStatus(product.status),
    deliveryType: product.isAutoDelivery ? "automatic" : "manual",
    notes: buildImportedProductNotes(product),
    externalProductId: externalId,
    externalStatus: product.status,
    externalPayloadHash: hash,
    lastSyncedAt: syncedAt,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    createdAt: syncedAt,
    updatedAt: syncedAt
  });

  eventService.createInternal({
    source: "gamemarket_api",
    type: "integration.gamemarket.product_imported",
    severity: "success",
    title: "Produto GameMarket importado",
    message: `Produto externo ${externalId} foi associado ao produto local ${internalCode}.`,
    productId: id,
    actorUserId,
    rawPayload: {
      externalProductId: externalId,
      externalStatus: product.status,
      externalPayloadHash: hash
    }
  });

  return "imported";
};

const upsertOrder = (
  order: GameMarketOrderListItem,
  actorUserId: string | null,
  syncedAt: string
): "imported" | "updated" | "unchanged" => {
  const db = getSqliteDatabase();
  const externalId = getGameMarketOrderExternalId(order);
  const hash = hashExternalPayload(order);
  const existing = findOrderByExternalId(externalId);

  if (existing) {
    if (existing.external_payload_hash === hash) {
      db.prepare("UPDATE orders SET last_synced_at = ? WHERE id = ?").run(syncedAt, existing.id);
      return "unchanged";
    }

    db.prepare(
      `
        UPDATE orders
        SET
          external_status = @externalStatus,
          external_payload_hash = @externalPayloadHash,
          last_synced_at = @lastSyncedAt,
          updated_by_user_id = @updatedByUserId,
          updated_at = @updatedAt
        WHERE id = @id
      `
    ).run({
      id: existing.id,
      externalStatus: order.status,
      externalPayloadHash: hash,
      lastSyncedAt: syncedAt,
      updatedByUserId: actorUserId,
      updatedAt: syncedAt
    });

    eventService.createInternal({
      source: "gamemarket_api",
      type: "integration.gamemarket.order_updated",
      severity: "info",
      title: "Pedido GameMarket atualizado",
      message: `Pedido externo ${externalId} teve metadados sincronizados.`,
      orderId: existing.id,
      actorUserId,
      rawPayload: {
        externalOrderId: externalId,
        externalStatus: order.status,
        externalPayloadHash: hash
      }
    });
    return "updated";
  }

  const product = findLocalProductForOrder(String(order.productId));
  if (!product) {
    throw new Error(`Produto externo ${order.productId} não encontrado para pedido ${externalId}.`);
  }

  const financials = makeFinancials(order.price, product.unit_cost_cents, product.fee_percent);
  const id = randomUUID();
  const orderCode = makeUniqueCode("GMK-ORD", externalId, "orders");
  const createdAt = order.createdAt || syncedAt;

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
        'gamemarket',
        'gamemarket',
        @externalStatus,
        @externalPayloadHash,
        @lastSyncedAt,
        @productId,
        NULL,
        NULL,
        @buyerName,
        NULL,
        @productNameSnapshot,
        @categorySnapshot,
        @salePriceCents,
        @unitCostCents,
        @feePercent,
        @netValueCents,
        @profitCents,
        @marginPercent,
        'draft',
        0,
        NULL,
        @notes,
        @createdByUserId,
        @updatedByUserId,
        @createdAt,
        @updatedAt,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL
      )
    `
  ).run({
    id,
    orderCode,
    externalOrderId: externalId,
    externalStatus: order.status,
    externalPayloadHash: hash,
    lastSyncedAt: syncedAt,
    productId: product.id,
    buyerName: order.buyerName ?? null,
    productNameSnapshot: product.name,
    categorySnapshot: product.game ?? product.category,
    salePriceCents: order.price,
    unitCostCents: product.unit_cost_cents,
    feePercent: product.fee_percent,
    ...financials,
    notes: buildImportedOrderNotes(order),
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    createdAt,
    updatedAt: syncedAt
  });

  eventService.createInternal({
    source: "gamemarket_api",
    type: "integration.gamemarket.order_imported",
    severity: "warning",
    title: "Pedido GameMarket importado",
    message: `Pedido externo ${externalId} foi importado para revisão manual.`,
    orderId: id,
    productId: product.id,
    actorUserId,
    rawPayload: {
      externalOrderId: externalId,
      externalStatus: order.status,
      externalPayloadHash: hash
    }
  });

  return "imported";
};

const makeFailedSummary = (startedAt: string, error: string): GameMarketSyncSummary => {
  const finishedAt = nowIso();
  return {
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    status: "failed",
    productsFound: 0,
    ordersFound: 0,
    productsNew: 0,
    productsUpdated: 0,
    ordersNew: 0,
    ordersUpdated: 0,
    errors: [error]
  };
};

export const gameMarketSyncService = {
  async syncNow(actorUserId: string | null = null): Promise<GameMarketSyncSummary> {
    const startedAt = nowIso();
    eventService.createInternal({
      source: "gamemarket_api",
      type: "integration.gamemarket.sync_started",
      severity: "info",
      title: "Sync GameMarket iniciado",
      message: "Sincronização manual de leitura iniciada.",
      actorUserId
    });

    try {
      const settings = gameMarketSettingsService.getSettings();
      if (settings.documentation.status !== "available") {
        throw new GameMarketDocsMissingError({
          documentationStatus: settings.documentation.status,
          missing: settings.documentation.missing
        });
      }

      const token = gameMarketSettingsService.getTokenForRequest();
      if (!token) {
        throw new Error("Token GameMarket não configurado.");
      }

      const client = new GameMarketClient({
        baseUrl: settings.apiBaseUrl,
        apiKey: token
      });
      const [productsResult, ordersResult] = await Promise.all([
        fetchAllProducts(client),
        fetchAllOrders(client)
      ]);
      const syncedAt = nowIso();
      const errors = [productsResult.partialError, ordersResult.partialError].filter(Boolean) as string[];
      const summary: GameMarketSyncSummary = {
        startedAt,
        finishedAt: syncedAt,
        durationMs: Date.parse(syncedAt) - Date.parse(startedAt),
        status: "synced",
        productsFound: productsResult.items.length,
        ordersFound: ordersResult.items.length,
        productsNew: 0,
        productsUpdated: 0,
        ordersNew: 0,
        ordersUpdated: 0,
        errors
      };

      for (const product of productsResult.items) {
        try {
          const result = upsertProduct(product, actorUserId, syncedAt);
          if (result === "imported") {
            summary.productsNew += 1;
          }
          if (result === "updated") {
            summary.productsUpdated += 1;
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Falha ao importar produto.");
        }
      }

      for (const order of ordersResult.items) {
        try {
          const result = upsertOrder(order, actorUserId, syncedAt);
          if (result === "imported") {
            summary.ordersNew += 1;
          }
          if (result === "updated") {
            summary.ordersUpdated += 1;
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Falha ao importar pedido.");
        }
      }

      summary.status = errors.length > 0 ? "partial" : "synced";
      gameMarketSettingsService.saveLastSyncSummary(summary);
      gameMarketSettingsService.markSyncResult(summary.status, summary.finishedAt, errors[0] ?? null);
      eventService.createInternal({
        source: "gamemarket_api",
        type: "integration.gamemarket.sync_completed",
        severity: summary.status === "partial" ? "warning" : "success",
        title: summary.status === "partial" ? "Sync GameMarket parcial" : "Sync GameMarket concluído",
        message: `${summary.productsFound} produto(s) e ${summary.ordersFound} pedido(s) lidos.`,
        actorUserId,
        rawPayload: summary
      });

      return summary;
    } catch (error) {
      const safeError = toGameMarketSafeError(error);
      const summary = makeFailedSummary(startedAt, safeError.safeMessage);
      gameMarketSettingsService.saveLastSyncSummary(summary);
      gameMarketSettingsService.markSyncResult("error", null, safeError.safeMessage);
      eventService.createInternal({
        source: "gamemarket_api",
        type: "integration.gamemarket.sync_failed",
        severity: "critical",
        title: "Sync GameMarket falhou",
        message: safeError.safeMessage,
        actorUserId,
        rawPayload: safeError
      });

      return summary;
    }
  }
};
