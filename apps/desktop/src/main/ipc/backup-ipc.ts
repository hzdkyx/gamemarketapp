import { shell, type IpcMain } from "electron";
import {
  backupCreateInputSchema,
  backupFileInputSchema,
  backupRestoreInputSchema,
  backupSettingsUpdateInputSchema,
} from "../../shared/contracts";
import { backupService } from "../services/backup-service";
import { requirePermission } from "../services/auth-session";

export const registerBackupIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("backup:getStatus", async () => {
    requirePermission("canManageSettings");
    return backupService.getStatus();
  });

  ipcMain.handle("backup:list", async () => {
    requirePermission("canManageSettings");
    return backupService.listBackups();
  });

  ipcMain.handle("backup:create", async (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    const parsed = backupCreateInputSchema.parse(payload ?? {});
    return backupService.createBackup(parsed.type);
  });

  ipcMain.handle("backup:restore", async (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    return backupService.restoreBackup(backupRestoreInputSchema.parse(payload));
  });

  ipcMain.handle("backup:delete", async (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    const parsed = backupFileInputSchema.parse(payload);
    return backupService.deleteBackup(parsed.filename);
  });

  ipcMain.handle("backup:openFolder", async () => {
    requirePermission("canManageSettings");
    const status = await backupService.getStatus();
    const result = await shell.openPath(status.backupsPath);
    return {
      opened: result.length === 0,
      safeMessage: result.length === 0 ? "Pasta de backups aberta." : "Não foi possível abrir a pasta de backups.",
    };
  });

  ipcMain.handle("backup:openLocation", async (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    const parsed = backupFileInputSchema.parse(payload);
    const backupPath = await backupService.resolveBackupPath(parsed.filename);
    shell.showItemInFolder(backupPath);
    return {
      opened: true,
      safeMessage: "Localização do backup aberta.",
    };
  });

  ipcMain.handle("backup:updateSettings", async (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    return backupService.updateSettings(backupSettingsUpdateInputSchema.parse(payload));
  });
};
