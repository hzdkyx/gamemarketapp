import type { IpcMain } from "electron";
import {
  orderArchiveInputSchema,
  orderChangeStatusInputSchema,
  orderCreateInputSchema,
  orderDeleteInputSchema,
  orderGetInputSchema,
  orderLinkInventoryItemInputSchema,
  orderListInputSchema,
  orderUnlinkInventoryItemInputSchema,
  orderUpdateInputSchema
} from "../../shared/contracts";
import { orderService } from "../services/order-service";
import { requirePermission, requireSession } from "../services/auth-session";

export const registerOrdersIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("orders:list", (_event, payload: unknown) => {
    requireSession();
    return orderService.list(orderListInputSchema.parse(payload ?? {}));
  });

  ipcMain.handle("orders:get", (_event, payload: unknown) => {
    requireSession();
    const parsed = orderGetInputSchema.parse(payload);
    return orderService.get(parsed.id);
  });

  ipcMain.handle("orders:create", (_event, payload: unknown) => {
    const session = requirePermission("canEditOrders");
    return orderService.create(orderCreateInputSchema.parse(payload), session.user.id);
  });

  ipcMain.handle("orders:update", (_event, payload: unknown) => {
    const session = requirePermission("canEditOrders");
    const parsed = orderUpdateInputSchema.parse(payload);
    return orderService.update(parsed.id, parsed.data, session.user.id);
  });

  ipcMain.handle("orders:delete", (_event, payload: unknown) => {
    requirePermission("canEditOrders");
    const parsed = orderDeleteInputSchema.parse(payload);
    orderService.delete(parsed.id);
    return { deleted: true };
  });

  ipcMain.handle("orders:archive", (_event, payload: unknown) => {
    const session = requirePermission("canEditOrders");
    const parsed = orderArchiveInputSchema.parse(payload);
    return orderService.archive(parsed.id, session.user.id);
  });

  ipcMain.handle("orders:changeStatus", (_event, payload: unknown) => {
    const session = requirePermission("canEditOrders");
    return orderService.changeStatus(orderChangeStatusInputSchema.parse(payload), session.user.id);
  });

  ipcMain.handle("orders:linkInventoryItem", (_event, payload: unknown) => {
    const session = requirePermission("canEditOrders");
    const parsed = orderLinkInventoryItemInputSchema.parse(payload);
    return orderService.linkInventoryItem(parsed.orderId, parsed.inventoryItemId, session.user.id);
  });

  ipcMain.handle("orders:unlinkInventoryItem", (_event, payload: unknown) => {
    const session = requirePermission("canEditOrders");
    const parsed = orderUnlinkInventoryItemInputSchema.parse(payload);
    return orderService.unlinkInventoryItem(parsed.orderId, session.user.id);
  });

  ipcMain.handle("orders:exportCsv", (_event, payload: unknown) => {
    requirePermission("canExportCsv");
    return orderService.exportCsv(orderListInputSchema.parse(payload ?? {}));
  });
};
