import type { IpcMain } from "electron";
import {
  productCreateInputSchema,
  productDeleteInputSchema,
  productGetInputSchema,
  productListInputSchema,
  productVariantCreateInputSchema,
  productVariantDeleteInputSchema,
  productVariantDuplicateInputSchema,
  productVariantGetInputSchema,
  productVariantListInputSchema,
  productVariantUpdateInputSchema,
  productUpdateInputSchema
} from "../../shared/contracts";
import { productService } from "../services/product-service";
import { productVariantService } from "../services/product-variant-service";
import { requirePermission, requireSession } from "../services/auth-session";
import { cloudSyncPollingService } from "../integrations/cloud-sync/cloud-sync-polling-service";

const scheduleCloudPush = <T>(result: T): T => {
  cloudSyncPollingService.notifyLocalChange();
  return result;
};

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
    return scheduleCloudPush(productService.create(productCreateInputSchema.parse(payload), session.user.id));
  });

  ipcMain.handle("products:update", (_event, payload: unknown) => {
    const session = requirePermission("canEditProducts");
    const parsed = productUpdateInputSchema.parse(payload);
    return scheduleCloudPush(productService.update(parsed.id, parsed.data, session.user.id));
  });

  ipcMain.handle("products:delete", (_event, payload: unknown) => {
    requirePermission("canEditProducts");
    const parsed = productDeleteInputSchema.parse(payload);
    productService.delete(parsed.id);
    cloudSyncPollingService.notifyLocalChange();
    return { deleted: true };
  });

  ipcMain.handle("products:exportCsv", (_event, payload: unknown) => {
    requirePermission("canExportCsv");
    return productService.exportCsv(productListInputSchema.parse(payload ?? {}));
  });

  ipcMain.handle("productVariants:listByProduct", (_event, payload: unknown) => {
    requireSession();
    const parsed = productVariantListInputSchema.parse(payload);
    return productVariantService.listByProduct(parsed.productId);
  });

  ipcMain.handle("productVariants:get", (_event, payload: unknown) => {
    requireSession();
    const parsed = productVariantGetInputSchema.parse(payload);
    return productVariantService.get(parsed.id);
  });

  ipcMain.handle("productVariants:create", (_event, payload: unknown) => {
    const session = requirePermission("canEditProducts");
    return scheduleCloudPush(productVariantService.create(productVariantCreateInputSchema.parse(payload), session.user.id));
  });

  ipcMain.handle("productVariants:update", (_event, payload: unknown) => {
    const session = requirePermission("canEditProducts");
    const parsed = productVariantUpdateInputSchema.parse(payload);
    return scheduleCloudPush(productVariantService.update(parsed.id, parsed.data, session.user.id));
  });

  ipcMain.handle("productVariants:duplicate", (_event, payload: unknown) => {
    const session = requirePermission("canEditProducts");
    const parsed = productVariantDuplicateInputSchema.parse(payload);
    return scheduleCloudPush(productVariantService.duplicate(parsed.id, session.user.id));
  });

  ipcMain.handle("productVariants:archive", (_event, payload: unknown) => {
    const session = requirePermission("canEditProducts");
    const parsed = productVariantDuplicateInputSchema.parse(payload);
    return scheduleCloudPush(productVariantService.archive(parsed.id, session.user.id));
  });

  ipcMain.handle("productVariants:markNeedsReview", (_event, payload: unknown) => {
    const session = requirePermission("canEditProducts");
    const parsed = productVariantDuplicateInputSchema.parse(payload);
    return scheduleCloudPush(productVariantService.markNeedsReview(parsed.id, session.user.id));
  });

  ipcMain.handle("productVariants:delete", (_event, payload: unknown) => {
    requirePermission("canEditProducts");
    const parsed = productVariantDeleteInputSchema.parse(payload);
    productVariantService.delete(parsed.id);
    cloudSyncPollingService.notifyLocalChange();
    return { deleted: true };
  });

  ipcMain.handle("productVariants:exportCsv", (_event, payload: unknown) => {
    requirePermission("canExportCsv");
    const parsed = productVariantListInputSchema.parse(payload);
    return productVariantService.exportCsv(parsed.productId);
  });
};
