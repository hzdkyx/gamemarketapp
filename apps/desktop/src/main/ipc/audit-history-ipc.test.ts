import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (_event: unknown, payload: unknown) => unknown;

const state = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  sessionsRequired: 0,
  listInputs: [] as unknown[],
}));

vi.mock("../services/auth-session", () => ({
  requireSession: () => {
    state.sessionsRequired += 1;
    return {
      user: {
        id: "user-1",
        role: "admin",
      },
    };
  },
}));

vi.mock("../services/audit-history-service", () => ({
  auditHistoryService: {
    list: (input: unknown) => {
      state.listInputs.push(input);
      return {
        items: [],
        total: 0,
        limit: 30,
        offset: 0,
        nextOffset: null,
        sources: [],
      };
    },
  },
}));

const { registerAuditHistoryIpc } = await import("./audit-history-ipc");

beforeEach(() => {
  state.handlers.clear();
  state.sessionsRequired = 0;
  state.listInputs.length = 0;
});

describe("audit history IPC", () => {
  it("registers contextual audit handlers with main-process session validation", () => {
    registerAuditHistoryIpc({
      handle: (channel: string, handler: Handler) => {
        state.handlers.set(channel, handler);
      },
    } as never);

    expect([...state.handlers.keys()]).toEqual(
      expect.arrayContaining([
        "audit:listEntityHistory",
        "audit:listProductHistory",
        "audit:listVariantHistory",
        "audit:listOrderHistory",
      ]),
    );

    state.handlers.get("audit:listProductHistory")?.(null, {
      entityId: "product-1",
      source: "manual",
      limit: 10,
      offset: 0,
    });
    state.handlers.get("audit:listVariantHistory")?.(null, {
      entityId: "variant-1",
    });
    state.handlers.get("audit:listOrderHistory")?.(null, {
      entityId: "order-1",
    });

    expect(state.sessionsRequired).toBe(3);
    expect(state.listInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: "product", entityId: "product-1", source: "manual" }),
        expect.objectContaining({ entityType: "variant", entityId: "variant-1" }),
        expect.objectContaining({ entityType: "order", entityId: "order-1" }),
      ]),
    );
  });

  it("rejects invalid entity types before reaching the service", () => {
    registerAuditHistoryIpc({
      handle: (channel: string, handler: Handler) => {
        state.handlers.set(channel, handler);
      },
    } as never);

    expect(() =>
      state.handlers.get("audit:listEntityHistory")?.(null, {
        entityType: "user",
        entityId: "user-1",
      }),
    ).toThrow();
    expect(state.listInputs).toHaveLength(0);
  });
});
