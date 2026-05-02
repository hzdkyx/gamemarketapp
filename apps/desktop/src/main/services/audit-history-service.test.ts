import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "../../shared/contracts";

interface AuditTestRow {
  id: string;
  event_code: string;
  source: EventRecord["source"];
  type: EventRecord["type"];
  severity: EventRecord["severity"];
  title: string;
  message: string | null;
  order_id: string | null;
  product_id: string | null;
  inventory_item_id: string | null;
  actor_user_id: string | null;
  actor_user_name: string | null;
  raw_payload: string | null;
  created_at: string;
}

const state = vi.hoisted(() => ({
  rows: [] as AuditTestRow[],
  recorded: [] as Array<{
    source?: EventRecord["source"];
    type: EventRecord["type"];
    rawPayload?: unknown;
  }>,
}));

vi.mock("../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: () => ({
      all: (params: { scanLimit?: number }) => state.rows.slice(0, params.scanLimit ?? state.rows.length),
    }),
  }),
}));

vi.mock("./event-service", () => ({
  eventService: {
    createInternal: (input: {
      source?: EventRecord["source"];
      type: EventRecord["type"];
      rawPayload?: unknown;
    }) => {
      state.recorded.push(input);
      return {
        id: `event-${state.recorded.length}`,
        eventCode: `EVT-${state.recorded.length}`,
        source: input.source ?? "system",
        type: input.type,
        severity: "info",
        title: "Audit",
        message: null,
        orderId: null,
        orderCode: null,
        productId: null,
        productName: null,
        inventoryItemId: null,
        inventoryCode: null,
        actorUserId: null,
        actorUserName: null,
        readAt: null,
        rawPayload: JSON.stringify(input.rawPayload ?? null),
        createdAt: "2026-05-02T12:00:00.000Z",
      } satisfies EventRecord;
    },
  },
}));

const { auditHistoryService, buildAuditChanges } = await import("./audit-history-service");

const row = (overrides: Partial<AuditTestRow>): AuditTestRow => ({
  id: "event-1",
  event_code: "EVT-AUDIT-1",
  source: "manual",
  type: "audit.product_updated",
  severity: "info",
  title: "Produto atualizado",
  message: "Produto alterado.",
  order_id: null,
  product_id: "product-1",
  inventory_item_id: null,
  actor_user_id: "user-1",
  actor_user_name: "Admin local",
  raw_payload: JSON.stringify({
    audit: true,
    source: "manual",
    action: "updated",
    entityType: "product",
    entityId: "product-1",
    relatedProductId: "product-1",
    changes: [
      {
        field: "name",
        label: "Nome",
        before: "Produto antigo",
        after: "Produto novo",
        sensitive: false,
      },
    ],
  }),
  created_at: "2026-05-02T12:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  state.rows.length = 0;
  state.recorded.length = 0;
});

describe("auditHistoryService", () => {
  it("lists an empty history without breaking pagination", () => {
    const result = auditHistoryService.list({
      entityType: "product",
      entityId: "product-1",
      source: "all",
      search: null,
      limit: 20,
      offset: 0,
    });

    expect(result).toMatchObject({
      items: [],
      total: 0,
      nextOffset: null,
    });
  });

  it("lists product history with before/after, source and actor", () => {
    state.rows.push(row({}));

    const result = auditHistoryService.list({
      entityType: "product",
      entityId: "product-1",
      source: "all",
      search: null,
      limit: 20,
      offset: 0,
    });

    expect(result.items[0]).toMatchObject({
      source: "manual",
      sourceLabel: "Manual",
      actorName: "Admin local",
      entityType: "product",
      entityId: "product-1",
      detailUnavailable: false,
    });
    expect(result.items[0]?.changes[0]).toMatchObject({
      label: "Nome",
      before: "Produto antigo",
      after: "Produto novo",
    });
  });

  it("maps cloud, webhook and GameMarket sources without requiring an actor", () => {
    state.rows.push(
      row({
        id: "cloud-1",
        source: "system",
        actor_user_id: null,
        actor_user_name: null,
        raw_payload: JSON.stringify({
          source: "cloud_sync",
          entityType: "variant",
          entityId: "variant-1",
          relatedVariantId: "variant-1",
          changes: [{ field: "stock_current", label: "Estoque atual", before: 1, after: 2 }],
        }),
      }),
      row({
        id: "webhook-1",
        source: "webhook_server",
        type: "audit.order_updated",
        order_id: "order-1",
        raw_payload: JSON.stringify({
          source: "webhook",
          entityType: "order",
          entityId: "order-1",
          changes: [{ field: "status", label: "Status local", before: "delivered", after: "completed" }],
        }),
      }),
      row({
        id: "gm-1",
        source: "gamemarket_api",
        type: "integration.gamemarket.order_updated",
        order_id: "order-1",
        raw_payload: null,
      }),
    );

    const variantHistory = auditHistoryService.list({
      entityType: "variant",
      entityId: "variant-1",
      source: "cloud_sync",
      search: null,
      limit: 20,
      offset: 0,
    });
    const orderHistory = auditHistoryService.list({
      entityType: "order",
      entityId: "order-1",
      source: "all",
      search: null,
      limit: 20,
      offset: 0,
    });

    expect(variantHistory.items[0]).toMatchObject({
      source: "cloud_sync",
      actorName: "Cloud",
    });
    expect(orderHistory.items.map((entry) => entry.source)).toEqual(
      expect.arrayContaining(["webhook", "gamemarket_api"]),
    );
    expect(orderHistory.items.find((entry) => entry.id === "gm-1")?.detailUnavailable).toBe(true);
  });

  it("builds sanitized diffs and records sensitive changes without raw values", () => {
    const changes = buildAuditChanges(
      { apiKey: "gm_sk_live_real", name: "Antes" },
      { apiKey: "gm_sk_live_next", name: "Depois" },
      [
        { field: "apiKey", label: "API Key", read: (item) => item.apiKey },
        { field: "name", label: "Nome", read: (item) => item.name },
      ],
    );

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "apiKey",
          label: "Campo sensível alterado",
          before: null,
          after: null,
          sensitive: true,
        }),
        expect.objectContaining({
          field: "name",
          before: "Antes",
          after: "Depois",
        }),
      ]),
    );

    auditHistoryService.record({
      entityType: "product",
      entityId: "product-1",
      source: "manual",
      action: "updated",
      title: "Produto atualizado",
      actorUserId: null,
      relatedProductId: "product-1",
      changes,
    });

    const serialized = JSON.stringify(state.recorded[0]?.rawPayload);
    expect(serialized).not.toContain("gm_sk_live_real");
    expect(serialized).not.toContain("gm_sk_live_next");
    expect(serialized).toContain("Campo sensível alterado");
  });

  it("paginates list results", () => {
    state.rows.push(
      row({ id: "event-1", created_at: "2026-05-02T12:00:00.000Z" }),
      row({ id: "event-2", created_at: "2026-05-02T12:01:00.000Z" }),
      row({ id: "event-3", created_at: "2026-05-02T12:02:00.000Z" }),
    );

    const first = auditHistoryService.list({
      entityType: "product",
      entityId: "product-1",
      source: "all",
      search: null,
      limit: 2,
      offset: 0,
    });
    const second = auditHistoryService.list({
      entityType: "product",
      entityId: "product-1",
      source: "all",
      search: null,
      limit: 2,
      offset: 2,
    });

    expect(first.items).toHaveLength(2);
    expect(first.nextOffset).toBe(2);
    expect(second.items).toHaveLength(1);
    expect(second.nextOffset).toBeNull();
  });
});
