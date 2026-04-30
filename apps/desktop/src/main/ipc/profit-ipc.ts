import type { IpcMain } from "electron";
import { profitListInputSchema } from "../../shared/contracts";
import { requirePermission, requireSession } from "../services/auth-session";
import { profitService } from "../services/profit-service";

export const registerProfitIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("profit:list", (_event, payload: unknown) => {
    requireSession();
    return profitService.list(profitListInputSchema.parse(payload ?? {}));
  });

  ipcMain.handle("profit:exportCsv", (_event, payload: unknown) => {
    requirePermission("canExportCsv");
    return profitService.exportCsv(profitListInputSchema.parse(payload ?? {}));
  });
};
