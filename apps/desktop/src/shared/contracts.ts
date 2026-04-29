import { GAMEMARKET_FEE_PERCENT } from "@hzdk/shared";
import { z } from "zod";

export const productStatusValues = [
  "active",
  "paused",
  "out_of_stock",
  "on_demand",
  "archived"
] as const;

export const deliveryTypeValues = ["manual", "automatic", "on_demand", "service"] as const;

export const inventoryStatusValues = [
  "available",
  "reserved",
  "sold",
  "delivered",
  "problem",
  "refunded",
  "archived"
] as const;

export const productSortValues = ["name", "price", "profit", "stock", "status"] as const;
export const sortDirectionValues = ["asc", "desc"] as const;
export const stockFilterValues = ["all", "low", "out"] as const;
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
  "archived"
] as const;
export const manualOrderInitialStatusValues = [
  "draft",
  "payment_confirmed",
  "awaiting_delivery"
] as const;
export const orderSortValues = ["date", "value", "profit", "status", "product"] as const;
export const orderActionFilterValues = ["all", "pending", "clear"] as const;
export const eventSourceValues = [
  "manual",
  "system",
  "gamemarket_future",
  "webhook_future"
] as const;
export const eventSeverityValues = ["info", "success", "warning", "critical"] as const;
export const eventTypeValues = [
  "order.created",
  "order.payment_confirmed",
  "order.awaiting_delivery",
  "order.delivered",
  "order.completed",
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
  "system.notification_test"
] as const;
export const eventReadFilterValues = ["all", "read", "unread"] as const;
export const inventorySecretFieldValues = [
  "accountLogin",
  "accountPassword",
  "accountEmail",
  "accountEmailPassword",
  "accessNotes"
] as const;
export const userRoleValues = ["admin", "operator", "viewer"] as const;
export const userStatusValues = ["active", "disabled"] as const;
export const permissionKeyValues = [
  "canManageUsers",
  "canManageSettings",
  "canRevealSecrets",
  "canEditProducts",
  "canEditInventory",
  "canEditOrders",
  "canExportCsv"
] as const;

const nullableTextSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().or(z.null()).optional());

const requiredTextSchema = z.string().trim().min(1, "Campo obrigatório.");
const nonNegativeMoneySchema = z.number().finite().nonnegative();
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const idSchema = z.string().trim().min(1);
const usernameSchema = z
  .string()
  .trim()
  .min(3, "Usuário deve ter pelo menos 3 caracteres.")
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, "Use letras, números, ponto, hífen ou sublinhado.");
const passwordSchema = z.string().min(8, "Senha deve ter pelo menos 8 caracteres.");

export const productStatusSchema = z.enum(productStatusValues);
export const deliveryTypeSchema = z.enum(deliveryTypeValues);
export const inventoryStatusSchema = z.enum(inventoryStatusValues);
export const inventorySecretFieldSchema = z.enum(inventorySecretFieldValues);
export const marketplaceSchema = z.enum(marketplaceValues);
export const orderStatusSchema = z.enum(orderStatusValues);
export const manualOrderInitialStatusSchema = z.enum(manualOrderInitialStatusValues);
export const eventSourceSchema = z.enum(eventSourceValues);
export const eventSeveritySchema = z.enum(eventSeverityValues);
export const eventTypeSchema = z.enum(eventTypeValues);
export const userRoleSchema = z.enum(userRoleValues);
export const userStatusSchema = z.enum(userStatusValues);

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
    notes: nullableTextSchema
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
    notes: nullableTextSchema
  })
  .strict();

export const productUpdateInputSchema = z
  .object({
    id: idSchema,
    data: productUpdateDataSchema
  })
  .strict();

export const productDeleteInputSchema = z.object({ id: idSchema }).strict();
export const productGetInputSchema = z.object({ id: idSchema }).strict();

export const productListInputSchema = z
  .object({
    search: nullableTextSchema,
    status: productStatusSchema.or(z.literal("all")).default("all"),
    category: nullableTextSchema,
    stock: z.enum(stockFilterValues).default("all"),
    sortBy: z.enum(productSortValues).default("name"),
    sortDirection: z.enum(sortDirectionValues).default("asc")
  })
  .strict();

export const inventoryCreateInputSchema = z
  .object({
    inventoryCode: nullableTextSchema,
    productId: nullableTextSchema,
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
    orderId: nullableTextSchema
  })
  .strict();

export const inventoryUpdateDataSchema = z
  .object({
    inventoryCode: nullableTextSchema,
    productId: nullableTextSchema,
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
    orderId: nullableTextSchema
  })
  .strict();

export const inventoryUpdateInputSchema = z
  .object({
    id: idSchema,
    data: inventoryUpdateDataSchema
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
    sortDirection: z.enum(sortDirectionValues).default("asc")
  })
  .strict();

export const inventoryRevealSecretInputSchema = z
  .object({
    id: idSchema,
    field: inventorySecretFieldSchema
  })
  .strict();

export const orderCreateInputSchema = z
  .object({
    orderCode: nullableTextSchema,
    externalOrderId: nullableTextSchema,
    marketplace: marketplaceSchema.default("gamemarket"),
    productId: idSchema,
    inventoryItemId: nullableTextSchema,
    buyerName: nullableTextSchema,
    buyerContact: nullableTextSchema,
    salePrice: nonNegativeMoneySchema.optional(),
    unitCost: nonNegativeMoneySchema.optional(),
    feePercent: z.number().finite().min(0).lt(100).default(GAMEMARKET_FEE_PERCENT),
    status: manualOrderInitialStatusSchema.default("draft"),
    marketplaceUrl: nullableTextSchema,
    notes: nullableTextSchema
  })
  .strict();

export const orderUpdateDataSchema = z
  .object({
    orderCode: nullableTextSchema,
    externalOrderId: nullableTextSchema,
    marketplace: marketplaceSchema.optional(),
    productId: idSchema.optional(),
    inventoryItemId: nullableTextSchema,
    buyerName: nullableTextSchema,
    buyerContact: nullableTextSchema,
    salePrice: nonNegativeMoneySchema.optional(),
    unitCost: nonNegativeMoneySchema.optional(),
    feePercent: z.number().finite().min(0).lt(100).optional(),
    actionRequired: z.boolean().optional(),
    marketplaceUrl: nullableTextSchema,
    notes: nullableTextSchema
  })
  .strict();

export const orderUpdateInputSchema = z
  .object({
    id: idSchema,
    data: orderUpdateDataSchema
  })
  .strict();

export const orderGetInputSchema = z.object({ id: idSchema }).strict();
export const orderDeleteInputSchema = z.object({ id: idSchema }).strict();
export const orderArchiveInputSchema = z.object({ id: idSchema }).strict();

export const orderChangeStatusInputSchema = z
  .object({
    id: idSchema,
    status: orderStatusSchema,
    notes: nullableTextSchema
  })
  .strict();

export const orderLinkInventoryItemInputSchema = z
  .object({
    orderId: idSchema,
    inventoryItemId: idSchema
  })
  .strict();

export const orderUnlinkInventoryItemInputSchema = z
  .object({
    orderId: idSchema
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
    sortDirection: z.enum(sortDirectionValues).default("desc")
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
    rawPayload: z.unknown().optional()
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
    dateTo: nullableTextSchema
  })
  .strict();

export const notificationSettingsSchema = z
  .object({
    desktopEnabled: z.boolean().default(true),
    soundEnabled: z.boolean().default(false),
    enabledEventTypes: z.record(z.string(), z.boolean()).default({})
  })
  .strict();

export const notificationSettingsUpdateInputSchema = notificationSettingsSchema.partial().strict();

export const authLoginInputSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(1, "Campo obrigatório.")
  })
  .strict();

export const authSetupAdminInputSchema = z
  .object({
    name: requiredTextSchema,
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Campo obrigatório.")
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem."
  });

export const authChangePasswordInputSchema = z
  .object({
    currentPassword: z.string().min(1, "Campo obrigatório."),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Campo obrigatório.")
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem."
  });

export const userCreateInputSchema = z
  .object({
    name: requiredTextSchema,
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Campo obrigatório."),
    role: userRoleSchema.default("operator"),
    status: userStatusSchema.default("active"),
    allowRevealSecrets: z.boolean().default(false),
    mustChangePassword: z.boolean().default(true)
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem."
  });

export const userUpdateInputSchema = z
  .object({
    id: idSchema,
    data: z
      .object({
        name: requiredTextSchema.optional(),
        username: usernameSchema.optional(),
        role: userRoleSchema.optional(),
        status: userStatusSchema.optional(),
        allowRevealSecrets: z.boolean().optional(),
        mustChangePassword: z.boolean().optional()
      })
      .strict()
  })
  .strict();

export const userResetPasswordInputSchema = z
  .object({
    id: idSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Campo obrigatório."),
    mustChangePassword: z.boolean().default(true)
  })
  .strict()
  .refine((input) => input.password === input.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não conferem."
  });

export type ProductStatus = (typeof productStatusValues)[number];
export type DeliveryType = (typeof deliveryTypeValues)[number];
export type InventoryStatus = (typeof inventoryStatusValues)[number];
export type ProductSort = (typeof productSortValues)[number];
export type SortDirection = (typeof sortDirectionValues)[number];
export type StockFilter = (typeof stockFilterValues)[number];
export type InventorySecretField = (typeof inventorySecretFieldValues)[number];
export type UserRole = (typeof userRoleValues)[number];
export type UserStatus = (typeof userStatusValues)[number];
export type PermissionKey = (typeof permissionKeyValues)[number];
export type Permissions = Record<PermissionKey, boolean>;
export type Marketplace = (typeof marketplaceValues)[number];
export type OrderStatus = (typeof orderStatusValues)[number];
export type ManualOrderInitialStatus = (typeof manualOrderInitialStatusValues)[number];
export type OrderSort = (typeof orderSortValues)[number];
export type OrderActionFilter = (typeof orderActionFilterValues)[number];
export type EventSource = (typeof eventSourceValues)[number];
export type EventSeverity = (typeof eventSeverityValues)[number];
export type EventType = (typeof eventTypeValues)[number];
export type EventReadFilter = (typeof eventReadFilterValues)[number];

export type ProductCreateInput = z.infer<typeof productCreateInputSchema>;
export type ProductUpdateData = z.infer<typeof productUpdateDataSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateInputSchema>;
export type ProductListInput = z.infer<typeof productListInputSchema>;
export type InventoryCreateInput = z.infer<typeof inventoryCreateInputSchema>;
export type InventoryUpdateData = z.infer<typeof inventoryUpdateDataSchema>;
export type InventoryUpdateInput = z.infer<typeof inventoryUpdateInputSchema>;
export type InventoryListInput = z.infer<typeof inventoryListInputSchema>;
export type InventoryRevealSecretInput = z.infer<typeof inventoryRevealSecretInputSchema>;
export type OrderCreateInput = z.infer<typeof orderCreateInputSchema>;
export type OrderUpdateData = z.infer<typeof orderUpdateDataSchema>;
export type OrderUpdateInput = z.infer<typeof orderUpdateInputSchema>;
export type OrderListInput = z.infer<typeof orderListInputSchema>;
export type OrderChangeStatusInput = z.infer<typeof orderChangeStatusInputSchema>;
export type OrderLinkInventoryItemInput = z.infer<typeof orderLinkInventoryItemInputSchema>;
export type OrderUnlinkInventoryItemInput = z.infer<typeof orderUnlinkInventoryItemInputSchema>;
export type EventCreateManualInput = z.infer<typeof eventCreateManualInputSchema>;
export type EventListInput = z.infer<typeof eventListInputSchema>;
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type NotificationSettingsUpdateInput = z.infer<typeof notificationSettingsUpdateInputSchema>;
export type AuthLoginInput = z.infer<typeof authLoginInputSchema>;
export type AuthSetupAdminInput = z.infer<typeof authSetupAdminInputSchema>;
export type AuthChangePasswordInput = z.infer<typeof authChangePasswordInputSchema>;
export type UserCreateInput = z.infer<typeof userCreateInputSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateInputSchema>;
export type UserResetPasswordInput = z.infer<typeof userResetPasswordInputSchema>;

export interface UserRecord {
  id: string;
  name: string;
  username: string;
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
  createdByUserId: string | null;
  updatedByUserId: string | null;
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

export interface InventoryRecord {
  id: string;
  inventoryCode: string;
  productId: string | null;
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

export interface InventoryListResult {
  items: InventoryRecord[];
  summary: InventorySummary;
  products: Array<Pick<ProductRecord, "id" | "internalCode" | "name" | "category" | "game">>;
  suppliers: string[];
  categories: string[];
}

export interface CsvExportResult {
  filename: string;
  content: string;
}

export interface OrderRecord {
  id: string;
  orderCode: string;
  externalOrderId: string | null;
  marketplace: Marketplace;
  productId: string;
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

export interface OrderListResult {
  items: OrderRecord[];
  summary: OrderSummary;
  products: Array<Pick<ProductRecord, "id" | "internalCode" | "name" | "category" | "game">>;
  inventoryItems: Array<Pick<InventoryRecord, "id" | "inventoryCode" | "productId" | "productName" | "status">>;
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
