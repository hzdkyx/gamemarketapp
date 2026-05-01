import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "../../../shared/contracts";
import type { GameMarketOrderListItem } from "./gamemarket-contracts";

interface SyncedOrderRow {
  id: string;
  order_code: string;
  external_order_id: string;
  external_payload_hash: string | null;
  external_status: string | null;
  status: OrderStatus;
  action_required: number;
  last_synced_at: string | null;
  confirmed_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
}

const state = vi.hoisted(() => ({
  remoteOrders: [] as GameMarketOrderListItem[],
  productsByExternalId: new Map<
    string,
    {
      id: string;
      name: string;
      category: string;
      game: string | null;
      unit_cost_cents: number;
      fee_percent: number;
      active_variant_count: number;
    }
  >(),
  ordersByExternalId: new Map<string, SyncedOrderRow>(),
  events: [] as Array<{ type: string; orderId?: string | null; rawPayload?: unknown }>,
  notifications: [] as Array<{
    type: string;
    dedupeKey?: string | null;
    message?: string;
    playSound?: boolean;
    metadata?: unknown;
  }>,
  documentationStatus: "available" as "available" | "missing" | "incomplete"
}));

const findOrderById = (id: string): SyncedOrderRow | undefined =>
  [...state.ordersByExternalId.values()].find((order) => order.id === id);

vi.mock("../../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: (sql: string) => {
      if (sql.includes("FROM orders") && sql.includes("external_order_id = ?")) {
        return {
          get: (externalOrderId: string) => state.ordersByExternalId.get(externalOrderId)
        };
      }

      if (sql.includes("FROM products") && sql.includes("external_product_id = ?")) {
        return {
          get: (externalProductId: string) => state.productsByExternalId.get(externalProductId)
        };
      }

      if (sql.includes("SELECT 1 FROM orders WHERE order_code = ?")) {
        return {
          get: (orderCode: string) =>
            [...state.ordersByExternalId.values()].some((order) => order.order_code === orderCode)
              ? { exists: 1 }
              : undefined
        };
      }

      if (sql.includes("UPDATE orders SET last_synced_at = ?")) {
        return {
          run: (lastSyncedAt: string, id: string) => {
            const order = findOrderById(id);
            if (order) {
              order.last_synced_at = lastSyncedAt;
            }
            return { changes: order ? 1 : 0 };
          }
        };
      }

      if (sql.includes("UPDATE orders") && sql.includes("status = @status")) {
        return {
          run: (params: {
            id: string;
            externalStatus: string;
            externalPayloadHash: string;
            lastSyncedAt: string;
            status: OrderStatus;
            actionRequired: number;
            confirmedAt: string;
            deliveredAt: string;
            completedAt: string;
          }) => {
            const order = findOrderById(params.id);
            if (order) {
              order.external_status = params.externalStatus;
              order.external_payload_hash = params.externalPayloadHash;
              order.last_synced_at = params.lastSyncedAt;
              order.status = params.status;
              order.action_required = params.actionRequired;
              order.confirmed_at ??= params.confirmedAt;
              if (params.status === "delivered") {
                order.delivered_at ??= params.deliveredAt;
              }
              if (params.status === "completed") {
                order.completed_at ??= params.completedAt;
              }
            }
            return { changes: order ? 1 : 0 };
          }
        };
      }

      if (sql.includes("UPDATE orders") && sql.includes("status = 'delivered'")) {
        return {
          run: (params: {
            id: string;
            externalStatus: string;
            externalPayloadHash: string;
            lastSyncedAt: string;
            deliveredAt: string;
          }) => {
            const order = findOrderById(params.id);
            if (order) {
              order.external_status = params.externalStatus;
              order.external_payload_hash = params.externalPayloadHash;
              order.last_synced_at = params.lastSyncedAt;
              order.status = "delivered";
              order.action_required = 0;
              order.delivered_at ??= order.completed_at ?? params.deliveredAt;
              order.completed_at = null;
            }
            return { changes: order ? 1 : 0 };
          }
        };
      }

      if (sql.includes("UPDATE orders") && sql.includes("external_status = @externalStatus")) {
        return {
          run: (params: {
            id: string;
            externalStatus: string;
            externalPayloadHash: string;
            lastSyncedAt: string;
          }) => {
            const order = findOrderById(params.id);
            if (order) {
              order.external_status = params.externalStatus;
              order.external_payload_hash = params.externalPayloadHash;
              order.last_synced_at = params.lastSyncedAt;
            }
            return { changes: order ? 1 : 0 };
          }
        };
      }

      if (sql.includes("INSERT INTO orders")) {
        return {
          run: (params: {
            id: string;
            orderCode: string;
            externalOrderId: string;
            externalStatus: string;
            externalPayloadHash: string;
            lastSyncedAt: string;
            status: OrderStatus;
            actionRequired: number;
            confirmedAt: string | null;
            deliveredAt: string | null;
            completedAt: string | null;
          }) => {
            state.ordersByExternalId.set(params.externalOrderId, {
              id: params.id,
              order_code: params.orderCode,
              external_order_id: params.externalOrderId,
              external_payload_hash: params.externalPayloadHash,
              external_status: params.externalStatus,
              status: params.status,
              action_required: params.actionRequired,
              last_synced_at: params.lastSyncedAt,
              confirmed_at: params.confirmedAt,
              delivered_at: params.deliveredAt,
              completed_at: params.completedAt
            });
            return { changes: 1 };
          }
        };
      }

      throw new Error(`Unexpected SQL in GameMarket sync test: ${sql}`);
    }
  })
}));

vi.mock("../../services/event-service", () => ({
  eventService: {
    createInternal: (input: { type: string; orderId?: string | null; rawPayload?: unknown }) => {
      state.events.push(input);
      return { id: `event-${state.events.length}`, ...input };
    }
  }
}));

vi.mock("../../services/local-notification-service", () => ({
  localNotificationService: {
    notify: vi.fn(
      (input: {
        type: string;
        dedupeKey?: string | null;
        message?: string;
        playSound?: boolean;
        metadata?: unknown;
      }) => {
        state.notifications.push(input);
        return {
          created: true,
          nativeShown: false,
          notification: {
            id: `notification-${state.notifications.length}`,
            type: input.type,
            severity: "info",
            title: "Teste",
            message: input.message ?? "",
            orderId: null,
            externalOrderId: null,
            eventId: null,
            dedupeKey: input.dedupeKey ?? null,
            readAt: null,
            createdAt: new Date(0).toISOString(),
            metadataJson: null
          }
        };
      }
    )
  }
}));

vi.mock("./gamemarket-settings-service", () => ({
  isGameMarketConfigured: (settings: { apiBaseUrl?: string; hasToken?: boolean }) =>
    Boolean(settings.apiBaseUrl && settings.hasToken !== false),
  gameMarketSettingsService: {
    getSettings: () => ({
      apiBaseUrl: "https://gamemarket.com.br",
      hasToken: true,
      documentation: {
        status: state.documentationStatus,
        missing: []
      }
    }),
    getTokenForRequest: () => "gm_sk_test",
    saveLastSyncSummary: vi.fn(),
    markSyncResult: vi.fn()
  }
}));

vi.mock("./gamemarket-client", () => ({
  GameMarketClient: class {
    async listProducts(): Promise<{
      data: [];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }> {
      return {
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 1 }
      };
    }

    async listOrders(): Promise<{
      data: GameMarketOrderListItem[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }> {
      return {
        data: state.remoteOrders,
        pagination: { page: 1, limit: 100, total: state.remoteOrders.length, totalPages: 1 }
      };
    }
  }
}));

const { gameMarketSyncService } = await import("./gamemarket-sync-service");

const remoteOrder = (status: string): GameMarketOrderListItem => ({
  id: 34831,
  productId: 15,
  buyerName: "comprador",
  sellerName: "HzdKyx",
  price: 1500,
  quantity: 1,
  status,
  createdAt: "2026-04-29T12:00:00.000Z",
  updatedAt: "2026-04-29T12:05:00.000Z"
});

const existingOrder = (
  status: OrderStatus,
  externalStatus = "processing"
): SyncedOrderRow => ({
  id: "local-order-34831",
  order_code: "GMK-ORD-34831",
  external_order_id: "34831",
  external_payload_hash: "old-hash",
  external_status: externalStatus,
  status,
  action_required: status === "completed" || status === "delivered" ? 0 : 1,
  last_synced_at: "2026-04-29T12:10:00.000Z",
  confirmed_at: "2026-04-29T12:10:00.000Z",
  delivered_at: status === "delivered" ? "2026-04-29T12:20:00.000Z" : null,
  completed_at: status === "completed" ? "2026-04-29T12:30:00.000Z" : null
});

beforeEach(() => {
  state.remoteOrders.length = 0;
  state.productsByExternalId.clear();
  state.ordersByExternalId.clear();
  state.events.length = 0;
  state.notifications.length = 0;
  state.documentationStatus = "available";
  state.productsByExternalId.set("15", {
    id: "product-15",
    name: "Produto GameMarket",
    category: "Contas",
    game: "GameMarket",
    unit_cost_cents: 0,
    fee_percent: 13,
    active_variant_count: 0
  });
});

describe("gameMarketSyncService order status preservation", () => {
  it("imports processing orders as payment confirmed with action required", async () => {
    state.remoteOrders.push(remoteOrder("processing"));

    const summary = await gameMarketSyncService.syncNow("admin-1");
    const imported = state.ordersByExternalId.get("34831");

    expect(summary.ordersNew).toBe(1);
    expect(imported?.order_code).toBe("GMK-ORD-34831");
    expect(imported?.status).toBe("payment_confirmed");
    expect(imported?.action_required).toBe(1);
    expect(imported?.confirmed_at).toBeTruthy();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({
      type: "new_sale",
      dedupeKey: "sale:new:34831",
      playSound: true
    });

    const repeated = await gameMarketSyncService.syncNow("admin-1");

    expect(repeated.ordersNew).toBe(0);
    expect(state.notifications).toHaveLength(1);
  });

  it("does not block manual sync when local documentation is absent", async () => {
    state.documentationStatus = "missing";
    state.remoteOrders.push(remoteOrder("processing"));

    const summary = await gameMarketSyncService.syncNow("admin-1");

    expect(summary.status).toBe("synced");
    expect(summary.ordersNew).toBe(1);
    expect(summary.errors).toEqual([]);
  });

  it("corrects GMK-ORD-34831 when it was completed early while GameMarket is still processing", async () => {
    state.ordersByExternalId.set("34831", existingOrder("completed"));
    state.remoteOrders.push(remoteOrder("processing"));

    const summary = await gameMarketSyncService.syncNow("admin-1");
    const order = state.ordersByExternalId.get("34831");

    expect(summary.ordersUpdated).toBe(1);
    expect(order?.status).toBe("delivered");
    expect(order?.action_required).toBe(0);
    expect(order?.external_status).toBe("processing");
    expect(order?.external_payload_hash).not.toBe("old-hash");
    expect(order?.delivered_at).toBeTruthy();
    expect(order?.completed_at).toBeNull();
    expect(state.events.some((event) => event.type === "order.status_corrected")).toBe(true);
  });

  it("does not correct a completed order that already had an external completion signal", async () => {
    state.ordersByExternalId.set("34831", existingOrder("completed", "completed"));
    state.remoteOrders.push(remoteOrder("processing"));

    await gameMarketSyncService.syncNow("admin-1");

    expect(state.ordersByExternalId.get("34831")?.status).toBe("completed");
    expect(state.ordersByExternalId.get("34831")?.completed_at).toBeTruthy();
  });

  it("clears stale completedAt from delivered orders while GameMarket is still processing", async () => {
    state.ordersByExternalId.set("34831", {
      ...existingOrder("delivered"),
      completed_at: "2026-04-29T12:30:00.000Z"
    });
    state.remoteOrders.push(remoteOrder("processing"));

    await gameMarketSyncService.syncNow("admin-1");

    const order = state.ordersByExternalId.get("34831");
    expect(order?.status).toBe("delivered");
    expect(order?.completed_at).toBeNull();
    expect(state.events.some((event) => event.type === "order.status_corrected")).toBe(true);
  });

  it.each(["delivered", "cancelled", "refunded"] as const)(
    "preserves local %s status during a processing sync",
    async (status) => {
      state.ordersByExternalId.set("34831", existingOrder(status));
      state.remoteOrders.push(remoteOrder("processing"));

      await gameMarketSyncService.syncNow("admin-1");

      expect(state.ordersByExternalId.get("34831")?.status).toBe(status);
    }
  );

  it("promotes delivered orders when GameMarket reports completed", async () => {
    state.ordersByExternalId.set("34831", existingOrder("delivered"));
    state.remoteOrders.push(remoteOrder("completed"));

    await gameMarketSyncService.syncNow("admin-1");

    const order = state.ordersByExternalId.get("34831");
    expect(order?.status).toBe("completed");
    expect(order?.completed_at).toBeTruthy();
    expect(state.events.some((event) => event.type === "order.completed")).toBe(true);
  });

  it("imports completed orders as completed with no action required", async () => {
    state.remoteOrders.push(remoteOrder("concluded"));

    await gameMarketSyncService.syncNow("admin-1");

    const imported = state.ordersByExternalId.get("34831");
    expect(imported?.status).toBe("completed");
    expect(imported?.action_required).toBe(0);
    expect(imported?.completed_at).toBeTruthy();
  });

  it("marks imported sales as action required when an operational variant is not linked", async () => {
    const product = state.productsByExternalId.get("15");
    if (product) {
      product.active_variant_count = 2;
    }
    state.remoteOrders.push(remoteOrder("completed"));

    await gameMarketSyncService.syncNow("admin-1");

    const imported = state.ordersByExternalId.get("34831");
    expect(imported?.action_required).toBe(1);
    expect(state.notifications[0]).toMatchObject({
      type: "new_sale",
      dedupeKey: "sale:new:34831"
    });
    expect(state.notifications[0]?.message).toContain("Variação: Variação não vinculada");
  });
});
