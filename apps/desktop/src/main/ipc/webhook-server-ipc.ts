import type { IpcMain } from "electron";
import {
  webhookServerEmptyInputSchema,
  webhookServerRevealTokenInputSchema,
  webhookServerSettingsUpdateInputSchema
} from "../../shared/contracts";
import { webhookServerService } from "../integrations/webhook-server/webhook-server-service";
import { requirePermission } from "../services/auth-session";

export const registerWebhookServerIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("webhookServer:getSettings", () => {
    requirePermission("canManageSettings");
    return webhookServerService.getSettings();
  });

  ipcMain.handle("webhookServer:updateSettings", (_event, payload: unknown) => {
    const session = requirePermission("canManageSettings");
    return webhookServerService.updateSettings(
      webhookServerSettingsUpdateInputSchema.parse(payload),
      session.user.id
    );
  });

  ipcMain.handle("webhookServer:revealToken", (_event, payload: unknown) => {
    const session = requirePermission("canManageSettings");
    return webhookServerService.revealToken(webhookServerRevealTokenInputSchema.parse(payload), session.user.id);
  });

  ipcMain.handle("webhookServer:testConnection", (_event, payload: unknown) => {
    const session = requirePermission("canManageSettings");
    webhookServerEmptyInputSchema.parse(payload ?? {});
    return webhookServerService.testConnection(session.user.id);
  });

  ipcMain.handle("webhookServer:sendTestEvent", (_event, payload: unknown) => {
    const session = requirePermission("canManageSettings");
    webhookServerEmptyInputSchema.parse(payload ?? {});
    return webhookServerService.sendTestEvent(session.user.id);
  });

  ipcMain.handle("webhookServer:syncEventsNow", (_event, payload: unknown) => {
    const session = requirePermission("canManageSettings");
    webhookServerEmptyInputSchema.parse(payload ?? {});
    return webhookServerService.syncEventsNow(session.user.id);
  });

  ipcMain.handle("webhookServer:getLastSyncSummary", (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    webhookServerEmptyInputSchema.parse(payload ?? {});
    return webhookServerService.getLastSyncSummary();
  });
};
