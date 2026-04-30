import type { IpcMain } from "electron";
import { notificationSettingsUpdateInputSchema } from "../../shared/contracts";
import { gameMarketPollingService } from "../integrations/gamemarket/gamemarket-polling-service";
import { requirePermission } from "../services/auth-session";
import { settingsService } from "../services/settings-service";

export const registerSettingsIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("settings:getNotificationSettings", () => {
    requirePermission("canManageSettings");
    return settingsService.getNotificationSettings();
  });

  ipcMain.handle("settings:updateNotificationSettings", (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    const updated = settingsService.updateNotificationSettings(
      notificationSettingsUpdateInputSchema.parse(payload ?? {})
    );
    gameMarketPollingService.refresh();
    return updated;
  });
};
