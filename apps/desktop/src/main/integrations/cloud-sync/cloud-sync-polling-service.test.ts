import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const state = vi.hoisted(() => ({
  settings: {
    backendUrl: "https://cloud.example.test",
    mode: "cloud" as "cloud" | "local",
    connectionStatus: "connected" as const,
    hasSession: true,
    currentUser: null,
    workspaces: [],
    workspaceId: "workspace-1" as string | null,
    workspaceName: "HzdKyx",
    workspaceRole: "owner" as const,
    autoSyncEnabled: true,
    syncIntervalSeconds: 30,
    lastSyncAt: null as string | null,
    lastPullAt: null as string | null,
    lastPushAt: null as string | null,
    lastError: null,
    pendingChanges: 0,
    conflictCount: 0
  },
  syncCalls: 0,
  nextSummaryStatus: "synced" as "synced" | "failed"
}));

vi.mock("./cloud-sync-service", () => ({
  cloudSyncService: {
    getSettings: () => state.settings,
    syncNow: vi.fn(async () => {
      state.syncCalls += 1;
      return {
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        status: state.nextSummaryStatus,
        collected: state.settings.pendingChanges,
        pushed: state.settings.pendingChanges,
        pulled: 0,
        applied: state.settings.pendingChanges,
        conflicts: 0,
        ignored: 0,
        skipped: 0,
        entityTypes: [],
        errors: state.nextSummaryStatus === "failed" ? ["Backend indisponível."] : []
      };
    })
  }
}));

const { cloudSyncPollingService } = await import("./cloud-sync-polling-service");
const currentDir = dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  vi.useFakeTimers();
  cloudSyncPollingService.stop();
  state.syncCalls = 0;
  state.nextSummaryStatus = "synced";
  state.settings = {
    ...state.settings,
    mode: "cloud",
    hasSession: true,
    workspaceId: "workspace-1",
    autoSyncEnabled: true,
    syncIntervalSeconds: 30,
    lastSyncAt: null,
    pendingChanges: 0
  };
});

afterEach(() => {
  cloudSyncPollingService.stop();
  vi.useRealTimers();
});

describe("cloudSyncPollingService", () => {
  it("does not start two interval timers when refreshed repeatedly", async () => {
    cloudSyncPollingService.refresh();
    cloudSyncPollingService.refresh();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(state.syncCalls).toBe(1);
  });

  it("does not run autosync without an active session and workspace", async () => {
    state.settings = {
      ...state.settings,
      hasSession: false,
      workspaceId: null
    };

    cloudSyncPollingService.refresh({ runInitial: true });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(state.syncCalls).toBe(0);
    expect(cloudSyncPollingService.getStatus().status).toBe("not_configured");
  });

  it("runs an initial sync when the app opens with cloud session active", async () => {
    cloudSyncPollingService.refresh({ runInitial: true });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(state.syncCalls).toBe(1);
  });

  it("backs off after errors using the safe sequence", async () => {
    state.nextSummaryStatus = "failed";
    cloudSyncPollingService.refresh({ runInitial: true });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(state.syncCalls).toBe(1);
    expect(cloudSyncPollingService.getStatus().backoffSeconds).toBe(10);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(state.syncCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(state.syncCalls).toBe(2);
    expect(cloudSyncPollingService.getStatus().backoffSeconds).toBe(30);
  });

  it("respects pause and resumes on request", async () => {
    cloudSyncPollingService.refresh({ runInitial: true });
    cloudSyncPollingService.pause();

    await vi.advanceTimersByTimeAsync(5_000);
    expect(state.syncCalls).toBe(0);

    cloudSyncPollingService.resume();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(state.syncCalls).toBe(1);
  });

  it("schedules an automatic push a few seconds after a local change", async () => {
    state.settings.pendingChanges = 2;
    cloudSyncPollingService.refresh();

    cloudSyncPollingService.notifyLocalChange();
    await vi.advanceTimersByTimeAsync(2_999);
    expect(state.syncCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(state.syncCalls).toBe(1);
  });

  it("keeps manual sync available through the same single-flight guard", async () => {
    const first = cloudSyncPollingService.runManual();
    const second = cloudSyncPollingService.runManual();

    await first;
    await second;

    expect(state.syncCalls).toBe(1);
  });

  it("keeps GameMarket polling separated from cloud autosync", () => {
    const source = readFileSync(join(currentDir, "cloud-sync-polling-service.ts"), "utf8");

    expect(source).not.toMatch(/gamemarket|gameMarketPollingService|pollGameMarket/i);
  });
});
