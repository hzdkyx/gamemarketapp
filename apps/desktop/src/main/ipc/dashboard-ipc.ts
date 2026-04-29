import type { IpcMain } from "electron";
import { requireSession } from "../services/auth-session";
import { dashboardService } from "../services/dashboard-service";

export const registerDashboardIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("dashboard:getSummary", () => {
    requireSession();
    return dashboardService.getSummary();
  });
};
