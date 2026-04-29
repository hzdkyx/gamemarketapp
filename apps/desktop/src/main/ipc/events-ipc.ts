import type { IpcMain } from "electron";
import {
  eventCreateManualInputSchema,
  eventGetInputSchema,
  eventListInputSchema,
  eventMarkReadInputSchema
} from "../../shared/contracts";
import { eventService } from "../services/event-service";
import { requirePermission, requireSession } from "../services/auth-session";

export const registerEventsIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("events:list", (_event, payload: unknown) => {
    requireSession();
    return eventService.list(eventListInputSchema.parse(payload ?? {}));
  });

  ipcMain.handle("events:get", (_event, payload: unknown) => {
    requireSession();
    const parsed = eventGetInputSchema.parse(payload);
    return eventService.get(parsed.id);
  });

  ipcMain.handle("events:markRead", (_event, payload: unknown) => {
    requirePermission("canEditOrders");
    const parsed = eventMarkReadInputSchema.parse(payload);
    return eventService.markRead(parsed.id);
  });

  ipcMain.handle("events:markAllRead", () => {
    requirePermission("canEditOrders");
    return eventService.markAllRead();
  });

  ipcMain.handle("events:createManual", (_event, payload: unknown) => {
    const session = requirePermission("canEditOrders");
    return eventService.createManual(eventCreateManualInputSchema.parse(payload), session.user.id);
  });

  ipcMain.handle("events:exportCsv", (_event, payload: unknown) => {
    requirePermission("canExportCsv");
    return eventService.exportCsv(eventListInputSchema.parse(payload ?? {}));
  });
};
