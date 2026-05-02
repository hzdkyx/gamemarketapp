import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WebhookServerEventDetail, WebhookServerEventItem } from "../../../shared/contracts";

const state = vi.hoisted(() => ({
  imports: new Map<string, string>(),
  localEvents: [] as Array<{ type: string; title: string; rawPayload?: unknown; orderId?: string | null }>,
  remoteEvents: [] as WebhookServerEventItem[],
  details: new Map<string, WebhookServerEventDetail>(),
  acked: [] as string[],
  actionRequiredOrders: [] as string[],
  completedOrders: [] as string[],
  notifications: [] as Array<{ type: string; dedupeKey?: string | null; playSound?: boolean }>,
  gameMarketSyncCalls: 0,
  summary: null as unknown
}));

vi.mock("../../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: (sql: string) => {
      if (sql.includes("SELECT 1 FROM webhook_server_event_imports")) {
        return {
          get: (dedupeKey: string) => (state.imports.has(dedupeKey) ? { imported: 1 } : undefined)
        };
      }

      if (sql.includes("INSERT INTO webhook_server_event_imports")) {
        return {
          run: (params: { dedupeKey: string; importedEventId: string }) => {
            state.imports.set(params.dedupeKey, params.importedEventId);
            return { changes: 1 };
          }
        };
      }

      if (sql.includes("FROM orders") && sql.includes("WHERE id = ?")) {
        return {
          get: (orderId: string) =>
            orderId === "local-order-1"
              ? {
                  id: "local-order-1",
                  order_code: "GMK-ORD-1",
                  external_order_id: "gm-order-1",
                  status: state.completedOrders.includes(orderId) ? "completed" : "payment_confirmed",
                  external_status: "processing",
                  action_required: state.actionRequiredOrders.includes(orderId) ? 1 : 0,
                  sale_price_cents: 1500,
                  net_value_cents: 1305,
                  profit_cents: 1305,
                  buyer_name: "comprador",
                  product_id: "product-1",
                  product_variant_id: null,
                  completed_at: state.completedOrders.includes(orderId) ? "2026-04-29T12:00:00.000Z" : null,
                  delivered_at: null,
                  notes: null,
                  updated_at: "2026-04-29T12:00:00.000Z"
                }
              : undefined
        };
      }

      if (sql.includes("FROM orders")) {
        return {
          get: (externalOrderId: string) =>
            externalOrderId === "gm-order-1" ? { id: "local-order-1" } : undefined
        };
      }

      if (sql.includes("FROM products")) {
        return {
          get: () => undefined
        };
      }

      if (sql.includes("UPDATE orders SET action_required = 1")) {
        return {
          run: (_updatedAt: string, orderId: string) => {
            state.actionRequiredOrders.push(orderId);
            return { changes: 1 };
          }
        };
      }

      if (sql.includes("UPDATE orders") && sql.includes("status = 'completed'")) {
        return {
          run: (params: { id: string }) => {
            state.completedOrders.push(params.id);
            return { changes: 1 };
          }
        };
      }

      throw new Error(`Unexpected SQL in webhook sync test: ${sql}`);
    }
  })
}));

vi.mock("../../services/event-service", () => ({
  eventService: {
    createInternal: (input: { type: string; title: string; rawPayload?: unknown; orderId?: string | null }) => {
      state.localEvents.push(input);
      return {
        id: `local-event-${state.localEvents.length}`,
        ...input
      };
    }
  }
}));

vi.mock("../../services/local-notification-service", () => ({
  localNotificationService: {
    notify: vi.fn((input: { type: string; dedupeKey?: string | null; playSound?: boolean }) => {
      state.notifications.push(input);
      return {
        created: true,
        nativeShown: false,
        notification: {
          id: `notification-${state.notifications.length}`,
          type: input.type,
          severity: "info",
          title: "Teste",
          message: "",
          orderId: null,
          externalOrderId: null,
          eventId: null,
          dedupeKey: input.dedupeKey ?? null,
          readAt: null,
          createdAt: new Date(0).toISOString(),
          metadataJson: null
        }
      };
    })
  }
}));

vi.mock("../gamemarket/gamemarket-sync-service", () => ({
  gameMarketSyncService: {
    syncNow: vi.fn(async () => {
      state.gameMarketSyncCalls += 1;
      return {
        startedAt: new Date(0).toISOString(),
        finishedAt: new Date(0).toISOString(),
        durationMs: 0,
        status: "synced",
        productsFound: 0,
        ordersFound: 0,
        productsNew: 0,
        productsUpdated: 0,
        ordersNew: 0,
        ordersUpdated: 0,
        errors: []
      };
    })
  }
}));

vi.mock("./webhook-server-settings-service", () => ({
  webhookServerSettingsService: {
    getSettings: () => ({
      backendUrl: "http://localhost:3001",
      hasToken: true,
      tokenMasked: "sync••••3456",
      connectionStatus: "configured",
      pollingEnabled: false,
      pollingIntervalSeconds: 60,
      lastCheckedAt: null,
      lastSyncAt: null,
      lastEventReceivedAt: null,
      lastError: null
    }),
    getTokenForRequest: () => "sync-token",
    saveLastSyncSummary: (summary: unknown) => {
      state.summary = summary;
    },
    markSyncResult: vi.fn()
  }
}));

vi.mock("./webhook-server-client", () => ({
  WebhookServerClient: class {
    async listEvents(): Promise<WebhookServerEventItem[]> {
      return state.remoteEvents;
    }

    async getEvent(id: string): Promise<WebhookServerEventDetail> {
      const detail = state.details.get(id);
      if (!detail) {
        throw new Error("missing detail");
      }
      return detail;
    }

    async ackEvent(id: string): Promise<void> {
      state.acked.push(id);
    }
  }
}));

const { webhookServerSyncService } = await import("./webhook-server-sync-service");

const makeRemoteEvent = (overrides: Partial<WebhookServerEventItem> = {}): WebhookServerEventItem => ({
  id: "remote-1",
  externalEventId: null,
  eventType: "gamemarket.order.sale_confirmed",
  source: "gamemarket_webhook",
  severity: "success",
  title: "Venda confirmada",
  message: "Venda confirmada",
  payloadHash: "payload-hash-1",
  ipAddress: null,
  userAgent: null,
  ackedAt: null,
  createdAt: "2026-04-29T12:00:00.000Z",
  receivedAt: "2026-04-29T12:00:00.000Z",
  hasRawPayload: true,
  ...overrides
});

beforeEach(() => {
  state.imports.clear();
  state.localEvents.length = 0;
  state.remoteEvents.length = 0;
  state.details.clear();
  state.acked.length = 0;
  state.actionRequiredOrders.length = 0;
  state.completedOrders.length = 0;
  state.notifications.length = 0;
  state.gameMarketSyncCalls = 0;
  state.summary = null;
});

describe("webhookServerSyncService", () => {
  it("imports sale confirmed events, marks linked orders as action required and avoids duplicates", async () => {
    const remote = makeRemoteEvent();
    state.remoteEvents.push(remote);
    state.details.set(remote.id, {
      ...remote,
      rawPayloadMasked: { order_id: "gm-order-1" },
      headersMasked: {}
    });

    const first = await webhookServerSyncService.syncNow("admin-1");
    const second = await webhookServerSyncService.syncNow("admin-1");

    expect(first.eventsImported).toBe(1);
    expect(first.eventsAcked).toBe(1);
    expect(second.duplicatesSkipped).toBe(1);
    expect(state.localEvents.some((event) => event.type === "order.payment_confirmed")).toBe(true);
    expect(state.actionRequiredOrders).toContain("local-order-1");
    expect(state.acked).toContain("remote-1");
    expect(state.notifications[0]).toMatchObject({
      type: "new_sale",
      dedupeKey: "sale:new:gm-order-1",
      playSound: true
    });
    expect(state.notifications).toHaveLength(1);
  });

  it.each(["gamemarket.order.completed", "gamemarket.financial.funds_released"] as const)(
    "promotes linked orders to completed for %s",
    async (eventType) => {
      const remote = makeRemoteEvent({
        id: `remote-${eventType}`,
        eventType,
        title: "Conclusão",
        message: "Conclusão",
        severity: "success"
      });
      state.remoteEvents.push(remote);
      state.details.set(remote.id, {
        ...remote,
        rawPayloadMasked: { order_id: "gm-order-1" },
        headersMasked: {}
      });

      await webhookServerSyncService.syncNow("admin-1");

      expect(state.completedOrders).toContain("local-order-1");
      expect(state.localEvents.some((event) => event.type === "order.completed")).toBe(true);
      expect(state.actionRequiredOrders).not.toContain("local-order-1");
    }
  );
});
