import type { CloudSyncAutoSyncStatus, CloudSyncSettingsView, CloudSyncSummary } from "../../../shared/contracts";
import {
  CLOUD_SYNC_DEFAULT_INTERVAL_SECONDS,
  CLOUD_SYNC_MIN_INTERVAL_SECONDS,
  normalizeCloudSyncIntervalSeconds
} from "../../../shared/cloud-sync-intervals";
import { cloudSyncService } from "./cloud-sync-service";

type CloudSyncTrigger = "initial" | "interval" | "focus" | "local-change" | "manual";
type CloudSyncRuntimeStatus = CloudSyncAutoSyncStatus["status"];

const backoffSeconds = [10, 30, 60, 120] as const;
const localChangeDelaySeconds = 3;

let timer: NodeJS.Timeout | null = null;
let runningPromise: Promise<CloudSyncSummary> | null = null;
let paused = false;
let nextRunAt: string | null = null;
let startedAt: string | null = null;
let finishedAt: string | null = null;
let lastResult: string | null = null;
let failureCount = 0;
let runtimeStatus: CloudSyncRuntimeStatus = "idle";

const clearTimer = (): void => {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  nextRunAt = null;
};

const isReady = (settings: CloudSyncSettingsView): boolean =>
  settings.mode === "cloud" && settings.autoSyncEnabled && settings.hasSession && Boolean(settings.workspaceId);

const currentIntervalSeconds = (settings: CloudSyncSettingsView): number =>
  normalizeCloudSyncIntervalSeconds(settings.syncIntervalSeconds, CLOUD_SYNC_DEFAULT_INTERVAL_SECONDS);

const currentBackoffSeconds = (): number | null => {
  if (failureCount <= 0) {
    return null;
  }

  const index = Math.min(failureCount - 1, backoffSeconds.length - 1);
  return backoffSeconds[index] ?? 120;
};

const schedule = (delaySeconds: number, trigger: CloudSyncTrigger): void => {
  clearTimer();
  nextRunAt = new Date(Date.now() + delaySeconds * 1000).toISOString();
  runtimeStatus = "scheduled";
  timer = setTimeout(() => {
    timer = null;
    nextRunAt = null;
    void runAuto(trigger);
  }, delaySeconds * 1000);
};

const scheduleNext = (): void => {
  const settings = cloudSyncService.getSettings();
  if (!isReady(settings) || paused) {
    clearTimer();
    runtimeStatus = paused ? "paused" : settings.hasSession ? "disabled" : "not_configured";
    return;
  }

  schedule(currentBackoffSeconds() ?? currentIntervalSeconds(settings), "interval");
};

const runSync = (trigger: CloudSyncTrigger, allowWhenDisabled: boolean): Promise<CloudSyncSummary> | null => {
  const settings = cloudSyncService.getSettings();
  if (!allowWhenDisabled && (!isReady(settings) || paused)) {
    runtimeStatus = paused ? "paused" : settings.hasSession ? "disabled" : "not_configured";
    return null;
  }

  if (runningPromise) {
    return runningPromise;
  }

  clearTimer();
  startedAt = new Date().toISOString();
  runtimeStatus = settings.pendingChanges > 0 ? "pushing" : trigger === "local-change" ? "pushing" : "checking";
  lastResult = settings.pendingChanges > 0 ? "Enviando alterações locais." : "Verificando alterações na nuvem.";

  runningPromise = cloudSyncService
    .syncNow()
    .then((summary) => {
      finishedAt = new Date().toISOString();
      if (summary.status === "failed") {
        failureCount += 1;
        runtimeStatus = "failed";
        lastResult = summary.errors[0] ?? "Erro de sync.";
      } else {
        failureCount = 0;
        runtimeStatus = "synced";
        lastResult =
          summary.pushed > 0
            ? `Enviadas ${summary.pushed} alteração(ões).`
            : summary.pulled > 0
              ? `Baixadas ${summary.pulled} alteração(ões).`
              : "Sincronizado agora.";
      }
      return summary;
    })
    .finally(() => {
      runningPromise = null;
      if (trigger !== "manual" || !paused) {
        scheduleNext();
      }
    });

  return runningPromise;
};

const runAuto = (trigger: CloudSyncTrigger): Promise<CloudSyncSummary> | null => runSync(trigger, false);

export const cloudSyncPollingService = {
  refresh(options: { runInitial?: boolean } = {}): void {
    clearTimer();
    const settings = cloudSyncService.getSettings();
    if (!isReady(settings) || paused) {
      runtimeStatus = paused ? "paused" : settings.hasSession ? "disabled" : "not_configured";
      return;
    }

    schedule(options.runInitial ? 1 : currentIntervalSeconds(settings), options.runInitial ? "initial" : "interval");
  },

  stop(): void {
    clearTimer();
    paused = false;
    failureCount = 0;
    startedAt = null;
    finishedAt = null;
    lastResult = null;
    runtimeStatus = "idle";
  },

  pause(): CloudSyncAutoSyncStatus {
    paused = true;
    clearTimer();
    runtimeStatus = "paused";
    lastResult = "Sync automático pausado.";
    return this.getStatus();
  },

  resume(): CloudSyncAutoSyncStatus {
    paused = false;
    lastResult = "Sync automático retomado.";
    this.refresh({ runInitial: true });
    return this.getStatus();
  },

  notifyLocalChange(): void {
    const settings = cloudSyncService.getSettings();
    if (!isReady(settings) || paused) {
      return;
    }
    lastResult = "Alteração local pendente.";
    schedule(localChangeDelaySeconds, "local-change");
  },

  syncOnFocus(): void {
    const settings = cloudSyncService.getSettings();
    if (!isReady(settings) || paused) {
      return;
    }

    const lastSyncAt = settings.lastSyncAt ? new Date(settings.lastSyncAt).getTime() : 0;
    const elapsedSeconds = (Date.now() - lastSyncAt) / 1000;
    if (elapsedSeconds >= currentIntervalSeconds(settings)) {
      void runAuto("focus");
    }
  },

  runManual(): Promise<CloudSyncSummary> | null {
    return runSync("manual", true);
  },

  getStatus(): CloudSyncAutoSyncStatus {
    const settings = cloudSyncService.getSettings();
    const ready = isReady(settings);
    const status = runningPromise
      ? runtimeStatus
      : paused
        ? "paused"
        : !ready
          ? settings.hasSession
            ? "disabled"
            : "not_configured"
          : runtimeStatus;

    return {
      active: ready && !paused,
      paused,
      running: Boolean(runningPromise),
      intervalSeconds: currentIntervalSeconds(settings),
      minIntervalSeconds: CLOUD_SYNC_MIN_INTERVAL_SECONDS,
      startedAt,
      finishedAt,
      nextRunAt,
      status,
      lastResult,
      pendingChanges: settings.pendingChanges,
      failureCount,
      backoffSeconds: currentBackoffSeconds()
    };
  }
};
