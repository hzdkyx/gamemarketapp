import type { IpcMain } from "electron";
import { listAuditHistoryInputSchema } from "../../shared/contracts";
import { auditHistoryService } from "../services/audit-history-service";
import { requireSession } from "../services/auth-session";

export const registerAuditHistoryIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("audit:listEntityHistory", (_event, payload: unknown) => {
    requireSession();
    return auditHistoryService.list(listAuditHistoryInputSchema.parse(payload));
  });

  ipcMain.handle("audit:listProductHistory", (_event, payload: unknown) => {
    requireSession();
    return auditHistoryService.list(
      listAuditHistoryInputSchema.parse({
        ...(payload && typeof payload === "object" ? payload : {}),
        entityType: "product",
      }),
    );
  });

  ipcMain.handle("audit:listVariantHistory", (_event, payload: unknown) => {
    requireSession();
    return auditHistoryService.list(
      listAuditHistoryInputSchema.parse({
        ...(payload && typeof payload === "object" ? payload : {}),
        entityType: "variant",
      }),
    );
  });

  ipcMain.handle("audit:listOrderHistory", (_event, payload: unknown) => {
    requireSession();
    return auditHistoryService.list(
      listAuditHistoryInputSchema.parse({
        ...(payload && typeof payload === "object" ? payload : {}),
        entityType: "order",
      }),
    );
  });
};
