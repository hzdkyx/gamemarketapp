import type { GameMarketPollingStatus, GameMarketSyncSummary } from "../../../shared/contracts";
import { getSqliteDatabase } from "../../database/database";
import { settingsService } from "../../services/settings-service";
import { gameMarketSettingsService } from "./gamemarket-settings-service";
import { gameMarketSyncService } from "./gamemarket-sync-service";

type TimerHandle = ReturnType<typeof setTimeout>;

interface PollingDependencies {
  readSettings: () => {
    notifications: ReturnType<typeof settingsService.getNotificationSettings>;
    hasApiToken: boolean;
    documentationAvailable: boolean;
  };
  syncNow: () => Promise<GameMarketSyncSummary>;
  saveStatus: (status: GameMarketPollingStatus) => void;
  loadStatus: () => GameMarketPollingStatus | null;
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer: (handle: TimerHandle) => void;
  now: () => Date;
}

const statusSettingsKey = "gamemarket_polling_status";

const defaultStatus = (): GameMarketPollingStatus => ({
  active: false,
  running: false,
  intervalSeconds: 60,
  startedAt: null,
  finishedAt: null,
  status: "idle",
  importedOrders: 0,
  updatedOrders: 0,
  errors: [],
  nextRunAt: null,
  lastResult: null,
});

const writePollingStatus = (status: GameMarketPollingStatus): void => {
  getSqliteDatabase()
    .prepare(
      `
        INSERT INTO settings (key, value_json, is_secret, updated_at)
        VALUES (@key, @valueJson, 0, @updatedAt)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          is_secret = excluded.is_secret,
          updated_at = excluded.updated_at
      `,
    )
    .run({
      key: statusSettingsKey,
      valueJson: JSON.stringify(status),
      updatedAt: new Date().toISOString(),
    });
};

const readPollingStatus = (): GameMarketPollingStatus | null => {
  const row = getSqliteDatabase()
    .prepare("SELECT value_json FROM settings WHERE key = ?")
    .get(statusSettingsKey) as { value_json: string } | undefined;

  if (!row) {
    return null;
  }

  try {
    return JSON.parse(row.value_json) as GameMarketPollingStatus;
  } catch {
    return null;
  }
};

const makeDefaultDependencies = (): PollingDependencies => ({
  readSettings: () => {
    const notifications = settingsService.getNotificationSettings();
    const gameMarketSettings = gameMarketSettingsService.getSettings();

    return {
      notifications,
      hasApiToken: gameMarketSettings.hasToken,
      documentationAvailable: gameMarketSettings.documentation.status === "available",
    };
  },
  syncNow: () => gameMarketSyncService.syncNow(null, { trigger: "polling" }),
  saveStatus: writePollingStatus,
  loadStatus: readPollingStatus,
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle),
  now: () => new Date(),
});

export const createGameMarketPollingService = (
  dependencies: PollingDependencies = makeDefaultDependencies(),
) => {
  let timer: TimerHandle | null = null;
  let running = false;
  let lastStatus = dependencies.loadStatus() ?? defaultStatus();

  const persist = (status: GameMarketPollingStatus): GameMarketPollingStatus => {
    lastStatus = status;
    dependencies.saveStatus(status);
    return status;
  };

  const stopTimer = (): void => {
    if (timer) {
      dependencies.clearTimer(timer);
      timer = null;
    }
  };

  const schedule = (intervalSeconds: number): void => {
    stopTimer();
    const nextRunAt = new Date(
      dependencies.now().getTime() + intervalSeconds * 1000,
    ).toISOString();
    lastStatus = persist({
      ...lastStatus,
      active: true,
      running,
      intervalSeconds,
      status: running ? "running" : "scheduled",
      nextRunAt,
    });

    timer = dependencies.setTimer(() => {
      void runNow().finally(() => refresh());
    }, intervalSeconds * 1000);
  };

  const refresh = (): GameMarketPollingStatus => {
    const { notifications, hasApiToken, documentationAvailable } =
      dependencies.readSettings();
    const intervalSeconds = notifications.pollingIntervalSeconds;

    if (!notifications.automaticPollingEnabled) {
      stopTimer();
      return persist({
        ...lastStatus,
        active: false,
        running: false,
        intervalSeconds,
        status: "disabled",
        nextRunAt: null,
        lastResult: "Polling automático desativado.",
      });
    }

    if (!hasApiToken || !documentationAvailable) {
      stopTimer();
      return persist({
        ...lastStatus,
        active: false,
        running: false,
        intervalSeconds,
        status: "not_configured",
        nextRunAt: null,
        lastResult: "API GameMarket sem configuração pronta para leitura.",
      });
    }

    if (!timer && !running) {
      schedule(intervalSeconds);
    }

    return lastStatus;
  };

  const runNow = async (): Promise<GameMarketPollingStatus> => {
    const { notifications, hasApiToken, documentationAvailable } =
      dependencies.readSettings();
    const intervalSeconds = notifications.pollingIntervalSeconds;

    if (!hasApiToken || !documentationAvailable) {
      stopTimer();
      return persist({
        ...lastStatus,
        active: false,
        running: false,
        intervalSeconds,
        status: "not_configured",
        nextRunAt: null,
        errors: ["API GameMarket sem configuração pronta para leitura."],
        lastResult: "API GameMarket sem configuração pronta para leitura.",
      });
    }

    if (running) {
      return lastStatus;
    }

    running = true;
    const startedAt = dependencies.now().toISOString();
    persist({
      ...lastStatus,
      active: notifications.automaticPollingEnabled,
      running: true,
      intervalSeconds,
      startedAt,
      status: "running",
      nextRunAt: null,
      errors: [],
      lastResult: "Verificação GameMarket em andamento.",
    });

    try {
      const summary = await dependencies.syncNow();
      const finishedAt = dependencies.now().toISOString();
      return persist({
        active: notifications.automaticPollingEnabled,
        running: false,
        intervalSeconds,
        startedAt,
        finishedAt,
        status: summary.status === "failed" ? "failed" : summary.status,
        importedOrders: summary.ordersNew,
        updatedOrders: summary.ordersUpdated,
        errors: summary.errors,
        nextRunAt: null,
        lastResult:
          summary.status === "failed"
            ? summary.errors[0] ?? "Verificação GameMarket falhou."
            : `${summary.ordersNew} pedido(s) novo(s), ${summary.ordersUpdated} atualizado(s).`,
      });
    } catch (error) {
      const finishedAt = dependencies.now().toISOString();
      const safeError =
        error instanceof Error ? error.message : "Falha inesperada no polling GameMarket.";

      return persist({
        active: notifications.automaticPollingEnabled,
        running: false,
        intervalSeconds,
        startedAt,
        finishedAt,
        status: "failed",
        importedOrders: 0,
        updatedOrders: 0,
        errors: [safeError],
        nextRunAt: null,
        lastResult: safeError,
      });
    } finally {
      running = false;
    }
  };

  const stop = (): GameMarketPollingStatus => {
    stopTimer();
    return persist({
      ...lastStatus,
      active: false,
      running: false,
      status: "disabled",
      nextRunAt: null,
    });
  };

  return {
    refresh,
    runNow,
    stop,
    getStatus: (): GameMarketPollingStatus => lastStatus,
    getTimerCount: (): number => (timer ? 1 : 0),
  };
};

export const gameMarketPollingService = createGameMarketPollingService();
