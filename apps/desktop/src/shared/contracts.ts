import { GAMEMARKET_FEE_PERCENT } from "@hzdk/shared";
import { z } from "zod";
import { CLOUD_SYNC_MIN_INTERVAL_SECONDS } from "./cloud-sync-intervals";

export const productStatusValues = [
  "active",
  "paused",
  "out_of_stock",
  "on_demand",
  "archived",
] as const;

export const deliveryTypeValues = [
  "manual",
  "automatic",
  "on_demand",
  "service",
] as const;

export const productVariantStatusValues = [
  "active",
  "paused",
  "out_of_stock",
  "archived",
] as const;

export const productVariantSourceValues = [
  "manual",
  "seeded_from_conversation",
  "gamemarket_sync",
  "imported",
] as const;

export const inventoryStatusValues = [
  "available",
  "reserved",
  "sold",
  "delivered",
  "problem",
  "refunded",
  "archived",
] as const;

export const productSortValues = [
  "name",
  "price",
  "profit",
  "stock",
  "status",
] as const;
export const sortDirectionValues = ["asc", "desc"] as const;
export const stockFilterValues = ["all", "low", "out"] as const;
export const profitDeliveryTypeFilterValues = [
  "all",
  ...deliveryTypeValues,
] as const;
export const profitStatusFilterValues = [
  "all",
  "active",
  "paused",
  "out_of_stock",
  "on_demand",
  "archived",
] as const;
export const profitReviewFilterValues = ["all", "needs_review", "ok"] as const;
export const profitMarginFilterValues = [
  "all",
  "low_margin",
  "medium_margin",
  "high_margin",
  "negative_profit",
] as const;
export const profitSortValues = [
  "profit_desc",
  "profit_asc",
  "margin_desc",
  "margin_asc",
  "sale_desc",
  "cost_desc",
  "stock_desc",
  "name_asc",
] as const;
export const marketplaceValues = ["gamemarket"] as const;
export const orderStatusValues = [
  "draft",
  "pending_payment",
  "payment_confirmed",
  "awaiting_delivery",
  "delivered",
  "completed",
  "cancelled",
  "refunded",
  "mediation",
  "problem",
  "archived",
] as const;
export const manualOrderInitialStatusValues = [
  "draft",
  "payment_confirmed",
  "awaiting_delivery",
] as const;
export const orderSortValues = [
  "date",
  "value",
  "profit",
  "status",
  "product",
] as const;
export const orderActionFilterValues = ["all", "pending", "clear"] as const;
export const eventSourceValues = [
  "manual",
  "system",
  "gamemarket_api",
  "gamemarket_future",
  "webhook_future",
  "webhook_server",
] as const;
export const eventSeverityValues = [
  "info",
  "success",
  "warning",
  "critical",
] as const;
export const eventTypeValues = [
  "auth.local_password_reset",
  "order.created",
  "order.payment_confirmed",
  "order.awaiting_delivery",
  "order.delivered",
  "order.completed",
  "order.status_corrected",
  "order.cancelled",
  "order.refunded",
  "order.mediation",
  "order.problem",
  "inventory.reserved",
  "inventory.released",
  "inventory.sold",
  "inventory.delivered",
  "inventory.problem",
  "product.low_stock",
  "product.out_of_stock",
  "security.secret_revealed",
  "integration.gamemarket.settings_updated",
  "integration.gamemarket.connection_tested",
  "integration.gamemarket.connection_failed",
  "integration.gamemarket.token_revealed",
  "integration.gamemarket.sync_started",
  "integration.gamemarket.sync_completed",
  "integration.gamemarket.sync_failed",
  "integration.gamemarket.order_imported",
  "integration.gamemarket.order_updated",
  "integration.gamemarket.product_imported",
  "integration.gamemarket.product_updated",
  "integration.webhook_server.settings_updated",
  "integration.webhook_server.connection_tested",
  "integration.webhook_server.connection_failed",
  "integration.webhook_server.token_revealed",
  "integration.webhook_server.sync_started",
  "integration.webhook_server.sync_completed",
  "integration.webhook_server.sync_failed",
  "integration.webhook_server.test_event_sent",
  "integration.webhook_server.event_imported",
  "integration.webhook_server.review_received",
  "integration.webhook_server.variant_sold_out",
  "integration.webhook_server.unknown_event",
  "cloud.conflict_detected",
  "cloud.conflict_resolved_local",
  "cloud.conflict_resolved_remote",
  "cloud.conflict_resolved_manual",
  "cloud.conflict_ignored",
  "cloud.conflict_resolution_failed",
  "audit.product_updated",
  "audit.variant_updated",
  "audit.inventory_updated",
  "audit.order_updated",
  "audit.order_status_changed",
  "audit.entity_history_recorded",
  "system.backup_created",
  "system.backup_failed",
  "system.backup_deleted",
  "system.restore_started",
  "system.restore_completed",
  "system.restore_failed",
  "system.restore_safety_backup_created",
  "system.notification_test",
] as const;
export const eventReadFilterValues = ["all", "read", "unread"] as const;
export const auditSourceValues = [
  "manual",
  "cloud_sync",
  "gamemarket_api",
  "webhook",
  "backup_restore",
  "system",
  "migration",
  "local_auth",
  "unknown",
] as const;
export const auditEntityTypeValues = [
  "product",
  "variant",
  "order",
  "inventory",
] as const;
export const appNotificationTypeValues = [
  "new_sale",
  "mediation_problem",
  "order_delivered",
  "order_completed",
  "internal_event",
  "system_test",
] as const;
export const gamemarketEnvironmentValues = [
  "production",
  "sandbox",
  "custom",
] as const;
export const gamemarketConnectionStatusValues = [
  "not_configured",
  "configured",
  "docs_missing",
  "connecting",
  "connected",
  "error",
  "syncing",
  "synced",
  "partial",
  "unavailable",
] as const;
export const webhookServerConnectionStatusValues = [
  "not_configured",
  "configured",
  "connecting",
  "connected",
  "error",
  "syncing",
  "synced",
  "partial",
  "unavailable",
] as const;
export const cloudRoleValues = [
  "owner",
  "admin",
  "manager",
  "operator",
  "viewer",
] as const;
export const cloudSyncModeValues = ["local", "cloud"] as const;
export const cloudSyncConnectionStatusValues = [
  "not_configured",
  "configured",
  "auth_required",
  "connected",
  "syncing",
  "synced",
  "partial",
  "conflict",
  "error",
  "unavailable",
] as const;
export const cloudSyncEntityTypeValues = [
  "products",
  "product_variants",
  "inventory_items",
  "orders",
  "events",
  "app_notifications",
  "settings",
] as const;
export const cloudSyncConflictStatusValues = [
  "pending",
  "resolved_local",
  "resolved_remote",
  "resolved_manual",
  "ignored",
  "failed",
] as const;
export const cloudSyncConflictSeverityValues = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export const cloudSyncConflictSourceValues = [
  "local_pull",
  "remote_dependency",
  "cloud_push",
  "manual",
] as const;
export const cloudSyncConflictResolutionTypeValues = [
  "keep_local",
  "use_remote",
  "manual",
  "ignore",
] as const;
export const inventorySecretFieldValues = [
  "accountLogin",
  "accountPassword",
  "accountEmail",
  "accountEmailPassword",
  "accessNotes",
] as const;
export const userRoleValues = ["admin", "operator", "viewer"] as const;
export const userStatusValues = ["active", "disabled"] as const;
export const LOCAL_RECOVERY_TEMPORARY_PASSWORD = "admin123!" as const;
export const permissionKeyValues = [
  "canManageUsers",
  "canManageSettings",
  "canRevealSecrets",
  "canEditProducts",
  "canEditInventory",
  "canEditOrders",
  "canExportCsv",
] as const;

const nullableTextSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().or(z.null()).optional());

const nullableEmailSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().email("Informe um e-mail válido.").max(160).or(z.null()).optional());

const nullableCloudUsernameSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().min(3, "Usuário deve ter pelo menos 3 caracteres.").max(80).or(z.null()).optional());

const requiredTextSchema = z.string().trim().min(1, "Campo obrigatório.");
const nonNegativeMoneySchema = z.number().finite().nonnegative();
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const idSchema = z.string().trim().min(1);
const usernameSchema = z
  .string()
  .trim()
  .min(3, "Usuário deve ter pelo menos 3 caracteres.")
  .max(64)
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Use letras, números, ponto, hífen ou sublinhado.",
  );
const passwordSchema = z
  .string()
  .min(8, "Senha deve ter pelo menos 8 caracteres.");
const passwordHintSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().max(120, "Dica de senha deve ter no máximo 120 caracteres.").or(z.null()).optional());

const normalizePasswordComparable = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const editDistance = (left: string, right: string): number => {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + cost,
      );
    }

    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index] ?? 0;
    }
  }

  return previous[right.length] ?? 0;
};

export const isPasswordHintTooSimilar = (
  password: string,
  passwordHint: string | null | undefined,
): boolean => {
  if (!passwordHint) {
    return false;
  }

  const passwordComparable = normalizePasswordComparable(password);
  const hintComparable = normalizePasswordComparable(passwordHint);

  if (!passwordComparable || !hintComparable) {
    return false;
  }

  if (passwordComparable === hintComparable) {
    return true;
  }

  const shorter =
    passwordComparable.length <= hintComparable.length
      ? passwordComparable
      : hintComparable;
  const longer =
    passwordComparable.length > hintComparable.length
      ? passwordComparable
      : hintComparable;

  if (
    shorter.length >= 6 &&
    longer.includes(shorter) &&
    shorter.length / longer.length >= 0.75
  ) {
    return true;
  }

  const maxLength = Math.max(passwordComparable.length, hintComparable.length);
  const minLength = Math.min(passwordComparable.length, hintComparable.length);
  if (minLength < 6 || minLength / maxLength < 0.7) {
    return false;
  }

  return (
    1 - editDistance(passwordComparable, hintComparable) / maxLength >= 0.82
  );
};

const validatePasswordHintSafety = (
  input: { password: string; passwordHint?: string | null | undefined },
  context: z.RefinementCtx,
): void => {
  if (isPasswordHintTooSimilar(input.password, input.passwordHint)) {
    context.addIssue({
      code: "custom",
      path: ["passwordHint"],
      message: "A dica não pode ser igual ou muito parecida com a senha.",
    });
  }
};

const enumWithDefaultSchema = <T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
  aliases: Record<string, T[number]> = {},
) =>
  z.preprocess((value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    const match = values.find((item) => item === normalized);
    return match ?? aliases[normalized] ?? fallback;
  }, z.enum(values).default(fallback));

export const productStatusSchema = z.enum(productStatusValues);
export const deliveryTypeSchema = z.enum(deliveryTypeValues);
export const productVariantStatusSchema = z.enum(productVariantStatusValues);
export const productVariantSourceSchema = z.enum(productVariantSourceValues);
export const inventoryStatusSchema = z.enum(inventoryStatusValues);
export const inventorySecretFieldSchema = z.enum(inventorySecretFieldValues);
export const marketplaceSchema = z.enum(marketplaceValues);
export const orderStatusSchema = z.enum(orderStatusValues);
export const manualOrderInitialStatusSchema = z.enum(
  manualOrderInitialStatusValues,
);
export const eventSourceSchema = z.enum(eventSourceValues);
export const eventSeveritySchema = z.enum(eventSeverityValues);
export const eventTypeSchema = z.enum(eventTypeValues);
export const auditSourceSchema = z.enum(auditSourceValues);
export const auditEntityTypeSchema = z.enum(auditEntityTypeValues);
export const appNotificationTypeSchema = z.enum(appNotificationTypeValues);
export const userRoleSchema = z.enum(userRoleValues);
export const userStatusSchema = z.enum(userStatusValues);
export const gamemarketEnvironmentSchema = z.enum(gamemarketEnvironmentValues);
export const gamemarketConnectionStatusSchema = z.enum(
  gamemarketConnectionStatusValues,
);
export const webhookServerConnectionStatusSchema = z.enum(
  webhookServerConnectionStatusValues,
);
export const cloudRoleSchema = z.enum(cloudRoleValues);
export const cloudSyncModeSchema = z.enum(cloudSyncModeValues);
export const cloudSyncConnectionStatusSchema = z.enum(
  cloudSyncConnectionStatusValues,
);
export const cloudSyncEntityTypeSchema = z.enum(cloudSyncEntityTypeValues);
export const cloudSyncConflictStatusSchema = z.enum(
  cloudSyncConflictStatusValues,
);
export const cloudSyncConflictSeveritySchema = z.enum(
  cloudSyncConflictSeverityValues,
);
export const cloudSyncConflictSourceSchema = z.enum(
  cloudSyncConflictSourceValues,
);
export const cloudSyncConflictResolutionTypeSchema = z.enum(
  cloudSyncConflictResolutionTypeValues,
);

export const productCreateInputSchema = z
  .object({
    internalCode: nullableTextSchema,
    name: requiredTextSchema,
    category: nullableTextSchema,
    game: nullableTextSchema,
    platform: nullableTextSchema,
    listingUrl: nullableTextSchema,
    salePrice: nonNegativeMoneySchema.default(0),
    unitCost: nonNegativeMoneySchema.default(0),
    feePercent: z
      .number()
      .finite()
      .min(0)
      .lt(100)
      .default(GAMEMARKET_FEE_PERCENT),
    stockCurrent: nonNegativeIntegerSchema.default(0),
    stockMin: nonNegativeIntegerSchema.default(1),
    status: productStatusSchema.default("active"),
    deliveryType: deliveryTypeSchema.default("manual"),
    supplierId: nullableTextSchema,
    notes: nullableTextSchema,
  })
  .strict();

export const productUpdateDataSchema = z
  .object({
    internalCode: nullableTextSchema,
    name: requiredTextSchema.optional(),
    category: nullableTextSchema,
    game: nullableTextSchema,
    platform: nullableTextSchema,
    listingUrl: nullableTextSchema,
    salePrice: nonNegativeMoneySchema.optional(),
    unitCost: nonNegativeMoneySchema.optional(),
    feePercent: z.number().finite().min(0).lt(100).optional(),
    stockCurrent: nonNegativeIntegerSchema.optional(),
    stockMin: nonNegativeIntegerSchema.optional(),
    status: productStatusSchema.optional(),
    deliveryType: deliveryTypeSchema.optional(),
    supplierId: nullableTextSchema,
    notes: nullableTextSchema,
  })
  .strict();

export const productUpdateInputSchema = z
  .object({
    id: idSchema,
    data: productUpdateDataSchema,
  })
  .strict();

export const productDeleteInputSchema = z.object({ id: idSchema }).strict();
export const productGetInputSchema = z.object({ id: idSchema }).strict();

export const productVariantCreateInputSchema = z
  .object({
    productId: idSchema,
    variantCode: nullableTextSchema,
    name: requiredTextSchema,
    description: nullableTextSchema,
    salePrice: nonNegativeMoneySchema.default(0),
    unitCost: nonNegativeMoneySchema.default(0),
    feePercent: z
      .number()
      .finite()
      .min(0)
      .lt(100)
      .default(GAMEMARKET_FEE_PERCENT),
    stockCurrent: nonNegativeIntegerSchema.default(0),
    stockMin: nonNegativeIntegerSchema.default(0),
    supplierName: nullableTextSchema,
    supplierUrl: nullableTextSchema,
    deliveryType: deliveryTypeSchema.default("manual"),
    status: productVariantStatusSchema.default("active"),
    notes: nullableTextSchema,
    source: productVariantSourceSchema.default("manual"),
    needsReview: z.boolean().default(false),
  })
  .strict();

export const productVariantUpdateDataSchema = z
  .object({
    variantCode: nullableTextSchema,
    name: requiredTextSchema.optional(),
    description: nullableTextSchema,
    salePrice: nonNegativeMoneySchema.optional(),
    unitCost: nonNegativeMoneySchema.optional(),
    feePercent: z.number().finite().min(0).lt(100).optional(),
    stockCurrent: nonNegativeIntegerSchema.optional(),
    stockMin: nonNegativeIntegerSchema.optional(),
    supplierName: nullableTextSchema,
    supplierUrl: nullableTextSchema,
    deliveryType: deliveryTypeSchema.optional(),
    status: productVariantStatusSchema.optional(),
    notes: nullableTextSchema,
    source: productVariantSourceSchema.optional(),
    needsReview: z.boolean().optional(),
  })
  .strict();

export const productVariantUpdateInputSchema = z
  .object({
    id: idSchema,
    data: productVariantUpdateDataSchema,
  })
  .strict();

export const productVariantDeleteInputSchema = z
  .object({ id: idSchema })
  .strict();
export const productVariantGetInputSchema = z.object({ id: idSchema }).strict();
export const productVariantListInputSchema = z
  .object({ productId: idSchema })
  .strict();
export const productVariantDuplicateInputSchema = z
  .object({ id: idSchema })
  .strict();

export const profitListInputSchema = z
  .object({
    search: nullableTextSchema,
    category: nullableTextSchema,
    deliveryType: enumWithDefaultSchema(profitDeliveryTypeFilterValues, "all"),
    status: enumWithDefaultSchema(profitStatusFilterValues, "all"),
    review: enumWithDefaultSchema(profitReviewFilterValues, "all", {
      reviewed: "ok",
      false: "ok",
      true: "needs_review",
      needsreview: "needs_review",
    }),
    margin: enumWithDefaultSchema(profitMarginFilterValues, "all", {
      low: "low_margin",
      medium: "medium_margin",
      high: "high_margin",
      negative: "negative_profit",
    }),
    sortBy: enumWithDefaultSchema(profitSortValues, "profit_desc"),
  })
  .strict();

export const productListInputSchema = z
  .object({
    search: nullableTextSchema,
    status: productStatusSchema.or(z.literal("all")).default("all"),
    category: nullableTextSchema,
    stock: z.enum(stockFilterValues).default("all"),
    sortBy: z.enum(productSortValues).default("name"),
    sortDirection: z.enum(sortDirectionValues).default("asc"),
  })
  .strict();

export const inventoryCreateInputSchema = z
  .object({
    inventoryCode: nullableTextSchema,
    productId: nullableTextSchema,
    productVariantId: nullableTextSchema,
    supplierId: nullableTextSchema,
    purchaseCost: nonNegativeMoneySchema.default(0),
    status: inventoryStatusSchema.default("available"),
    accountLogin: nullableTextSchema,
    accountPassword: nullableTextSchema,
    accountEmail: nullableTextSchema,
    accountEmailPassword: nullableTextSchema,
    accessNotes: nullableTextSchema,
    publicNotes: nullableTextSchema,
    boughtAt: nullableTextSchema,
    soldAt: nullableTextSchema,
    deliveredAt: nullableTextSchema,
    orderId: nullableTextSchema,
  })
  .strict();

export const inventoryUpdateDataSchema = z
  .object({
    inventoryCode: nullableTextSchema,
    productId: nullableTextSchema,
    productVariantId: nullableTextSchema,
    supplierId: nullableTextSchema,
    purchaseCost: nonNegativeMoneySchema.optional(),
    status: inventoryStatusSchema.optional(),
    accountLogin: nullableTextSchema,
    accountPassword: nullableTextSchema,
    accountEmail: nullableTextSchema,
    accountEmailPassword: nullableTextSchema,
    accessNotes: nullableTextSchema,
    publicNotes: nullableTextSchema,
    boughtAt: nullableTextSchema,
    soldAt: nullableTextSchema,
    deliveredAt: nullableTextSchema,
    orderId: nullableTextSchema,
  })
  .strict();

export const inventoryUpdateInputSchema = z
  .object({
    id: idSchema,
    data: inventoryUpdateDataSchema,
  })
  .strict();

export const inventoryDeleteInputSchema = z.object({ id: idSchema }).strict();
export const inventoryGetInputSchema = z.object({ id: idSchema }).strict();

export const inventoryListInputSchema = z
  .object({
    search: nullableTextSchema,
    productId: nullableTextSchema,
    category: nullableTextSchema,
    status: inventoryStatusSchema.or(z.literal("all")).default("all"),
    supplierId: nullableTextSchema,
    sortDirection: z.enum(sortDirectionValues).default("asc"),
  })
  .strict();

export const inventoryRevealSecretInputSchema = z
  .object({
    id: idSchema,
    field: inventorySecretFieldSchema,
  })
  .strict();

export const orderCreateInputSchema = z
  .object({
    orderCode: nullableTextSchema,
    externalOrderId: nullableTextSchema,
    marketplace: marketplaceSchema.default("gamemarket"),
    productId: idSchema,
    productVariantId: nullableTextSchema,
    inventoryItemId: nullableTextSchema,
    buyerName: nullableTextSchema,
    buyerContact: nullableTextSchema,
    salePrice: nonNegativeMoneySchema.optional(),
    unitCost: nonNegativeMoneySchema.optional(),
    feePercent: z
      .number()
      .finite()
      .min(0)
      .lt(100)
      .default(GAMEMARKET_FEE_PERCENT),
    status: manualOrderInitialStatusSchema.default("draft"),
    marketplaceUrl: nullableTextSchema,
    notes: nullableTextSchema,
  })
  .strict();

export const orderUpdateDataSchema = z
  .object({
    orderCode: nullableTextSchema,
    externalOrderId: nullableTextSchema,
    marketplace: marketplaceSchema.optional(),
    productId: idSchema.optional(),
    productVariantId: nullableTextSchema,
    inventoryItemId: nullableTextSchema,
    buyerName: nullableTextSchema,
    buyerContact: nullableTextSchema,
    salePrice: nonNegativeMoneySchema.optional(),
    unitCost: nonNegativeMoneySchema.optional(),
    feePercent: z.number().finite().min(0).lt(100).optional(),
    actionRequired: z.boolean().optional(),
    marketplaceUrl: nullableTextSchema,
    notes: nullableTextSchema,
  })
  .strict();

export const orderUpdateInputSchema = z
  .object({
    id: idSchema,
    data: orderUpdateDataSchema,
  })
  .strict();

export const orderGetInputSchema = z.object({ id: idSchema }).strict();
export const orderDeleteInputSchema = z.object({ id: idSchema }).strict();
export const orderArchiveInputSchema = z.object({ id: idSchema }).strict();

export const orderChangeStatusInputSchema = z
  .object({
    id: idSchema,
    status: orderStatusSchema,
    notes: nullableTextSchema,
    manualCompletionConfirmed: z.boolean().optional(),
  })
  .strict();

export const orderLinkInventoryItemInputSchema = z
  .object({
    orderId: idSchema,
    inventoryItemId: idSchema,
  })
  .strict();

export const orderUnlinkInventoryItemInputSchema = z
  .object({
    orderId: idSchema,
  })
  .strict();

export const orderListInputSchema = z
  .object({
    search: nullableTextSchema,
    status: orderStatusSchema.or(z.literal("all")).default("all"),
    productId: nullableTextSchema,
    category: nullableTextSchema,
    dateFrom: nullableTextSchema,
    dateTo: nullableTextSchema,
    actionRequired: z.enum(orderActionFilterValues).default("all"),
    sortBy: z.enum(orderSortValues).default("date"),
    sortDirection: z.enum(sortDirectionValues).default("desc"),
  })
  .strict();

export const eventGetInputSchema = z.object({ id: idSchema }).strict();
export const eventMarkReadInputSchema = z.object({ id: idSchema }).strict();

export const eventCreateManualInputSchema = z
  .object({
    type: eventTypeSchema,
    severity: eventSeveritySchema.default("info"),
    title: requiredTextSchema,
    message: nullableTextSchema,
    orderId: nullableTextSchema,
    productId: nullableTextSchema,
    inventoryItemId: nullableTextSchema,
    rawPayload: z.unknown().optional(),
  })
  .strict();

export const eventListInputSchema = z
  .object({
    search: nullableTextSchema,
    type: eventTypeSchema.or(z.literal("all")).default("all"),
    severity: eventSeveritySchema.or(z.literal("all")).default("all"),
    orderId: nullableTextSchema,
    productId: nullableTextSchema,
    read: z.enum(eventReadFilterValues).default("all"),
    dateFrom: nullableTextSchema,
    dateTo: nullableTextSchema,
  })
  .strict();

export const listAuditHistoryInputSchema = z
  .object({
    entityType: auditEntityTypeSchema,
    entityId: idSchema,
    source: auditSourceSchema.or(z.literal("all")).default("all"),
    search: nullableTextSchema,
    limit: z.number().int().positive().max(100).default(30),
    offset: z.number().int().nonnegative().default(0),
  })
  .strict();

export const appNotificationListInputSchema = z
  .object({
    limit: z.number().int().positive().max(100).default(20),
    unreadOnly: z.boolean().default(false),
  })
  .strict();

export const appNotificationMarkReadInputSchema = z
  .object({ id: idSchema })
  .strict();

export const notificationSettingsSchema = z
  .object({
    desktopEnabled: z.boolean().default(true),
    localNotificationsEnabled: z.boolean().default(true),
    soundEnabled: z.boolean().default(true),
    soundVolume: z.number().finite().min(0).max(1).default(0.7),
    showWhenMinimized: z.boolean().default(true),
    automaticPollingEnabled: z.boolean().default(true),
    pollingIntervalSeconds: z.number().int().min(15).max(3600).default(60),
    notifyNewSale: z.boolean().default(true),
    notifyMediationProblem: z.boolean().default(true),
    notifyOrderDelivered: z.boolean().default(true),
    notifyOrderCompleted: z.boolean().default(true),
    enabledEventTypes: z.record(z.string(), z.boolean()).default({}),
  })
  .strict();

export const notificationSettingsUpdateInputSchema = notificationSettingsSchema
  .partial()
  .strict();

export const backupOriginValues = ["manual", "automatic", "safety"] as const;
export const backupFrequencyValues = ["startup", "daily", "weekly"] as const;

export const backupOriginSchema = z.enum(backupOriginValues);
export const backupFrequencySchema = z.enum(backupFrequencyValues);

export const backupCreateInputSchema = z
  .object({
    type: backupOriginSchema.default("manual"),
  })
  .strict();

export const backupFileInputSchema = z
  .object({
    filename: z
      .string()
      .trim()
      .min(1)
      .max(180)
      .regex(/^[a-zA-Z0-9._-]+\.sqlite$/, "Backup inválido."),
  })
  .strict();

export const backupRestoreInputSchema = backupFileInputSchema
  .extend({
    confirmation: z.literal("RESTAURAR"),
  })
  .strict();

export const backupSettingsSchema = z
  .object({
    automaticEnabled: z.boolean().default(true),
    frequency: backupFrequencySchema.default("daily"),
    retentionCount: z.number().int().min(1).max(100).default(10),
    lastAutomaticBackupAt: z.string().nullable().default(null),
  })
  .strict();

export const backupSettingsUpdateInputSchema = z
  .object({
    automaticEnabled: z.boolean().optional(),
    frequency: backupFrequencySchema.optional(),
    retentionCount: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const gamemarketSettingsUpdateInputSchema = z
  .object({
    apiBaseUrl: z
      .string()
      .trim()
      .url("Informe uma URL válida.")
      .max(500)
      .optional(),
    token: z.string().trim().min(8, "Token muito curto.").max(500).optional(),
    clearToken: z.boolean().optional(),
    integrationName: z
      .string()
      .trim()
      .min(1, "Campo obrigatório.")
      .max(120)
      .optional(),
    environment: gamemarketEnvironmentSchema.optional(),
  })
  .strict()
  .refine((input) => !(input.token && input.clearToken), {
    path: ["clearToken"],
    message: "Não é possível salvar e remover o token na mesma operação.",
  });

export const gamemarketRevealTokenInputSchema = z
  .object({
    confirm: z.literal(true),
  })
  .strict();

export const gamemarketEmptyInputSchema = z.object({}).strict();

export const webhookServerSettingsUpdateInputSchema = z
  .object({
    backendUrl: z
      .string()
      .trim()
      .url("Informe uma URL válida.")
      .max(500)
      .optional(),
    appSyncToken: z
      .string()
      .trim()
      .min(8, "Token muito curto.")
      .max(500)
      .optional(),
    clearToken: z.boolean().optional(),
    pollingEnabled: z.boolean().optional(),
    pollingIntervalSeconds: z.number().int().min(15).max(3600).optional(),
  })
  .strict()
  .refine((input) => !(input.appSyncToken && input.clearToken), {
    path: ["clearToken"],
    message: "Não é possível salvar e remover o token na mesma operação.",
  });

export const webhookServerRevealTokenInputSchema = z
  .object({
    confirm: z.literal(true),
  })
  .strict();

export const webhookServerEmptyInputSchema = z.object({}).strict();

export const cloudSyncSettingsUpdateInputSchema = z
  .object({
    backendUrl: z
      .string()
      .trim()
      .url("Informe uma URL válida.")
      .max(500)
      .optional(),
    mode: cloudSyncModeSchema.optional(),
    workspaceId: nullableTextSchema,
    autoSyncEnabled: z.boolean().optional(),
    syncIntervalSeconds: z
      .number()
      .int()
      .min(CLOUD_SYNC_MIN_INTERVAL_SECONDS)
      .max(86_400)
      .optional(),
    clearSession: z.boolean().optional(),
  })
  .strict();

export const cloudSyncBootstrapOwnerInputSchema = z
  .object({
    name: requiredTextSchema,
    email: nullableEmailSchema,
    username: nullableCloudUsernameSchema,
    password: passwordSchema,
    workspaceName: z
      .string()
      .trim()
      .min(2)
      .max(120)
      .default("HzdKyx GameMarket"),
  })
  .strict()
  .refine((input) => Boolean(input.email || input.username), {
    message: "Informe e-mail ou usuário.",
    path: ["identifier"],
  });

export const cloudSyncLoginInputSchema = z
  .object({
    identifier: z.string().trim().min(3).max(160),
    password: z.string().min(1, "Campo obrigatório."),
  })
  .strict();

export const cloudSyncChangePasswordInputSchema = z
  .object({
    currentPassword: passwordSchema,
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });

export const cloudSyncInviteUserInputSchema = z
  .object({
    name: requiredTextSchema,
    email: nullableEmailSchema,
    username: nullableCloudUsernameSchema,
    password: passwordSchema,
    role: cloudRoleSchema.exclude(["owner"]).default("manager"),
  })
  .strict()
  .refine((input) => Boolean(input.email || input.username), {
    message: "Informe e-mail ou usuário.",
    path: ["identifier"],
  });

const cloudSyncMemberUpdateFieldsSchema = z
  .object({
    name: requiredTextSchema.optional(),
    email: nullableEmailSchema,
    username: nullableCloudUsernameSchema,
    role: cloudRoleSchema.optional(),
    status: userStatusSchema.optional(),
  })
  .strict();

const hasCloudMemberUpdates = (input: Record<string, unknown>): boolean =>
  Object.values(input).some((value) => value !== undefined);

export const cloudSyncUpdateMemberInputSchema = cloudSyncMemberUpdateFieldsSchema
  .extend({
    userId: idSchema,
  })
  .refine(
    (input) =>
      hasCloudMemberUpdates({
        name: input.name,
        email: input.email,
        username: input.username,
        role: input.role,
        status: input.status,
      }),
    {
      message: "Informe pelo menos um campo para atualizar.",
    },
  );

export const cloudSyncMemberActionInputSchema = z
  .object({
    userId: idSchema,
  })
  .strict();

export const cloudSyncRemoveMemberInputSchema = z
  .object({
    userId: idSchema,
    confirmation: z.string().trim().min(1).max(160),
  })
  .strict();

export const cloudSyncResetMemberPasswordInputSchema = z
  .object({
    userId: idSchema,
    temporaryPassword: passwordSchema,
    confirmPassword: passwordSchema,
    mustChangePassword: z.boolean().default(true),
  })
  .strict()
  .refine((input) => input.temporaryPassword === input.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });

export const cloudSyncConflictListInputSchema = z
  .object({
    status: z
      .union([cloudSyncConflictStatusSchema, z.literal("all")])
      .default("pending"),
    entityType: z
      .union([cloudSyncEntityTypeSchema, z.literal("all")])
      .default("all"),
    severity: z
      .union([cloudSyncConflictSeveritySchema, z.literal("all")])
      .default("all"),
    source: z
      .union([cloudSyncConflictSourceSchema, z.literal("all")])
      .default("all"),
    search: z.string().trim().max(120).optional().default(""),
    dateFrom: z.string().trim().max(40).nullable().optional(),
    dateTo: z.string().trim().max(40).nullable().optional(),
    limit: z.number().int().min(1).max(250).optional().default(100),
  })
  .strict();

export const cloudSyncConflictDetailInputSchema = z
  .object({
    id: idSchema,
  })
  .strict();

export const cloudSyncConflictResolveInputSchema = z
  .object({
    id: idSchema,
    resolutionType: cloudSyncConflictResolutionTypeSchema,
    manualPayload: z.record(z.string(), z.unknown()).optional(),
    note: z.string().trim().max(500).optional(),
    confirm: z.boolean().optional(),
  })
  .strict();

export const cloudSyncEmptyInputSchema = z.object({}).strict();

export const authLoginInputSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(1, "Campo obrigatório."),
  })
  .strict();

export const authSetupAdminInputSchema = z
  .object({
    name: requiredTextSchema,
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Campo obrigatório."),
    passwordHint: passwordHintSchema,
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  })
  .superRefine(validatePasswordHintSafety);

export const authChangePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, "Campo obrigatório."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Campo obrigatório."),
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  });

export const userCreateInputSchema = z
  .object({
    name: requiredTextSchema,
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Campo obrigatório."),
    passwordHint: passwordHintSchema,
    role: userRoleSchema.default("operator"),
    status: userStatusSchema.default("active"),
    allowRevealSecrets: z.boolean().default(false),
    mustChangePassword: z.boolean().default(true),
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  })
  .superRefine(validatePasswordHintSafety);

export const userUpdateInputSchema = z
  .object({
    id: idSchema,
    data: z
      .object({
        name: requiredTextSchema.optional(),
        username: usernameSchema.optional(),
        passwordHint: passwordHintSchema,
        role: userRoleSchema.optional(),
        status: userStatusSchema.optional(),
        allowRevealSecrets: z.boolean().optional(),
        mustChangePassword: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();

export const userResetPasswordInputSchema = z
  .object({
    id: idSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Campo obrigatório."),
    mustChangePassword: z.boolean().default(true),
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem.",
  });

export const authLocalPasswordResetInputSchema = z
  .object({
    userId: idSchema,
    usernameConfirmation: usernameSchema,
    confirmLocalOnly: z.literal(true),
    confirmTemporaryPassword: z.literal(true),
  })
  .strict();

export type ProductStatus = (typeof productStatusValues)[number];
export type DeliveryType = (typeof deliveryTypeValues)[number];
export type ProductVariantStatus = (typeof productVariantStatusValues)[number];
export type ProductVariantSource = (typeof productVariantSourceValues)[number];
export type InventoryStatus = (typeof inventoryStatusValues)[number];
export type ProductSort = (typeof productSortValues)[number];
export type SortDirection = (typeof sortDirectionValues)[number];
export type StockFilter = (typeof stockFilterValues)[number];
export type ProfitDeliveryTypeFilter =
  (typeof profitDeliveryTypeFilterValues)[number];
export type ProfitStatusFilter = (typeof profitStatusFilterValues)[number];
export type ProfitReviewFilter = (typeof profitReviewFilterValues)[number];
export type ProfitMarginFilter = (typeof profitMarginFilterValues)[number];
export type ProfitSort = (typeof profitSortValues)[number];
export type InventorySecretField = (typeof inventorySecretFieldValues)[number];
export type UserRole = (typeof userRoleValues)[number];
export type UserStatus = (typeof userStatusValues)[number];
export type PermissionKey = (typeof permissionKeyValues)[number];
export type Permissions = Record<PermissionKey, boolean>;
export type Marketplace = (typeof marketplaceValues)[number];
export type OrderStatus = (typeof orderStatusValues)[number];
export type ManualOrderInitialStatus =
  (typeof manualOrderInitialStatusValues)[number];
export type OrderSort = (typeof orderSortValues)[number];
export type OrderActionFilter = (typeof orderActionFilterValues)[number];
export type EventSource = (typeof eventSourceValues)[number];
export type EventSeverity = (typeof eventSeverityValues)[number];
export type EventType = (typeof eventTypeValues)[number];
export type EventReadFilter = (typeof eventReadFilterValues)[number];
export type AuditSource = (typeof auditSourceValues)[number];
export type AuditEntityType = (typeof auditEntityTypeValues)[number];
export type AppNotificationType = (typeof appNotificationTypeValues)[number];
export type GameMarketEnvironment =
  (typeof gamemarketEnvironmentValues)[number];
export type GameMarketConnectionStatus =
  (typeof gamemarketConnectionStatusValues)[number];
export type WebhookServerConnectionStatus =
  (typeof webhookServerConnectionStatusValues)[number];
export type CloudRole = (typeof cloudRoleValues)[number];
export type CloudSyncMode = (typeof cloudSyncModeValues)[number];
export type CloudSyncConnectionStatus =
  (typeof cloudSyncConnectionStatusValues)[number];
export type CloudSyncEntityType = (typeof cloudSyncEntityTypeValues)[number];
export type CloudSyncConflictStatus =
  (typeof cloudSyncConflictStatusValues)[number];
export type CloudSyncConflictSeverity =
  (typeof cloudSyncConflictSeverityValues)[number];
export type CloudSyncConflictSource =
  (typeof cloudSyncConflictSourceValues)[number];
export type CloudSyncConflictResolutionType =
  (typeof cloudSyncConflictResolutionTypeValues)[number];

export type ProductCreateInput = z.infer<typeof productCreateInputSchema>;
export type ProductUpdateData = z.infer<typeof productUpdateDataSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateInputSchema>;
export type ProductListInput = z.infer<typeof productListInputSchema>;
export type ProductVariantCreateInput = z.infer<
  typeof productVariantCreateInputSchema
>;
export type ProductVariantUpdateData = z.infer<
  typeof productVariantUpdateDataSchema
>;
export type ProductVariantUpdateInput = z.infer<
  typeof productVariantUpdateInputSchema
>;
export type ProductVariantListInput = z.infer<
  typeof productVariantListInputSchema
>;
export type ProductVariantDuplicateInput = z.infer<
  typeof productVariantDuplicateInputSchema
>;
export type ProfitListInput = z.infer<typeof profitListInputSchema>;
export type InventoryCreateInput = z.infer<typeof inventoryCreateInputSchema>;
export type InventoryUpdateData = z.infer<typeof inventoryUpdateDataSchema>;
export type InventoryUpdateInput = z.infer<typeof inventoryUpdateInputSchema>;
export type InventoryListInput = z.infer<typeof inventoryListInputSchema>;
export type InventoryRevealSecretInput = z.infer<
  typeof inventoryRevealSecretInputSchema
>;
export type OrderCreateInput = z.infer<typeof orderCreateInputSchema>;
export type OrderUpdateData = z.infer<typeof orderUpdateDataSchema>;
export type OrderUpdateInput = z.infer<typeof orderUpdateInputSchema>;
export type OrderListInput = z.infer<typeof orderListInputSchema>;
export type OrderChangeStatusInput = z.infer<
  typeof orderChangeStatusInputSchema
>;
export type OrderLinkInventoryItemInput = z.infer<
  typeof orderLinkInventoryItemInputSchema
>;
export type OrderUnlinkInventoryItemInput = z.infer<
  typeof orderUnlinkInventoryItemInputSchema
>;
export type EventCreateManualInput = z.infer<
  typeof eventCreateManualInputSchema
>;
export type EventListInput = z.infer<typeof eventListInputSchema>;
export type ListAuditHistoryInput = z.infer<
  typeof listAuditHistoryInputSchema
>;
export type AppNotificationListInput = z.infer<
  typeof appNotificationListInputSchema
>;
export type AppNotificationMarkReadInput = z.infer<
  typeof appNotificationMarkReadInputSchema
>;
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type NotificationSettingsUpdateInput = z.infer<
  typeof notificationSettingsUpdateInputSchema
>;
export type BackupOrigin = (typeof backupOriginValues)[number];
export type BackupFrequency = (typeof backupFrequencyValues)[number];
export type BackupCreateInput = z.infer<typeof backupCreateInputSchema>;
export type BackupFileInput = z.infer<typeof backupFileInputSchema>;
export type BackupRestoreInput = z.infer<typeof backupRestoreInputSchema>;
export type BackupSettings = z.infer<typeof backupSettingsSchema>;
export type BackupSettingsUpdateInput = z.infer<typeof backupSettingsUpdateInputSchema>;
export type GameMarketSettingsUpdateInput = z.infer<
  typeof gamemarketSettingsUpdateInputSchema
>;
export type GameMarketRevealTokenInput = z.infer<
  typeof gamemarketRevealTokenInputSchema
>;
export type WebhookServerSettingsUpdateInput = z.infer<
  typeof webhookServerSettingsUpdateInputSchema
>;
export type WebhookServerRevealTokenInput = z.infer<
  typeof webhookServerRevealTokenInputSchema
>;
export type CloudSyncSettingsUpdateInput = z.infer<
  typeof cloudSyncSettingsUpdateInputSchema
>;
export type CloudSyncBootstrapOwnerInput = z.infer<
  typeof cloudSyncBootstrapOwnerInputSchema
>;
export type CloudSyncLoginInput = z.infer<typeof cloudSyncLoginInputSchema>;
export type CloudSyncChangePasswordInput = z.infer<
  typeof cloudSyncChangePasswordInputSchema
>;
export type CloudSyncInviteUserInput = z.infer<
  typeof cloudSyncInviteUserInputSchema
>;
export type CloudSyncUpdateMemberInput = z.infer<
  typeof cloudSyncUpdateMemberInputSchema
>;
export type CloudSyncMemberActionInput = z.infer<
  typeof cloudSyncMemberActionInputSchema
>;
export type CloudSyncRemoveMemberInput = z.infer<
  typeof cloudSyncRemoveMemberInputSchema
>;
export type CloudSyncResetMemberPasswordInput = z.infer<
  typeof cloudSyncResetMemberPasswordInputSchema
>;
export type CloudSyncConflictListInput = z.infer<
  typeof cloudSyncConflictListInputSchema
>;
export type CloudSyncConflictDetailInput = z.infer<
  typeof cloudSyncConflictDetailInputSchema
>;
export type CloudSyncConflictResolveInput = z.infer<
  typeof cloudSyncConflictResolveInputSchema
>;
export type AuthLoginInput = z.infer<typeof authLoginInputSchema>;
export type AuthSetupAdminInput = z.infer<typeof authSetupAdminInputSchema>;
export type AuthChangePasswordInput = z.infer<
  typeof authChangePasswordInputSchema
>;
export type AuthLocalPasswordResetInput = z.infer<
  typeof authLocalPasswordResetInputSchema
>;
export type UserCreateInput = z.infer<typeof userCreateInputSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateInputSchema>;
export type UserResetPasswordInput = z.infer<
  typeof userResetPasswordInputSchema
>;

export interface UserRecord {
  id: string;
  name: string;
  username: string;
  passwordHint: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  mustChangePassword: boolean;
  allowRevealSecrets: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  user: UserRecord;
  permissions: Permissions;
}

export interface AuthBootstrap {
  hasAdmin: boolean;
  session: AuthSession | null;
}

export interface LocalRecoveryUserRecord {
  id: string;
  name: string;
  username: string;
  passwordHint: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface AuthLocalPasswordResetResult {
  user: LocalRecoveryUserRecord;
  mustChangePassword: true;
}

export interface ProductRecord {
  id: string;
  internalCode: string;
  name: string;
  category: string;
  game: string | null;
  platform: string | null;
  listingUrl: string | null;
  salePrice: number;
  unitCost: number;
  feePercent: number;
  netValue: number;
  estimatedProfit: number;
  marginPercent: number;
  stockCurrent: number;
  stockMin: number;
  status: ProductStatus;
  deliveryType: DeliveryType;
  supplierId: string | null;
  notes: string | null;
  externalMarketplace?: Marketplace | null;
  externalProductId?: string | null;
  externalStatus?: string | null;
  externalPayloadHash?: string | null;
  lastSyncedAt?: string | null;
  variantCount?: number;
  variantProfitSummary?: ProductVariantProfitSummary | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariantProfitSummary {
  variantCount: number;
  minimumEstimatedProfit: number;
  averageEstimatedProfit: number;
  maximumEstimatedProfit: number;
  averageMarginPercent: number;
  needsReviewCount: number;
  pendingCostCount: number;
}

export interface ProductVariantRecord {
  id: string;
  productId: string;
  variantCode: string;
  name: string;
  description: string | null;
  salePrice: number;
  unitCost: number;
  feePercent: number;
  netValue: number;
  estimatedProfit: number;
  marginPercent: number;
  minimumPrice: number;
  stockCurrent: number;
  stockMin: number;
  supplierName: string | null;
  supplierUrl: string | null;
  deliveryType: DeliveryType;
  status: ProductVariantStatus;
  notes: string | null;
  source: ProductVariantSource;
  needsReview: boolean;
  manuallyEditedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductSummary {
  total: number;
  active: number;
  outOfStock: number;
  lowStock: number;
  averageEstimatedProfit: number;
}

export interface ProductListResult {
  items: ProductRecord[];
  summary: ProductSummary;
  categories: string[];
}

export interface ProductVariantListResult {
  items: ProductVariantRecord[];
}

export interface InventoryRecord {
  id: string;
  inventoryCode: string;
  productId: string | null;
  productVariantId: string | null;
  productVariantCode: string | null;
  productVariantName: string | null;
  productName: string | null;
  productInternalCode: string | null;
  category: string | null;
  game: string | null;
  supplierId: string | null;
  purchaseCost: number;
  status: InventoryStatus;
  hasAccountLogin: boolean;
  hasAccountPassword: boolean;
  hasAccountEmail: boolean;
  hasAccountEmailPassword: boolean;
  hasAccessNotes: boolean;
  publicNotes: string | null;
  boughtAt: string | null;
  soldAt: string | null;
  deliveredAt: string | null;
  orderId: string | null;
  potentialProfit: number;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InventorySummary {
  available: number;
  sold: number;
  problem: number;
  totalCost: number;
  potentialProfit: number;
}

export type OperationalStockScope = "product" | "variant";
export type OperationalStockState =
  | "available"
  | "low_stock"
  | "out_of_stock"
  | "service"
  | "on_demand";

export interface OperationalStockRecord {
  id: string;
  scope: OperationalStockScope;
  productId: string;
  productInternalCode: string;
  productName: string;
  category: string;
  game: string | null;
  productVariantId: string | null;
  productVariantCode: string | null;
  productVariantName: string | null;
  deliveryType: DeliveryType;
  stockCurrent: number;
  stockMin: number;
  salePrice: number;
  unitCost: number;
  netValue: number;
  unitProfit: number;
  potentialProfit: number;
  status: ProductStatus | ProductVariantStatus;
  stockState: OperationalStockState;
  needsReview: boolean;
  supplierName: string | null;
  supplierUrl: string | null;
}

export interface OperationalStockSummary extends InventorySummary {
  lowStock: number;
  outOfStock: number;
  productRows: number;
  variantRows: number;
}

export interface InventoryListResult {
  items: InventoryRecord[];
  summary: InventorySummary;
  protectedSummary: InventorySummary;
  operationalItems: OperationalStockRecord[];
  operationalSummary: OperationalStockSummary;
  products: Array<
    Pick<ProductRecord, "id" | "internalCode" | "name" | "category" | "game">
  >;
  productVariants: Array<
    Pick<
      ProductVariantRecord,
      | "id"
      | "productId"
      | "variantCode"
      | "name"
      | "salePrice"
      | "unitCost"
      | "deliveryType"
      | "status"
    >
  >;
  suppliers: string[];
  categories: string[];
}

export interface CsvExportResult {
  filename: string;
  content: string;
}

export type ProfitAnalysisScope = "variant" | "product";
export type ProfitAnalysisStatus = ProductStatus | ProductVariantStatus;

export interface ProfitHighlight {
  rowId: string;
  label: string;
  productName: string;
  variantName: string | null;
  value: number;
  marginPercent: number;
}

export interface ProfitAnalysisRow {
  id: string;
  scope: ProfitAnalysisScope;
  productId: string;
  productInternalCode: string;
  productName: string;
  productCategory: string;
  game: string | null;
  productVariantId: string | null;
  variantCode: string | null;
  variantName: string | null;
  salePrice: number;
  feePercent: number;
  netValue: number;
  unitCost: number;
  profit: number;
  estimatedProfit: number;
  marginPercent: number;
  marginOnNet: number;
  breakEvenPrice: number;
  minimumPrice: number;
  stockCurrent: number;
  stockMin: number;
  deliveryType: DeliveryType;
  supplierName: string | null;
  status: ProfitAnalysisStatus;
  needsReview: boolean;
  pendingCost: boolean;
  stockUnitsForPotential: number;
  grossPotential: number;
  netPotential: number;
  costInStock: number;
  potentialProfit: number;
}

export interface ProfitSummary {
  potentialProfitTotal: number;
  averageProfitPerSale: number;
  highestMargin: ProfitHighlight | null;
  lowestMargin: ProfitHighlight | null;
  stockCostTotal: number;
  grossPotential: number;
  netPotential: number;
  pendingCostCount: number;
  needsReviewCount: number;
  analyzedRows: number;
  variantRows: number;
  parentOnlyRows: number;
}

export interface ProfitProductGroup {
  productId: string;
  productInternalCode: string;
  productName: string;
  category: string;
  game: string | null;
  variationCount: number;
  minimumProfit: number;
  averageProfit: number;
  maximumProfit: number;
  averageCost: number;
  highestMarginLabel: string;
  highestMarginPercent: number;
  needsReviewCount: number;
  pendingCostCount: number;
}

export interface ProfitFilters {
  categories: string[];
  deliveryTypes: DeliveryType[];
  statuses: ProfitAnalysisStatus[];
  suppliers: string[];
}

export interface ProfitListResult {
  summary: ProfitSummary;
  list: ProfitAnalysisRow[];
  groups: ProfitProductGroup[];
  filters: ProfitFilters;
}

export interface OrderRecord {
  id: string;
  orderCode: string;
  externalOrderId: string | null;
  marketplace: Marketplace;
  externalMarketplace?: Marketplace | null;
  externalStatus?: string | null;
  externalPayloadHash?: string | null;
  lastSyncedAt?: string | null;
  productId: string;
  productVariantId: string | null;
  productVariantCode: string | null;
  productVariantName: string | null;
  variantPending: boolean;
  inventoryItemId: string | null;
  inventoryCode: string | null;
  buyerName: string | null;
  buyerContact: string | null;
  productNameSnapshot: string;
  categorySnapshot: string;
  salePrice: number;
  unitCost: number;
  feePercent: number;
  netValue: number;
  profit: number;
  marginPercent: number;
  status: OrderStatus;
  actionRequired: boolean;
  marketplaceUrl: string | null;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
}

export interface OrderSummary {
  total: number;
  pendingAction: number;
  problemOrMediation: number;
  grossRevenue: number;
  netRevenue: number;
  estimatedProfit: number;
}

export interface EventRecord {
  id: string;
  eventCode: string;
  source: EventSource;
  type: EventType;
  severity: EventSeverity;
  title: string;
  message: string | null;
  orderId: string | null;
  orderCode: string | null;
  productId: string | null;
  productName: string | null;
  inventoryItemId: string | null;
  inventoryCode: string | null;
  actorUserId: string | null;
  actorUserName: string | null;
  readAt: string | null;
  rawPayload: string | null;
  createdAt: string;
}

export interface EventSummary {
  total: number;
  unread: number;
  critical: number;
  warnings: number;
}

export interface AuditChange {
  field: string;
  label: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
  sensitive: boolean;
}

export interface AuditHistoryEntry {
  id: string;
  eventCode: string;
  eventType: EventType;
  title: string;
  message: string | null;
  source: AuditSource;
  sourceLabel: string;
  entityType: AuditEntityType;
  entityId: string;
  relatedProductId: string | null;
  relatedVariantId: string | null;
  relatedOrderId: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
  changes: AuditChange[];
  detailUnavailable: boolean;
}

export interface ListAuditHistoryResult {
  items: AuditHistoryEntry[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
  sources: AuditSource[];
}

export interface AppNotificationRecord {
  id: string;
  type: AppNotificationType;
  severity: EventSeverity;
  title: string;
  message: string;
  orderId: string | null;
  externalOrderId: string | null;
  eventId: string | null;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
  metadataJson: string | null;
}

export interface AppNotificationSummary {
  total: number;
  unread: number;
  unreadNewSales: number;
  criticalUnread: number;
}

export interface AppNotificationListResult {
  items: AppNotificationRecord[];
  summary: AppNotificationSummary;
}

export interface BackupRecord {
  id: string;
  filename: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  type: BackupOrigin;
  appVersion: string;
  dbSchemaVersion: string | null;
  checksumSha256: string;
}

export interface BackupValidationResult {
  valid: boolean;
  safeMessage: string;
  dbSchemaVersion: string | null;
}

export interface BackupStatus {
  databasePath: string;
  backupsPath: string;
  settings: BackupSettings;
  lastBackup: BackupRecord | null;
  backups: BackupRecord[];
  cloudSyncPausedAfterRestore: boolean;
}

export interface BackupRestoreResult {
  restored: boolean;
  requiresRestart: boolean;
  restoredBackup: BackupRecord;
  safetyBackup: BackupRecord;
  cloudSyncPaused: boolean;
  safeMessage: string;
}

export interface OrderListResult {
  items: OrderRecord[];
  summary: OrderSummary;
  products: Array<
    Pick<ProductRecord, "id" | "internalCode" | "name" | "category" | "game">
  >;
  productVariants: Array<
    Pick<
      ProductVariantRecord,
      | "id"
      | "productId"
      | "variantCode"
      | "name"
      | "salePrice"
      | "unitCost"
      | "deliveryType"
      | "status"
    >
  >;
  inventoryItems: Array<
    Pick<
      InventoryRecord,
      | "id"
      | "inventoryCode"
      | "productId"
      | "productVariantId"
      | "productName"
      | "productVariantName"
      | "status"
    >
  >;
  categories: string[];
}

export interface EventListResult {
  items: EventRecord[];
  summary: EventSummary;
  types: EventType[];
}

export interface OrderDetailResult {
  order: OrderRecord;
  timeline: EventRecord[];
}

export interface DashboardSummary {
  salesToday: number;
  salesMonth: number;
  grossRevenueMonth: number;
  netRevenueMonth: number;
  estimatedProfitMonth: number;
  pendingActionOrders: number;
  problemOrMediationOrders: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  unreadNewSales: number;
  deliveredAwaitingRelease: number;
  waitingReleaseCount: number;
  waitingReleaseGross: number;
  waitingReleaseNet: number;
  waitingReleaseProfit: number;
  gameMarketApiConfigured: boolean;
  gameMarketPollingActive: boolean;
  gameMarketLastCheckedAt: string | null;
  gameMarketNextRunAt: string | null;
  gameMarketLastPollingStatus: GameMarketPollingStatus["status"];
  gameMarketLastPollingMessage: string | null;
  latestEvents: EventRecord[];
  salesByDay: Array<{
    day: string;
    orders: number;
    gross: number;
    profit: number;
  }>;
  profitByCategory: Array<{
    category: string;
    profit: number;
  }>;
  statusBreakdown: Array<{
    status: OrderStatus;
    count: number;
  }>;
}

export interface GameMarketDocumentationStatus {
  status: "available" | "missing" | "incomplete";
  files: string[];
  missing: string[];
  message: string;
}

export interface GameMarketSettingsView {
  apiBaseUrl: string;
  integrationName: string;
  environment: GameMarketEnvironment;
  hasToken: boolean;
  tokenMasked: string | null;
  tokenSource: "saved" | "env" | "none";
  connectionStatus: GameMarketConnectionStatus;
  lastConnectionAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  documentation: GameMarketDocumentationStatus;
  permissions: {
    read: boolean;
    write: boolean;
    delete: boolean;
    source: "documentation";
  };
}

export interface GameMarketConnectionTestResult {
  ok: boolean;
  status: GameMarketConnectionStatus;
  checkedAt: string;
  endpoint: string | null;
  safeMessage: string;
}

export interface GameMarketSyncSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "synced" | "partial" | "failed";
  productsFound: number;
  ordersFound: number;
  productsNew: number;
  productsUpdated: number;
  ordersNew: number;
  ordersUpdated: number;
  errors: string[];
}

export interface GameMarketPollingStatus {
  active: boolean;
  running: boolean;
  intervalSeconds: number;
  startedAt: string | null;
  finishedAt: string | null;
  status:
    | "idle"
    | "scheduled"
    | "running"
    | "synced"
    | "partial"
    | "failed"
    | "disabled"
    | "not_configured";
  importedOrders: number;
  updatedOrders: number;
  errors: string[];
  nextRunAt: string | null;
  lastResult: string | null;
}

export interface WebhookServerSettingsView {
  backendUrl: string;
  hasToken: boolean;
  tokenMasked: string | null;
  connectionStatus: WebhookServerConnectionStatus;
  pollingEnabled: boolean;
  pollingIntervalSeconds: number;
  lastCheckedAt: string | null;
  lastSyncAt: string | null;
  lastEventReceivedAt: string | null;
  lastError: string | null;
}

export interface WebhookServerConnectionTestResult {
  ok: boolean;
  status: WebhookServerConnectionStatus;
  checkedAt: string;
  endpoint: string | null;
  safeMessage: string;
}

export interface WebhookServerEventItem {
  id: string;
  externalEventId: string | null;
  eventType: string;
  source: string;
  severity: EventSeverity;
  title: string;
  message: string;
  payloadHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  ackedAt: string | null;
  createdAt: string;
  receivedAt: string;
  hasRawPayload: boolean;
}

export interface WebhookServerEventDetail extends WebhookServerEventItem {
  rawPayloadMasked: unknown;
  headersMasked: Record<string, unknown>;
}

export interface WebhookServerSyncSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "synced" | "partial" | "failed";
  eventsFound: number;
  eventsImported: number;
  eventsAcked: number;
  duplicatesSkipped: number;
  notificationsTriggered: number;
  errors: string[];
}

export interface WebhookServerTestEventResult {
  ok: boolean;
  id: string;
  eventType: string;
  severity: EventSeverity;
  message: string;
}

export interface CloudUserView {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: CloudRole;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWorkspaceView {
  id: string;
  name: string;
  role: CloudRole;
  createdAt: string;
  updatedAt: string;
}

export interface CloudWorkspaceMemberView extends CloudUserView {
  membershipId: string;
  workspaceId: string;
}

export interface CloudAuditLogView {
  id: string;
  workspaceId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface CloudSyncSettingsView {
  backendUrl: string;
  mode: CloudSyncMode;
  connectionStatus: CloudSyncConnectionStatus;
  hasSession: boolean;
  currentUser: CloudUserView | null;
  workspaces: CloudWorkspaceView[];
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceRole: CloudRole | null;
  autoSyncEnabled: boolean;
  syncIntervalSeconds: number;
  lastSyncAt: string | null;
  lastPullAt: string | null;
  lastPushAt: string | null;
  lastError: string | null;
  pendingChanges: number;
  conflictCount: number;
}

export interface CloudSyncAutoSyncStatus {
  active: boolean;
  paused: boolean;
  running: boolean;
  intervalSeconds: number;
  minIntervalSeconds: number;
  startedAt: string | null;
  finishedAt: string | null;
  nextRunAt: string | null;
  status:
    | "idle"
    | "scheduled"
    | "checking"
    | "pushing"
    | "pulling"
    | "synced"
    | "failed"
    | "paused"
    | "disabled"
    | "not_configured";
  lastResult: string | null;
  pendingChanges: number;
  failureCount: number;
  backoffSeconds: number | null;
}

export interface CloudSyncEntityView {
  cloudId: string;
  workspaceId: string;
  entityType: CloudSyncEntityType;
  localId: string;
  payload: Record<string, unknown>;
  version: number;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CloudSyncConflictView {
  id: string;
  workspaceId: string;
  entityType: CloudSyncEntityType;
  localId: string;
  cloudId: string;
  remoteVersion: number;
  incomingBaseVersion: number;
  createdAt: string;
}

export interface CloudSyncConflictFieldDiff {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  changed: boolean;
  sensitive: boolean;
}

export interface CloudSyncConflictListItem {
  id: string;
  workspaceId: string;
  entityType: CloudSyncEntityType;
  entityLabel: string;
  localId: string;
  cloudId: string;
  status: CloudSyncConflictStatus;
  severity: CloudSyncConflictSeverity;
  source: CloudSyncConflictSource;
  remoteVersion: number;
  incomingBaseVersion: number;
  localVersion: number | null;
  affectedFields: string[];
  reason: string | null;
  lastError: string | null;
  localActorUserId: string | null;
  remoteActorUserId: string | null;
  localUpdatedAt: string | null;
  remoteUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolutionType: CloudSyncConflictResolutionType | null;
  resolutionNote: string | null;
}

export interface CloudSyncConflictListResult {
  items: CloudSyncConflictListItem[];
  total: number;
  pending: number;
  filters: CloudSyncConflictListInput;
}

export interface CloudSyncConflictDetail extends CloudSyncConflictListItem {
  localPayload: Record<string, unknown>;
  remotePayload: Record<string, unknown>;
  diff: CloudSyncConflictFieldDiff[];
  editableFields: string[];
  omittedSensitiveFields: string[];
  sensitiveFieldsOmitted: boolean;
  canResolve: boolean;
  safeMessage: string | null;
}

export interface CloudSyncConflictResolutionResult {
  conflict: CloudSyncConflictDetail;
  status: CloudSyncConflictStatus;
  pushScheduled: boolean;
  safeMessage: string;
}

export interface CloudSyncSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "synced" | "partial" | "failed" | "conflict";
  collected?: number;
  pushed: number;
  pulled: number;
  applied: number;
  conflicts: number;
  ignored?: number;
  skipped?: number;
  entityTypes?: CloudSyncEntityType[];
  errors: string[];
}
