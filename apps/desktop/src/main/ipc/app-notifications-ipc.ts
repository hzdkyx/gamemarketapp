import type { IpcMain } from "electron";
import {
  appNotificationListInputSchema,
  appNotificationMarkReadInputSchema,
} from "../../shared/contracts";
import { requirePermission, requireSession } from "../services/auth-session";
import { localNotificationService } from "../services/local-notification-service";

export const registerAppNotificationsIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("appNotifications:list", (_event, payload: unknown) => {
    requireSession();
    return localNotificationService.list(
      appNotificationListInputSchema.parse(payload ?? {}),
    );
  });

  ipcMain.handle("appNotifications:markRead", (_event, payload: unknown) => {
    requirePermission("canEditOrders");
    const parsed = appNotificationMarkReadInputSchema.parse(payload);
    return localNotificationService.markRead(parsed.id);
  });

  ipcMain.handle("appNotifications:markAllRead", () => {
    requirePermission("canEditOrders");
    return localNotificationService.markAllRead();
  });

  ipcMain.handle("appNotifications:testNotification", () => {
    requirePermission("canManageSettings");
    return localNotificationService.show({
      title: "Teste de notificação local",
      body: "Notificação local e central interna funcionando.",
    });
  });
};
