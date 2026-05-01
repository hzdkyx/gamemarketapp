import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  listGamesCalls: 0,
  markedStatuses: [] as Array<{ status: string; safeError: string | null }>,
  events: [] as Array<{ type: string; rawPayload?: unknown }>
}));

vi.mock("../../services/event-service", () => ({
  eventService: {
    createInternal: (input: { type: string; rawPayload?: unknown }) => {
      state.events.push(input);
      return { id: `event-${state.events.length}`, ...input };
    }
  }
}));

vi.mock("./gamemarket-settings-service", () => ({
  isGameMarketConfigured: () => true,
  gameMarketSettingsService: {
    getSettings: () => ({
      apiBaseUrl: "https://gamemarket.com.br",
      integrationName: "HzdKyx Desktop",
      environment: "production",
      hasToken: true,
      tokenMasked: "gm_s••••••••8286",
      tokenSource: "saved",
      connectionStatus: "configured",
      lastConnectionAt: null,
      lastSyncAt: null,
      lastError: null,
      documentation: {
        status: "missing",
        files: [],
        missing: ["docs/gamemarket-api/"],
        message: "A pasta docs/gamemarket-api não foi encontrada."
      },
      permissions: {
        read: true,
        write: false,
        delete: false,
        source: "documentation"
      }
    }),
    getTokenForRequest: () => "gm_sk_test_secret_8286",
    markConnectionResult: (status: string, safeError: string | null) => {
      state.markedStatuses.push({ status, safeError });
    }
  }
}));

vi.mock("./gamemarket-client", () => ({
  GameMarketClient: class {
    async listGames(): Promise<unknown[]> {
      state.listGamesCalls += 1;
      return [];
    }
  }
}));

vi.mock("./gamemarket-polling-service", () => ({
  gameMarketPollingService: {
    refresh: vi.fn(),
    runNow: vi.fn(),
    getStatus: vi.fn()
  }
}));

vi.mock("./gamemarket-sync-service", () => ({
  gameMarketSyncService: {
    syncNow: vi.fn()
  }
}));

const { gameMarketService } = await import("./gamemarket-service");

beforeEach(() => {
  state.listGamesCalls = 0;
  state.markedStatuses = [];
  state.events = [];
});

describe("gameMarketService.testConnection", () => {
  it("does not block the API test when local documentation is absent", async () => {
    const result = await gameMarketService.testConnection("admin-1");
    const serializedEvents = JSON.stringify(state.events);

    expect(result).toMatchObject({
      ok: true,
      status: "connected",
      endpoint: "GET /api/v1/games",
      safeMessage: "Conexão validada com sucesso."
    });
    expect(state.listGamesCalls).toBe(1);
    expect(state.markedStatuses).toEqual([{ status: "connected", safeError: null }]);
    expect(serializedEvents).not.toContain("gm_sk_test_secret_8286");
  });
});
