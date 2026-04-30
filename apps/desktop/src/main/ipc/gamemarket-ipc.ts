import type { IpcMain } from "electron";
import {
  gamemarketEmptyInputSchema,
  gamemarketRevealTokenInputSchema,
  gamemarketSettingsUpdateInputSchema
} from "../../shared/contracts";
import { gameMarketService } from "../integrations/gamemarket/gamemarket-service";
import { requirePermission } from "../services/auth-session";

export const registerGameMarketIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("gamemarket:getSettings", () => {
    requirePermission("canManageSettings");
    return gameMarketService.getSettings();
  });

  ipcMain.handle("gamemarket:updateSettings", (_event, payload: unknown) => {
    const session = requirePermission("canManageSettings");
    return gameMarketService.updateSettings(gamemarketSettingsUpdateInputSchema.parse(payload), session.user.id);
  });

  ipcMain.handle("gamemarket:revealToken", (_event, payload: unknown) => {
    const session = requirePermission("canManageSettings");
    return gameMarketService.revealToken(gamemarketRevealTokenInputSchema.parse(payload), session.user.id);
  });

  ipcMain.handle("gamemarket:testConnection", (_event, payload: unknown) => {
    const session = requirePermission("canManageSettings");
    gamemarketEmptyInputSchema.parse(payload ?? {});
    return gameMarketService.testConnection(session.user.id);
  });

  ipcMain.handle("gamemarket:syncNow", (_event, payload: unknown) => {
    const session = requirePermission("canManageSettings");
    gamemarketEmptyInputSchema.parse(payload ?? {});
    return gameMarketService.syncNow(session.user.id);
  });

  ipcMain.handle("gamemarket:pollNow", (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    gamemarketEmptyInputSchema.parse(payload ?? {});
    return gameMarketService.pollNow();
  });

  ipcMain.handle("gamemarket:getPollingStatus", (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    gamemarketEmptyInputSchema.parse(payload ?? {});
    return gameMarketService.getPollingStatus();
  });

  ipcMain.handle("gamemarket:getLastSyncSummary", (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    gamemarketEmptyInputSchema.parse(payload ?? {});
    return gameMarketService.getLastSyncSummary();
  });
};
