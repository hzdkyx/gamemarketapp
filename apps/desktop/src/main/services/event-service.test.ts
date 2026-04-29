import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecord } from "../../shared/contracts";

const state = vi.hoisted(() => ({
  events: [] as EventRecord[]
}));

vi.mock("./notification-service", () => ({
  notificationService: {
    notifyEvent: vi.fn(() => ({ shown: false, reason: "test" }))
  }
}));

vi.mock("../repositories/event-repository", () => ({
  eventRepository: {
    list: () => state.events,
    listLatest: (limit: number) => state.events.slice(-limit).reverse(),
    listByOrderId: (orderId: string) => state.events.filter((event) => event.orderId === orderId),
    getById: (id: string) => state.events.find((event) => event.id === id) ?? null,
    insert: (write: {
      id: string;
      eventCode: string;
      source: EventRecord["source"];
      type: EventRecord["type"];
      severity: EventRecord["severity"];
      title: string;
      message: string | null;
      orderId: string | null;
      productId: string | null;
      inventoryItemId: string | null;
      actorUserId: string | null;
      readAt: string | null;
      rawPayload: string | null;
      createdAt: string;
    }) => {
      const event: EventRecord = {
        id: write.id,
        eventCode: write.eventCode,
        source: write.source,
        type: write.type,
        severity: write.severity,
        title: write.title,
        message: write.message,
        orderId: write.orderId,
        orderCode: write.orderId,
        productId: write.productId,
        productName: write.productId,
        inventoryItemId: write.inventoryItemId,
        inventoryCode: write.inventoryItemId,
        actorUserId: write.actorUserId,
        actorUserName: write.actorUserId,
        readAt: write.readAt,
        rawPayload: write.rawPayload,
        createdAt: write.createdAt
      };
      state.events.push(event);
      return event;
    },
    markRead: (id: string, readAt: string) => {
      const event = state.events.find((item) => item.id === id);
      if (!event) throw new Error("Evento não encontrado.");
      event.readAt = readAt;
      return event;
    },
    markAllRead: (readAt: string) => {
      let updated = 0;
      for (const event of state.events) {
        if (!event.readAt) {
          event.readAt = readAt;
          updated += 1;
        }
      }
      return updated;
    },
    getSummary: () => ({
      total: state.events.length,
      unread: state.events.filter((event) => !event.readAt).length,
      critical: state.events.filter((event) => event.severity === "critical").length,
      warnings: state.events.filter((event) => event.severity === "warning").length
    })
  }
}));

const { eventService } = await import("./event-service");

beforeEach(() => {
  state.events.length = 0;
});

describe("event service", () => {
  it("creates manual events with masked raw payloads", () => {
    const event = eventService.createManual({
      type: "order.problem",
      severity: "critical",
      title: "Problema no pedido",
      message: "Revisar manualmente",
      orderId: "order-1",
      productId: "product-1",
      inventoryItemId: null,
      rawPayload: {
        token: "secret-token",
        accountPassword: "secret-password",
        visible: "ok"
      }
    });

    expect(event.rawPayload).toContain("[mascarado]");
    expect(event.rawPayload).toContain("visible");
    expect(event.rawPayload).not.toContain("secret-token");
    expect(event.rawPayload).not.toContain("secret-password");
  });

  it("marks events as read and exports CSV", () => {
    const event = eventService.createManual({
      type: "order.payment_confirmed",
      severity: "success",
      title: "Pagamento confirmado",
      message: "Separar estoque",
      orderId: "order-1",
      productId: "product-1",
      inventoryItemId: "inventory-1"
    });

    const read = eventService.markRead(event.id);
    const csv = eventService.exportCsv({
      search: null,
      type: "all",
      severity: "all",
      orderId: null,
      productId: null,
      read: "all",
      dateFrom: null,
      dateTo: null
    });

    expect(read.readAt).toBeTruthy();
    expect(csv.content).toContain("order.payment_confirmed");
    expect(csv.content).toContain("Pagamento confirmado");
  });
});
