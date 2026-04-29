import type { IpcMain } from "electron";
import {
  productCreateInputSchema,
  productDeleteInputSchema,
  productGetInputSchema,
  productListInputSchema,
  productUpdateInputSchema
} from "../../shared/contracts";
import { productService } from "../services/product-service";
import { requirePermission, requireSession } from "../services/auth-session";

export const registerProductsIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle("products:list", (_event, payload: unknown) => {
    requireSession();
    return productService.list(productListInputSchema.parse(payload ?? {}));
  });

  ipcMain.handle("products:get", (_event, payload: unknown) => {
    requireSession();
    const parsed = productGetInputSchema.parse(payload);
    return productService.get(parsed.id);
  });

  ipcMain.handle("products:create", (_event, payload: unknown) => {
    const session = requirePermission("canEditProducts");
    return productService.create(productCreateInputSchema.parse(payload), session.user.id);
  });

  ipcMain.handle("products:update", (_event, payload: unknown) => {
    const session = requirePermission("canEditProducts");
    const parsed = productUpdateInputSchema.parse(payload);
    return productService.update(parsed.id, parsed.data, session.user.id);
  });

  ipcMain.handle("products:delete", (_event, payload: unknown) => {
    requirePermission("canEditProducts");
    const parsed = productDeleteInputSchema.parse(payload);
    productService.delete(parsed.id);
    return { deleted: true };
  });

  ipcMain.handle("products:exportCsv", (_event, payload: unknown) => {
    requirePermission("canExportCsv");
    return productService.exportCsv(productListInputSchema.parse(payload ?? {}));
  });
};
