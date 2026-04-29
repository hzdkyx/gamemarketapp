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
    requirePermission("canEditProducts");
    return productVariantService.create(productVariantCreateInputSchema.parse(payload));
  });

  ipcMain.handle("productVariants:update", (_event, payload: unknown) => {
    requirePermission("canEditProducts");
    const parsed = productVariantUpdateInputSchema.parse(payload);
    return productVariantService.update(parsed.id, parsed.data);
  });

  ipcMain.handle("productVariants:duplicate", (_event, payload: unknown) => {
    requirePermission("canEditProducts");
    const parsed = productVariantDuplicateInputSchema.parse(payload);
    return productVariantService.duplicate(parsed.id);
  });

  ipcMain.handle("productVariants:archive", (_event, payload: unknown) => {
    requirePermission("canEditProducts");
    const parsed = productVariantDuplicateInputSchema.parse(payload);
    return productVariantService.archive(parsed.id);
  });

  ipcMain.handle("productVariants:markNeedsReview", (_event, payload: unknown) => {
    requirePermission("canEditProducts");
    const parsed = productVariantDuplicateInputSchema.parse(payload);
    return productVariantService.markNeedsReview(parsed.id);
  });

  ipcMain.handle("productVariants:delete", (_event, payload: unknown) => {
    requirePermission("canEditProducts");
    const parsed = productVariantDeleteInputSchema.parse(payload);
    productVariantService.delete(parsed.id);
    return { deleted: true };
  });

  ipcMain.handle("productVariants:exportCsv", (_event, payload: unknown) => {
    requirePermission("canExportCsv");
    const parsed = productVariantListInputSchema.parse(payload);
    return productVariantService.exportCsv(parsed.productId);
  });
};
