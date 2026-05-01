import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: {
    backendUrl: "https://cloud.example.test",
    mode: "cloud" as "cloud" | "local",
    connectionStatus: "connected" as const,
    hasSession: true,
    currentUser: null,
    workspaces: [],
    workspaceId: "workspace-existing-1",
    workspaceName: "HzdKyx GameMarket",
    workspaceRole: "owner" as const,
    autoSyncEnabled: false,
    syncIntervalSeconds: 300,
    lastSyncAt: null,
    lastPullAt: null,
    lastPushAt: null,
    lastError: null,
    pendingChanges: 0,
    conflictCount: 0
  },
  collection: {
    changes: [] as Array<{
      entityType: "products";
      localId: string;
      baseVersion: number;
      updatedAt: string;
      deletedAt: null;
      payload: Record<string, unknown>;
    }>,
    ignored: 0,
    entityTypes: [] as string[]
  },
  pushCalls: [] as Array<{ workspaceId: string; changes: unknown[] }>,
  bootstrapOwnerCalls: 0,
  markSyncResults: [] as unknown[]
}));

vi.mock("./cloud-sync-settings-service", () => ({
  cloudSyncSettingsService: {
    getSettings: () => state.settings,
    getTokenForRequest: () => "session-token",
    markSyncResult: (input: unknown) => {
      state.markSyncResults.push(input);
    }
  }
}));

vi.mock("./cloud-sync-local-store", () => ({
  cloudSyncLocalStore: {
    collectChanges: () => state.collection,
    markPushed: vi.fn(),
    markConflicts: vi.fn()
  }
}));

vi.mock("./cloud-sync-client", () => ({
  CloudSyncClient: class {
    async push(workspaceId: string, changes: unknown[]): Promise<unknown> {
      state.pushCalls.push({ workspaceId, changes });
      return {
        ok: true,
        workspaceId,
        entities: [],
        applied: [],
        conflicts: [],
        serverTime: "2026-05-01T12:00:00.000Z"
      };
    }

    async bootstrapOwner(): Promise<unknown> {
      state.bootstrapOwnerCalls += 1;
      return {};
    }
  }
}));

const { cloudSyncService } = await import("./cloud-sync-service");

beforeEach(() => {
  state.settings = {
    ...state.settings,
    mode: "cloud",
    hasSession: true,
    workspaceId: "workspace-existing-1"
  };
  state.collection = {
    changes: [],
    ignored: 2,
    entityTypes: []
  };
  state.pushCalls = [];
  state.bootstrapOwnerCalls = 0;
  state.markSyncResults = [];
});

describe("cloudSyncService.publishLocalData", () => {
  it("pushes an empty entities array without recreating the existing workspace", async () => {
    const summary = await cloudSyncService.publishLocalData();

    expect(summary).toMatchObject({
      status: "synced",
      collected: 0,
      pushed: 0,
      ignored: 2,
      entityTypes: []
    });
    expect(state.pushCalls).toEqual([{ workspaceId: "workspace-existing-1", changes: [] }]);
    expect(state.bootstrapOwnerCalls).toBe(0);
  });

  it("keeps local mode from attempting a cloud push", async () => {
    state.settings = {
      ...state.settings,
      mode: "local"
    };

    const summary = await cloudSyncService.publishLocalData();

    expect(summary.status).toBe("failed");
    expect(summary.errors[0]).toBe("Modo nuvem não está ativado.");
    expect(state.pushCalls).toEqual([]);
    expect(state.bootstrapOwnerCalls).toBe(0);
  });
});
