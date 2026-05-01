import type { IpcMain } from "electron";
import {
  inventoryCreateInputSchema,
  inventoryDeleteInputSchema,
  inventoryGetInputSchema,
  inventoryListInputSchema,
  inventoryRevealSecretInputSchema,
  inventoryUpdateInputSchema
} from "../../shared/contracts";
import { inventoryService } from "../services/inventory-service";
import { canAccessInventory } from "../services/auth-permissions";
import { requirePermission, requireSession } from "../services/auth-session";
import { cloudSyncPollingService } from "../integrations/cloud-sync/cloud-sync-polling-service";

const requireInventoryAccess = () => {
  const session = requireSession();
  if (!canAccessInventory(session.user)) {
    throw new Error("Acesso negado.");
  }
  return session;
};

export const registerInventoryIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("inventory:list", (_event, payload: unknown) => {
    requireInventoryAccess();
    return inventoryService.list(inventoryListInputSchema.parse(payload ?? {}));
  });

  ipcMain.handle("inventory:get", (_event, payload: unknown) => {
    requireInventoryAccess();
    const parsed = inventoryGetInputSchema.parse(payload);
    return inventoryService.get(parsed.id);
  });

  ipcMain.handle("inventory:create", (_event, payload: unknown) => {
    const session = requirePermission("canEditInventory");
    const result = inventoryService.create(inventoryCreateInputSchema.parse(payload), session.user.id);
    cloudSyncPollingService.notifyLocalChange();
    return result;
  });

  ipcMain.handle("inventory:update", (_event, payload: unknown) => {
    const session = requirePermission("canEditInventory");
    const parsed = inventoryUpdateInputSchema.parse(payload);
    const result = inventoryService.update(parsed.id, parsed.data, session.user.id);
    cloudSyncPollingService.notifyLocalChange();
    return result;
  });

  ipcMain.handle("inventory:delete", (_event, payload: unknown) => {
    requirePermission("canEditInventory");
    const parsed = inventoryDeleteInputSchema.parse(payload);
    inventoryService.delete(parsed.id);
    cloudSyncPollingService.notifyLocalChange();
    return { deleted: true };
  });

  ipcMain.handle("inventory:revealSecret", (_event, payload: unknown) => {
    const session = requirePermission("canRevealSecrets");
    return inventoryService.revealSecret(inventoryRevealSecretInputSchema.parse(payload), session.user.id);
  });

  ipcMain.handle("inventory:exportCsv", (_event, payload: unknown) => {
    requirePermission("canExportCsv");
    return inventoryService.exportCsv(inventoryListInputSchema.parse(payload ?? {}));
  });
};
