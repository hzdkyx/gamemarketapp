import { webhookServerSettingsService } from "./webhook-server-settings-service";
import { webhookServerSyncService } from "./webhook-server-sync-service";

let pollingTimer: NodeJS.Timeout | null = null;
let running = false;

const stop = (): void => {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
};

export const webhookServerPollingService = {
  refresh(): void {
    stop();
    const settings = webhookServerSettingsService.getSettings();
    if (!settings.pollingEnabled || !settings.hasToken) {
      return;
    }

    pollingTimer = setInterval(() => {
      if (running) {
        return;
      }

      running = true;
      void webhookServerSyncService.syncNow(null).finally(() => {
        running = false;
      });
    }, settings.pollingIntervalSeconds * 1000);
  },

  stop
};
