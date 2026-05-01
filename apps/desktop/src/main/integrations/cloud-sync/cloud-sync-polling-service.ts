import { cloudSyncService } from "./cloud-sync-service";

let timer: NodeJS.Timeout | null = null;
let running = false;

const stop = (): void => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const tick = async (): Promise<void> => {
  if (running) {
    return;
  }
  running = true;
  try {
    await cloudSyncService.syncNow();
  } finally {
    running = false;
  }
};

export const cloudSyncPollingService = {
  refresh(): void {
    stop();
    const settings = cloudSyncService.getSettings();
    if (settings.mode !== "cloud" || !settings.autoSyncEnabled || !settings.hasSession || !settings.workspaceId) {
      return;
    }

    timer = setInterval(() => {
      void tick();
    }, Math.max(60, settings.syncIntervalSeconds) * 1000);
  },

  stop
};
