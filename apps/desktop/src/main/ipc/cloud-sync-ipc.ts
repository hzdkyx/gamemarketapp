import type { IpcMain } from "electron";
import {
  cloudSyncBootstrapOwnerInputSchema,
  cloudSyncEmptyInputSchema,
  cloudSyncInviteUserInputSchema,
  cloudSyncLoginInputSchema,
  cloudSyncSettingsUpdateInputSchema,
  cloudSyncUpdateMemberInputSchema
} from "../../shared/contracts";
import { cloudSyncPollingService } from "../integrations/cloud-sync/cloud-sync-polling-service";
import { cloudSyncService } from "../integrations/cloud-sync/cloud-sync-service";
import { requirePermission, requireSession } from "../services/auth-session";

export const registerCloudSyncIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("cloudSync:getSettings", () => {
    requireSession();
    return cloudSyncService.getSettings();
  });

  ipcMain.handle("cloudSync:updateSettings", (_event, payload: unknown) => {
    requireSession();
    const result = cloudSyncService.updateSettings(cloudSyncSettingsUpdateInputSchema.parse(payload));
    cloudSyncPollingService.refresh();
    return result;
  });

  ipcMain.handle("cloudSync:testConnection", (_event, payload: unknown) => {
    requireSession();
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    return cloudSyncService.testConnection();
  });

  ipcMain.handle("cloudSync:bootstrapOwner", async (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    const result = await cloudSyncService.bootstrapOwner(cloudSyncBootstrapOwnerInputSchema.parse(payload));
    cloudSyncPollingService.refresh();
    return result;
  });

  ipcMain.handle("cloudSync:login", async (_event, payload: unknown) => {
    requireSession();
    const result = await cloudSyncService.login(cloudSyncLoginInputSchema.parse(payload));
    cloudSyncPollingService.refresh();
    return result;
  });

  ipcMain.handle("cloudSync:logout", async (_event, payload: unknown) => {
    requireSession();
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    const result = await cloudSyncService.logout();
    cloudSyncPollingService.refresh();
    return result;
  });

  ipcMain.handle("cloudSync:refreshAccount", async (_event, payload: unknown) => {
    requireSession();
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    return cloudSyncService.refreshAccount();
  });

  ipcMain.handle("cloudSync:listMembers", (_event, payload: unknown) => {
    requireSession();
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    return cloudSyncService.listMembers();
  });

  ipcMain.handle("cloudSync:inviteUser", (_event, payload: unknown) => {
    requireSession();
    return cloudSyncService.inviteUser(cloudSyncInviteUserInputSchema.parse(payload));
  });

  ipcMain.handle("cloudSync:updateMember", (_event, payload: unknown) => {
    requireSession();
    return cloudSyncService.updateMember(cloudSyncUpdateMemberInputSchema.parse(payload));
  });

  ipcMain.handle("cloudSync:publishLocalData", async (_event, payload: unknown) => {
    requirePermission("canManageSettings");
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    const result = await cloudSyncService.publishLocalData();
    cloudSyncPollingService.refresh();
    return result;
  });

  ipcMain.handle("cloudSync:downloadWorkspace", (_event, payload: unknown) => {
    requireSession();
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    return cloudSyncService.downloadWorkspace();
  });

  ipcMain.handle("cloudSync:syncNow", (_event, payload: unknown) => {
    requireSession();
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    return cloudSyncPollingService.runManual() ?? cloudSyncService.syncNow();
  });

  ipcMain.handle("cloudSync:getLastSyncSummary", (_event, payload: unknown) => {
    requireSession();
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    return cloudSyncService.getLastSyncSummary();
  });

  ipcMain.handle("cloudSync:getAutoSyncStatus", (_event, payload: unknown) => {
    requireSession();
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    return cloudSyncPollingService.getStatus();
  });

  ipcMain.handle("cloudSync:pauseAutoSync", (_event, payload: unknown) => {
    requireSession();
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    return cloudSyncPollingService.pause();
  });

  ipcMain.handle("cloudSync:resumeAutoSync", (_event, payload: unknown) => {
    requireSession();
    cloudSyncEmptyInputSchema.parse(payload ?? {});
    return cloudSyncPollingService.resume();
  });
};
