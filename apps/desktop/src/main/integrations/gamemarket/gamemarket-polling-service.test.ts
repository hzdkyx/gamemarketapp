import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GameMarketPollingStatus,
  GameMarketSyncSummary,
  NotificationSettings,
} from "../../../shared/contracts";

vi.mock("../../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: () => ({
      get: () => undefined,
      run: () => ({ changes: 1 }),
    }),
  }),
}));

vi.mock("../../services/settings-service", () => ({
  settingsService: {
    getNotificationSettings: () => ({
      automaticPollingEnabled: false,
      pollingIntervalSeconds: 60,
    }),
  },
}));

vi.mock("./gamemarket-settings-service", () => ({
  gameMarketSettingsService: {
    getSettings: () => ({
      hasToken: false,
      documentation: { status: "available" },
    }),
  },
}));

vi.mock("./gamemarket-sync-service", () => ({
  gameMarketSyncService: {
    syncNow: vi.fn(),
  },
}));

const { createGameMarketPollingService } = await import("./gamemarket-polling-service");

type PollingDependencies = NonNullable<
  Parameters<typeof createGameMarketPollingService>[0]
>;

const baseSettings = (
  overrides: Partial<NotificationSettings> = {},
): NotificationSettings => ({
  desktopEnabled: true,
  localNotificationsEnabled: true,
  soundEnabled: true,
  soundVolume: 0.7,
  showWhenMinimized: true,
  automaticPollingEnabled: true,
  pollingIntervalSeconds: 60,
  notifyNewSale: true,
  notifyMediationProblem: true,
  notifyOrderDelivered: true,
  notifyOrderCompleted: true,
  enabledEventTypes: {},
  ...overrides,
});

const syncedSummary = (
  overrides: Partial<GameMarketSyncSummary> = {},
): GameMarketSyncSummary => ({
  startedAt: "2026-04-30T12:00:00.000Z",
  finishedAt: "2026-04-30T12:00:01.000Z",
  durationMs: 1000,
  status: "synced",
  productsFound: 0,
  ordersFound: 1,
  productsNew: 0,
  productsUpdated: 0,
  ordersNew: 1,
  ordersUpdated: 0,
  errors: [],
  ...overrides,
});

describe("gameMarketPollingService", () => {
  let timers: Array<{
    handle: ReturnType<typeof setTimeout>;
    callback: () => void;
    delayMs: number;
  }>;
  let savedStatuses: GameMarketPollingStatus[];
  let settings: NotificationSettings;
  let hasApiToken: boolean;
  let documentationAvailable: boolean;
  let syncNow: ReturnType<typeof vi.fn<() => Promise<GameMarketSyncSummary>>>;

  const makeDependencies = (): PollingDependencies => ({
    readSettings: () => ({
      notifications: settings,
      hasApiToken,
      documentationAvailable,
    }),
    syncNow,
    saveStatus: (status) => {
      savedStatuses.push(status);
    },
    loadStatus: () => null,
    setTimer: (callback, delayMs) => {
      const handle = { id: timers.length + 1 } as unknown as ReturnType<
        typeof setTimeout
      >;
      timers.push({ handle, callback, delayMs });
      return handle;
    },
    clearTimer: (handle) => {
      timers = timers.filter((timer) => timer.handle !== handle);
    },
    now: () => new Date("2026-04-30T12:00:00.000Z"),
  });

  beforeEach(() => {
    timers = [];
    savedStatuses = [];
    settings = baseSettings();
    hasApiToken = true;
    documentationAvailable = true;
    syncNow = vi.fn(async () => syncedSummary());
  });

  it("creates only one active timer when refreshed repeatedly", () => {
    const service = createGameMarketPollingService(makeDependencies());

    service.refresh();
    service.refresh();

    expect(service.getTimerCount()).toBe(1);
    expect(timers).toHaveLength(1);
  });

  it("respects the configured polling interval", () => {
    settings = baseSettings({ pollingIntervalSeconds: 75 });
    const service = createGameMarketPollingService(makeDependencies());

    const status = service.refresh();

    expect(timers[0]?.delayMs).toBe(75_000);
    expect(status.intervalSeconds).toBe(75);
    expect(status.nextRunAt).toBe("2026-04-30T12:01:15.000Z");
  });

  it("does not run without GameMarket API configuration", async () => {
    hasApiToken = false;
    const service = createGameMarketPollingService(makeDependencies());

    const status = await service.runNow();

    expect(syncNow).not.toHaveBeenCalled();
    expect(status.active).toBe(false);
    expect(status.status).toBe("not_configured");
  });

  it("records imported and updated orders from a manual polling run", async () => {
    syncNow = vi.fn(async () => syncedSummary({ ordersNew: 2, ordersUpdated: 1 }));
    const service = createGameMarketPollingService(makeDependencies());

    const status = await service.runNow();

    expect(syncNow).toHaveBeenCalledTimes(1);
    expect(status.importedOrders).toBe(2);
    expect(status.updatedOrders).toBe(1);
    expect(status.lastResult).toBe("2 pedido(s) novo(s), 1 atualizado(s).");
    expect(savedStatuses.some((item) => item.status === "running")).toBe(true);
  });
});
