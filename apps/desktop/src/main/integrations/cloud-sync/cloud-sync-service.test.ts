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
    lastSyncAt: null as string | null,
    lastPullAt: null as string | null,
    lastPushAt: null as string | null,
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
  remoteEntities: [] as Array<{
    cloudId: string;
    workspaceId: string;
    entityType: "settings";
    localId: string;
    payload: Record<string, unknown>;
    version: number;
    updatedByUserId: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: null;
  }>,
  applyRemoteResult: {
    applied: 0,
    conflicts: 0,
    ignored: 0
  },
  pushCalls: [] as Array<{ workspaceId: string; changes: unknown[] }>,
  pullCalls: [] as Array<{ workspaceId: string; since: string | null }>,
  statusCalls: [] as Array<{ workspaceId: string; since: string | null }>,
  statusResponse: {
    workspaceId: "workspace-existing-1",
    workspaceVersion: 0,
    lastUpdatedAt: null as string | null,
    pendingServerChanges: 1,
    serverTime: "2026-05-01T12:00:00.000Z"
  },
  bootstrapOwnerCalls: 0,
  markSyncResults: [] as unknown[]
}));

vi.mock("./cloud-sync-settings-service", () => ({
  cloudSyncSettingsService: {
    getSettings: () => state.settings,
    getTokenForRequest: () => "session-token",
    markStatus: vi.fn(),
    markSyncResult: (input: unknown) => {
      state.markSyncResults.push(input);
    }
  }
}));

vi.mock("./cloud-sync-local-store", () => ({
  cloudSyncLocalStore: {
    collectChanges: () => state.collection,
    markPushed: vi.fn(),
    markConflicts: vi.fn(),
    applyRemote: vi.fn(() => state.applyRemoteResult)
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

    async pull(workspaceId: string, since?: string | null): Promise<unknown> {
      state.pullCalls.push({ workspaceId, since: since ?? null });
      return {
        ok: true,
        workspaceId,
        entities: state.remoteEntities,
        serverTime: "2026-05-01T12:00:00.000Z"
      };
    }

    async status(workspaceId: string, since?: string | null): Promise<unknown> {
      state.statusCalls.push({ workspaceId, since: since ?? null });
      return {
        ok: true,
        ...state.statusResponse,
        workspaceId
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
    workspaceId: "workspace-existing-1",
    lastPullAt: null,
    lastPushAt: null,
    lastSyncAt: null
  };
  state.collection = {
    changes: [],
    ignored: 2,
    entityTypes: []
  };
  state.pushCalls = [];
  state.pullCalls = [];
  state.statusCalls = [];
  state.statusResponse = {
    workspaceId: "workspace-existing-1",
    workspaceVersion: 0,
    lastUpdatedAt: null,
    pendingServerChanges: 1,
    serverTime: "2026-05-01T12:00:00.000Z"
  };
  state.remoteEntities = [];
  state.applyRemoteResult = {
    applied: 0,
    conflicts: 0,
    ignored: 0
  };
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

describe("cloudSyncService.syncNow", () => {
  it("finishes cleanly for an already populated workspace with no pending changes", async () => {
    state.collection.ignored = 0;
    state.statusResponse.pendingServerChanges = 0;

    const summary = await cloudSyncService.syncNow();

    expect(summary).toMatchObject({
      status: "synced",
      pushed: 0,
      pulled: 0,
      applied: 0,
      conflicts: 0,
      collected: 0,
      ignored: 0,
      errors: []
    });
    expect(state.pushCalls).toEqual([]);
    expect(state.statusCalls).toEqual([{ workspaceId: "workspace-existing-1", since: null }]);
    expect(state.pullCalls).toEqual([]);
  });

  it("uses the lightweight status check to avoid payload pulls when the server has no new changes", async () => {
    state.settings = {
      ...state.settings,
      lastPullAt: "2026-05-01T11:55:00.000Z"
    };
    state.statusResponse = {
      workspaceId: "workspace-existing-1",
      workspaceVersion: 4,
      lastUpdatedAt: "2026-05-01T11:50:00.000Z",
      pendingServerChanges: 0,
      serverTime: "2026-05-01T12:00:00.000Z"
    };

    const summary = await cloudSyncService.syncNow();

    expect(summary.pulled).toBe(0);
    expect(state.pullCalls).toEqual([]);
    expect(state.markSyncResults.at(-1)).toMatchObject({
      lastPullAt: "2026-05-01T12:00:00.000Z"
    });
  });

  it("includes safely ignored remote settings in the sync summary", async () => {
    state.collection.ignored = 0;
    state.remoteEntities = [
      {
        cloudId: "cloud-setting-1",
        workspaceId: "workspace-existing-1",
        entityType: "settings",
        localId: "gamemarket_api_token_encrypted",
        payload: {
          key: "gamemarket_api_token_encrypted",
          value_json: JSON.stringify("remote-token")
        },
        version: 1,
        updatedByUserId: "cloud-user-1",
        createdAt: "2026-05-01T12:00:00.000Z",
        updatedAt: "2026-05-01T12:00:00.000Z",
        deletedAt: null
      }
    ];
    state.applyRemoteResult = {
      applied: 0,
      conflicts: 0,
      ignored: 1
    };

    const summary = await cloudSyncService.syncNow();

    expect(summary).toMatchObject({
      status: "synced",
      pushed: 0,
      pulled: 1,
      applied: 0,
      conflicts: 0,
      ignored: 1
    });
  });
});
