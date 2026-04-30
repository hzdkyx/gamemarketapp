import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  internalCode: text("internal_code").notNull().unique(),
  externalId: text("external_id"),
  name: text("name").notNull(),
  category: text("category").notNull(),
  game: text("game"),
  platform: text("platform"),
  listingUrl: text("listing_url"),
  salePriceCents: integer("sale_price_cents").notNull(),
  unitCostCents: integer("unit_cost_cents").notNull(),
  feePercent: real("fee_percent").notNull().default(13),
  netValueCents: integer("net_value_cents").notNull().default(0),
  estimatedProfitCents: integer("estimated_profit_cents").notNull().default(0),
  marginPercent: real("margin_percent").notNull().default(0),
  stockCurrent: integer("stock_current").notNull().default(0),
  stockMin: integer("stock_min").notNull().default(1),
  status: text("status", {
    enum: ["active", "paused", "out_of_stock", "on_demand", "archived"]
  }).notNull(),
  deliveryType: text("delivery_type", {
    enum: ["manual", "automatic", "on_demand", "service"]
  })
    .notNull()
    .default("manual"),
  supplierId: text("supplier_id"),
  notes: text("notes"),
  externalMarketplace: text("external_marketplace", {
    enum: ["gamemarket"]
  }),
  externalProductId: text("external_product_id"),
  externalStatus: text("external_status"),
  externalPayloadHash: text("external_payload_hash"),
  lastSyncedAt: text("last_synced_at"),
  createdByUserId: text("created_by_user_id").references(() => users.id),
  updatedByUserId: text("updated_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", {
    enum: ["admin", "operator", "viewer"]
  }).notNull(),
  status: text("status", {
    enum: ["active", "disabled"]
  }).notNull(),
  lastLoginAt: text("last_login_at"),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: text("locked_until"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  allowRevealSecrets: integer("allow_reveal_secrets", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const suppliers = sqliteTable("suppliers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const productVariants = sqliteTable("product_variants", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  variantCode: text("variant_code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  salePriceCents: integer("sale_price_cents").notNull().default(0),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
  feePercent: real("fee_percent").notNull().default(13),
  netValueCents: integer("net_value_cents").notNull().default(0),
  estimatedProfitCents: integer("estimated_profit_cents").notNull().default(0),
  marginPercent: real("margin_percent").notNull().default(0),
  stockCurrent: integer("stock_current").notNull().default(0),
  stockMin: integer("stock_min").notNull().default(0),
  supplierName: text("supplier_name"),
  supplierUrl: text("supplier_url"),
  deliveryType: text("delivery_type", {
    enum: ["manual", "automatic", "on_demand", "service"]
  })
    .notNull()
    .default("manual"),
  status: text("status", {
    enum: ["active", "paused", "out_of_stock", "archived"]
  })
    .notNull()
    .default("active"),
  notes: text("notes"),
  source: text("source", {
    enum: ["manual", "seeded_from_conversation", "gamemarket_sync", "imported"]
  })
    .notNull()
    .default("manual"),
  needsReview: integer("needs_review").notNull().default(0),
  manuallyEditedAt: text("manually_edited_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const inventoryItems = sqliteTable("inventory_items", {
  id: text("id").primaryKey(),
  inventoryCode: text("inventory_code").notNull().unique(),
  productId: text("product_id").references(() => products.id),
  productVariantId: text("product_variant_id").references(() => productVariants.id),
  supplierId: text("supplier_id"),
  purchaseCostCents: integer("purchase_cost_cents").notNull(),
  status: text("status", {
    enum: ["available", "reserved", "sold", "delivered", "problem", "refunded", "archived"]
  }).notNull(),
  accountLoginEncrypted: text("account_login_encrypted"),
  accountPasswordEncrypted: text("account_password_encrypted"),
  accountEmailEncrypted: text("account_email_encrypted"),
  accountEmailPasswordEncrypted: text("account_email_password_encrypted"),
  accessNotesEncrypted: text("access_notes_encrypted"),
  publicNotes: text("public_notes"),
  boughtAt: text("bought_at"),
  soldAt: text("sold_at"),
  deliveredAt: text("delivered_at"),
  orderId: text("order_id"),
  createdByUserId: text("created_by_user_id").references(() => users.id),
  updatedByUserId: text("updated_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  orderCode: text("order_code").notNull().unique(),
  externalOrderId: text("external_order_id"),
  marketplace: text("marketplace", {
    enum: ["gamemarket"]
  })
    .notNull()
    .default("gamemarket"),
  externalMarketplace: text("external_marketplace", {
    enum: ["gamemarket"]
  }),
  externalStatus: text("external_status"),
  externalPayloadHash: text("external_payload_hash"),
  lastSyncedAt: text("last_synced_at"),
  productId: text("product_id").references(() => products.id),
  productVariantId: text("product_variant_id").references(() => productVariants.id),
  inventoryItemId: text("inventory_item_id").references(() => inventoryItems.id),
  buyerName: text("buyer_name"),
  buyerContact: text("buyer_contact"),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  categorySnapshot: text("category_snapshot").notNull(),
  salePriceCents: integer("sale_price_cents").notNull().default(0),
  unitCostCents: integer("unit_cost_cents").notNull().default(0),
  feePercent: real("fee_percent").notNull().default(13),
  netValueCents: integer("net_value_cents").notNull().default(0),
  profitCents: integer("profit_cents").notNull().default(0),
  marginPercent: real("margin_percent").notNull().default(0),
  status: text("status", {
    enum: [
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
    ]
  }).notNull(),
  actionRequired: integer("action_required", { mode: "boolean" }).notNull().default(false),
  marketplaceUrl: text("marketplace_url"),
  notes: text("notes"),
  createdByUserId: text("created_by_user_id").references(() => users.id),
  updatedByUserId: text("updated_by_user_id").references(() => users.id),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  confirmedAt: text("confirmed_at"),
  deliveredAt: text("delivered_at"),
  completedAt: text("completed_at"),
  cancelledAt: text("cancelled_at"),
  refundedAt: text("refunded_at")
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  eventCode: text("event_code").notNull().unique(),
  source: text("source", {
    enum: ["manual", "system", "gamemarket_api", "gamemarket_future", "webhook_future", "webhook_server"]
  }).notNull(),
  type: text("type", {
    enum: [
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
      "system.notification_test"
    ]
  }).notNull(),
  severity: text("severity", {
    enum: ["info", "success", "warning", "critical"]
  }).notNull().default("info"),
  title: text("title").notNull(),
  message: text("message"),
  orderId: text("order_id").references(() => orders.id),
  productId: text("product_id").references(() => products.id),
  inventoryItemId: text("inventory_item_id").references(() => inventoryItems.id),
  actorUserId: text("actor_user_id").references(() => users.id),
  readAt: text("read_at"),
  rawPayload: text("raw_payload"),
  createdAt: text("created_at").notNull()
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  isSecret: integer("is_secret", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull()
});

export const notificationRules = sqliteTable("notification_rules", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  channel: text("channel", {
    enum: ["desktop", "sound", "email", "telegram", "whatsapp", "discord"]
  }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  playSound: integer("play_sound", { mode: "boolean" }).notNull().default(false),
  highlight: integer("highlight", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const webhookServerEventImports = sqliteTable("webhook_server_event_imports", {
  dedupeKey: text("dedupe_key").primaryKey(),
  remoteEventId: text("remote_event_id").notNull(),
  externalEventId: text("external_event_id"),
  payloadHash: text("payload_hash").notNull(),
  eventType: text("event_type").notNull(),
  importedEventId: text("imported_event_id").references(() => events.id),
  importedAt: text("imported_at").notNull()
});

export const appNotifications = sqliteTable("app_notifications", {
  id: text("id").primaryKey(),
  type: text("type", {
    enum: [
      "new_sale",
      "mediation_problem",
      "order_delivered",
      "order_completed",
      "internal_event",
      "system_test"
    ]
  }).notNull(),
  severity: text("severity", {
    enum: ["info", "success", "warning", "critical"]
  })
    .notNull()
    .default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  orderId: text("order_id").references(() => orders.id),
  externalOrderId: text("external_order_id"),
  eventId: text("event_id").references(() => events.id),
  dedupeKey: text("dedupe_key"),
  readAt: text("read_at"),
  createdAt: text("created_at").notNull(),
  metadataJson: text("metadata_json")
});

export const productRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
  inventoryItems: many(inventoryItems),
  orders: many(orders)
}));

export const productVariantRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id]
  }),
  inventoryItems: many(inventoryItems),
  orders: many(orders)
}));

export const inventoryRelations = relations(inventoryItems, ({ one }) => ({
  product: one(products, {
    fields: [inventoryItems.productId],
    references: [products.id]
  }),
  productVariant: one(productVariants, {
    fields: [inventoryItems.productVariantId],
    references: [productVariants.id]
  }),
  supplier: one(suppliers, {
    fields: [inventoryItems.supplierId],
    references: [suppliers.id]
  })
}));

export const orderRelations = relations(orders, ({ one, many }) => ({
  product: one(products, {
    fields: [orders.productId],
    references: [products.id]
  }),
  productVariant: one(productVariants, {
    fields: [orders.productVariantId],
    references: [productVariants.id]
  }),
  inventoryItem: one(inventoryItems, {
    fields: [orders.inventoryItemId],
    references: [inventoryItems.id]
  }),
  events: many(events)
}));

export const eventRelations = relations(events, ({ one }) => ({
  order: one(orders, {
    fields: [events.orderId],
    references: [orders.id]
  }),
  product: one(products, {
    fields: [events.productId],
    references: [products.id]
  }),
  inventoryItem: one(inventoryItems, {
    fields: [events.inventoryItemId],
    references: [inventoryItems.id]
  })
}));
