import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rowsByTable: {} as Record<string, Array<Record<string, unknown>>>,
  conflicts: [] as Array<Record<string, unknown>>,
  writeOrder: [] as string[]
}));

const mockDb = vi.hoisted(() => {
  const localIdColumnByTable: Record<string, string> = {
    products: "id",
    product_variants: "id",
    inventory_items: "id",
    orders: "id",
    events: "id",
    app_notifications: "id",
    settings: "key"
  };

  const foreignKeysByTable: Record<string, Array<{ column: string; table: string; required?: boolean }>> = {
    products: [
      { column: "created_by_user_id", table: "users" },
      { column: "updated_by_user_id", table: "users" }
    ],
    product_variants: [{ column: "product_id", table: "products", required: true }],
    inventory_items: [
      { column: "product_id", table: "products" },
      { column: "product_variant_id", table: "product_variants" },
      { column: "order_id", table: "orders" },
      { column: "created_by_user_id", table: "users" },
      { column: "updated_by_user_id", table: "users" }
    ],
    orders: [
      { column: "product_id", table: "products" },
      { column: "product_variant_id", table: "product_variants" },
      { column: "inventory_item_id", table: "inventory_items" },
      { column: "created_by_user_id", table: "users" },
      { column: "updated_by_user_id", table: "users" }
    ],
    events: [
      { column: "order_id", table: "orders" },
      { column: "product_id", table: "products" },
      { column: "inventory_item_id", table: "inventory_items" },
      { column: "actor_user_id", table: "users" }
    ],
    app_notifications: [
      { column: "order_id", table: "orders" },
      { column: "event_id", table: "events" }
    ]
  };

  const rowExists = (
    rowsByTable: Record<string, Array<Record<string, unknown>>>,
    table: string,
    id: unknown
  ): boolean =>
    typeof id === "string" && id.length > 0 && Boolean((rowsByTable[table] ?? []).find((row) => row.id === id));

  const assertForeignKeys = (
    rowsByTable: Record<string, Array<Record<string, unknown>>>,
    table: string,
    row: Record<string, unknown>
  ): void => {
    if (table === "settings" && (row.is_secret === null || row.is_secret === undefined)) {
      throw new Error("NOT NULL constraint failed: settings.is_secret");
    }

    for (const foreignKey of foreignKeysByTable[table] ?? []) {
      const value = row[foreignKey.column];
      if (foreignKey.required && (typeof value !== "string" || value.length === 0)) {
        throw new Error("FOREIGN KEY constraint failed");
      }
      if (typeof value === "string" && value.length > 0 && !rowExists(rowsByTable, foreignKey.table, value)) {
        throw new Error("FOREIGN KEY constraint failed");
      }
    }
  };

  const upsertMockRow = (
    rowsByTable: Record<string, Array<Record<string, unknown>>>,
    writeOrder: string[],
    table: string,
    values: Record<string, unknown>
  ): { changes: number } => {
    assertForeignKeys(rowsByTable, table, values);
    writeOrder.push(`${table}:${String(values[localIdColumnByTable[table] ?? "id"])}`);
    const rows = rowsByTable[table] ?? (rowsByTable[table] = []);
    const localIdColumn = localIdColumnByTable[table] ?? "id";
    const existingIndex = rows.findIndex((row) => row[localIdColumn] === values[localIdColumn]);
    const nextRow = {
      ...(existingIndex >= 0 ? (rows[existingIndex] ?? {}) : {}),
      ...values
    };
    if (existingIndex >= 0) {
      rows[existingIndex] = nextRow;
    } else {
      rows.push(nextRow);
    }
    return { changes: 1 };
  };

  return { assertForeignKeys, localIdColumnByTable, upsertMockRow };
});

vi.mock("../../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: (sql: string) => ({
      all: () => {
        const table = /FROM\s+([a-z_]+)/i.exec(sql)?.[1] ?? "";
        return state.rowsByTable[table] ?? [];
      },
      get: (...args: unknown[]) => {
        const table = /FROM\s+([a-z_]+)/i.exec(sql)?.[1] ?? "";
        const rows = state.rowsByTable[table] ?? [];
        if (sql.includes("cloud_id = ?")) {
          return rows.find((row) => row.cloud_id === args[0]);
        }
        const column = /WHERE\s+([a-z_]+)\s*=\s*\?/i.exec(sql)?.[1] ?? "";
        return rows.find((row) => row[column] === args[0]);
      },
      run: (params: Record<string, unknown> | string) => {
        if (sql.includes("INSERT INTO cloud_sync_conflicts")) {
          state.conflicts.push(params as Record<string, unknown>);
          return { changes: 1 };
        }

        const insertTable = /INSERT INTO\s+([a-z_]+)/i.exec(sql)?.[1];
        if (insertTable) {
          return mockDb.upsertMockRow(
            state.rowsByTable,
            state.writeOrder,
            insertTable,
            params as Record<string, unknown>
          );
        }

        if (sql.includes("sync_status = 'conflict'")) {
          const table = /UPDATE\s+([a-z_]+)/i.exec(sql)?.[1] ?? "";
          const localIdColumn = mockDb.localIdColumnByTable[table] ?? "id";
          const row = (state.rowsByTable[table] ?? []).find((item) => item[localIdColumn] === params);
          if (row) {
            row.sync_status = "conflict";
          }
          return { changes: row ? 1 : 0 };
        }

        const updateTable = /UPDATE\s+([a-z_]+)/i.exec(sql)?.[1];
        const updateColumn = /SET\s+([a-z_]+)\s*=\s*@value/i.exec(sql)?.[1];
        const whereColumn = /WHERE\s+([a-z_]+)\s*=\s*@localId/i.exec(sql)?.[1];
        if (updateTable && updateColumn && whereColumn && typeof params === "object") {
          const row = (state.rowsByTable[updateTable] ?? []).find((item) => item[whereColumn] === params.localId);
          if (row) {
            const nextRow = {
              ...row,
              [updateColumn]: params.value
            };
            mockDb.assertForeignKeys(state.rowsByTable, updateTable, nextRow);
            row[updateColumn] = params.value;
          }
          return { changes: row ? 1 : 0 };
        }

        return { changes: 0 };
      }
    }),
    transaction: (callback: (items: unknown[]) => void) => (items: unknown[]) => callback(items)
  })
}));

const { cloudSyncLocalStore } = await import("./cloud-sync-local-store");

const now = "2026-05-01T12:00:00.000Z";

const resetRows = (): void => {
  state.rowsByTable = {
    products: [],
    product_variants: [],
    inventory_items: [],
    orders: [],
    events: [],
    app_notifications: [],
    settings: [],
    users: []
  };
  state.conflicts = [];
  state.writeOrder = [];
};

const rowsFor = (table: string): Array<Record<string, unknown>> => state.rowsByTable[table] ?? [];

beforeEach(() => {
  resetRows();
});

describe("cloudSyncLocalStore.collectChanges", () => {
  it("returns an empty array when there are no local entities", () => {
    const collection = cloudSyncLocalStore.collectChanges(true);

    expect(collection).toEqual({
      changes: [],
      ignored: 0,
      entityTypes: []
    });
  });

  it("collects products and variants as valid sync entities", () => {
    rowsFor("products").push({
      id: "product-1",
      internal_code: "PRD-1",
      name: "Produto",
      category: "Contas",
      sale_price_cents: 10000,
      unit_cost_cents: 5000,
      status: "active",
      created_at: now,
      updated_at: now,
      cloud_id: null,
      sync_revision: 0,
      sync_status: "pending"
    });
    rowsFor("product_variants").push({
      id: "variant-1",
      product_id: "product-1",
      variant_code: "VAR-1",
      name: "Variação",
      sale_price_cents: 11000,
      unit_cost_cents: 6000,
      status: "active",
      created_at: now,
      updated_at: now,
      sync_revision: 0,
      sync_status: "pending"
    });

    const collection = cloudSyncLocalStore.collectChanges(true);

    expect(collection.changes).toHaveLength(2);
    expect(collection.entityTypes).toEqual(["products", "product_variants"]);
    expect(collection.changes[0]).toMatchObject({
      entityType: "products",
      localId: "product-1",
      baseVersion: 0,
      updatedAt: now,
      payload: {
        id: "product-1",
        internal_code: "PRD-1",
        name: "Produto"
      }
    });
    expect(collection.changes[1]).toMatchObject({
      entityType: "product_variants",
      localId: "variant-1",
      payload: {
        id: "variant-1",
        product_id: "product-1",
        variant_code: "VAR-1"
      }
    });
  });

  it("removes protected fields before creating upload entities", () => {
    rowsFor("inventory_items").push({
      id: "inventory-1",
      inventory_code: "INV-1",
      product_id: "product-1",
      product_variant_id: "variant-1",
      purchase_cost_cents: 5000,
      status: "available",
      public_notes: {
        safe: "kept",
        token: "fake-token",
        passwordHash: "fake-password-hash"
      },
      account_login_encrypted: "fake-login",
      account_password_encrypted: "fake-password",
      raw_payload: JSON.stringify({ unsafe: true }),
      created_at: now,
      updated_at: now,
      sync_revision: 0,
      sync_status: "pending"
    });

    const collection = cloudSyncLocalStore.collectChanges(true);
    const serialized = JSON.stringify(collection.changes);

    expect(collection.changes).toHaveLength(1);
    expect(collection.ignored).toBeGreaterThanOrEqual(4);
    expect(collection.changes[0]?.payload).toMatchObject({
      id: "inventory-1",
      inventory_code: "INV-1",
      public_notes: { safe: "kept" }
    });
    expect(serialized).not.toContain("fake-");
    expect(serialized).not.toContain("unsafe");
    expect(serialized).not.toContain("account_login_encrypted");
    expect(serialized).not.toContain("raw_payload");
  });

  it("does not upload sensitive settings even when they were stored as non-secret", () => {
    rowsFor("settings").push({
      key: "custom_api_token",
      value_json: JSON.stringify("gm_sk_should_not_sync_123456"),
      is_secret: 0,
      updated_at: now,
      sync_revision: 0,
      sync_status: "pending"
    });

    const collection = cloudSyncLocalStore.collectChanges(true);
    const serialized = JSON.stringify(collection.changes);

    expect(collection.changes).toHaveLength(0);
    expect(collection.ignored).toBe(1);
    expect(serialized).not.toContain("gm_sk_should_not_sync_123456");
  });
});

describe("cloudSyncLocalStore.applyRemote", () => {
  type RemoteEntity = Parameters<typeof cloudSyncLocalStore.applyRemote>[0][number];

  const remoteSetting = (overrides: Partial<Parameters<typeof cloudSyncLocalStore.applyRemote>[0][number]> = {}) => ({
    cloudId: "cloud-setting-1",
    workspaceId: "workspace-1",
    entityType: "settings" as const,
    localId: "ui_density",
    payload: {
      key: "ui_density",
      value_json: JSON.stringify("compact"),
      updated_at: now
    },
    version: 1,
    updatedByUserId: "cloud-user-1",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides
  });

  const remoteEntity = (
    entityType: RemoteEntity["entityType"],
    localId: string,
    payload: Record<string, unknown>,
    overrides: Partial<RemoteEntity> = {}
  ): RemoteEntity => ({
    cloudId: `cloud-${entityType}-${localId}`,
    workspaceId: "workspace-1",
    entityType,
    localId,
    payload,
    version: 1,
    updatedByUserId: "cloud-user-owner",
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides
  });

  const productPayload = (index: number): Record<string, unknown> => ({
    id: `product-${index}`,
    internal_code: `PRD-${index}`,
    external_id: `GMK-PRD-${index}`,
    name: `Produto ${index}`,
    category: "Contas",
    game: "Game",
    platform: "PC",
    listing_url: null,
    sale_price_cents: 10000 + index,
    unit_cost_cents: 5000 + index,
    fee_percent: 13,
    net_value_cents: 8700 + index,
    estimated_profit_cents: 3700,
    margin_percent: 37,
    stock_current: 3,
    stock_min: 1,
    status: "active",
    delivery_type: "manual",
    supplier_id: null,
    notes: null,
    external_marketplace: "gamemarket",
    external_product_id: `external-product-${index}`,
    external_status: "active",
    external_payload_hash: `hash-product-${index}`,
    last_synced_at: now,
    created_by_user_id: "cloud-owner-user",
    updated_by_user_id: "cloud-owner-user",
    created_at: now,
    updated_at: now
  });

  const variantPayload = (index: number, productIndex: number): Record<string, unknown> => ({
    id: `variant-${index}`,
    product_id: `product-${productIndex}`,
    variant_code: `VAR-${index}`,
    name: `Variação ${index}`,
    description: null,
    sale_price_cents: 12000 + index,
    unit_cost_cents: 6000 + index,
    fee_percent: 13,
    net_value_cents: 10440 + index,
    estimated_profit_cents: 4440,
    margin_percent: 37,
    stock_current: 2,
    stock_min: 1,
    supplier_name: null,
    supplier_url: null,
    delivery_type: "manual",
    status: "active",
    notes: null,
    source: "gamemarket_sync",
    needs_review: 0,
    manually_edited_at: null,
    created_at: now,
    updated_at: now
  });

  it("applies non-sensitive settings with is_secret false when the cloud payload omits it", () => {
    const result = cloudSyncLocalStore.applyRemote([remoteSetting()], now);
    const stored = rowsFor("settings").find((row) => row.key === "ui_density");

    expect(result).toEqual({ applied: 1, conflicts: 0, ignored: 0, skipped: 0 });
    expect(stored).toMatchObject({
      key: "ui_density",
      value_json: JSON.stringify("compact"),
      is_secret: 0,
      sync_status: "synced"
    });
  });

  it("does not apply sensitive settings from the cloud over local secrets", () => {
    rowsFor("settings").push({
      key: "gamemarket_api_token_encrypted",
      value_json: JSON.stringify("local-encrypted-token"),
      is_secret: 1,
      updated_at: now,
      sync_revision: 0,
      sync_status: "synced"
    });

    const result = cloudSyncLocalStore.applyRemote(
      [
        remoteSetting({
          localId: "gamemarket_api_token_encrypted",
          payload: {
            key: "gamemarket_api_token_encrypted",
            value_json: JSON.stringify("remote-encrypted-token"),
            is_secret: 0,
            updated_at: now
          }
        })
      ],
      now
    );
    const stored = rowsFor("settings").find((row) => row.key === "gamemarket_api_token_encrypted");

    expect(result).toEqual({ applied: 0, conflicts: 0, ignored: 1, skipped: 0 });
    expect(stored?.value_json).toBe(JSON.stringify("local-encrypted-token"));
    expect(stored?.is_secret).toBe(1);
  });

  it("records a conflict and keeps dirty local settings instead of overwriting them", () => {
    rowsFor("settings").push({
      key: "ui_density",
      value_json: JSON.stringify("local-compact"),
      is_secret: 0,
      updated_at: "2026-05-01T12:05:00.000Z",
      last_cloud_synced_at: "2026-05-01T12:00:00.000Z",
      sync_revision: 1,
      sync_status: "pending"
    });

    const result = cloudSyncLocalStore.applyRemote(
      [
        remoteSetting({
          payload: {
            key: "ui_density",
            value_json: JSON.stringify("remote-comfortable"),
            updated_at: "2026-05-01T12:03:00.000Z"
          },
          version: 2
        })
      ],
      now
    );
    const stored = rowsFor("settings").find((row) => row.key === "ui_density");

    expect(result).toEqual({ applied: 0, conflicts: 1, ignored: 0, skipped: 0 });
    expect(state.conflicts).toHaveLength(1);
    expect(stored?.value_json).toBe(JSON.stringify("local-compact"));
    expect(stored?.sync_status).toBe("pending");
  });

  it("ignores stale remote rows when the local row has a newer pending edit", () => {
    rowsFor("settings").push({
      key: "ui_density",
      value_json: JSON.stringify("local-newer"),
      is_secret: 0,
      updated_at: "2026-05-01T12:05:00.000Z",
      last_cloud_synced_at: "2026-05-01T12:00:00.000Z",
      sync_revision: 2,
      sync_status: "pending"
    });

    const result = cloudSyncLocalStore.applyRemote(
      [
        remoteSetting({
          payload: {
            key: "ui_density",
            value_json: JSON.stringify("remote-stale"),
            updated_at: "2026-05-01T12:03:00.000Z"
          },
          version: 1
        })
      ],
      now
    );
    const stored = rowsFor("settings").find((row) => row.key === "ui_density");

    expect(result).toEqual({ applied: 0, conflicts: 0, ignored: 1, skipped: 0 });
    expect(state.conflicts).toHaveLength(0);
    expect(stored?.value_json).toBe(JSON.stringify("local-newer"));
  });

  it("bootstraps a clean collaborator database in dependency order without foreign key failures", () => {
    rowsFor("users").push({
      id: "local-collaborator-admin",
      username: "colaboradora",
      name: "Colaboradora"
    });

    const products = Array.from({ length: 11 }, (_, index) => {
      const productIndex = index + 1;
      return remoteEntity("products", `product-${productIndex}`, productPayload(productIndex), {
        version: productIndex,
        updatedAt: `2026-05-01T12:00:${String(productIndex).padStart(2, "0")}.000Z`
      });
    });
    const variants = Array.from({ length: 35 }, (_, index) => {
      const variantIndex = index + 1;
      const productIndex = (index % 11) + 1;
      return remoteEntity("product_variants", `variant-${variantIndex}`, variantPayload(variantIndex, productIndex), {
        version: variantIndex,
        updatedAt: `2026-05-01T12:01:${String(variantIndex).padStart(2, "0")}.000Z`
      });
    });
    const order = remoteEntity("orders", "order-1", {
      id: "order-1",
      order_code: "ORD-1",
      external_order_id: "GMK-ORD-1",
      marketplace: "gamemarket",
      external_marketplace: "gamemarket",
      external_status: "delivered",
      external_payload_hash: "order-hash",
      last_synced_at: now,
      product_id: "product-1",
      product_variant_id: "variant-1",
      inventory_item_id: null,
      buyer_name: "Cliente",
      buyer_contact: null,
      product_name_snapshot: "Produto 1",
      category_snapshot: "Contas",
      sale_price_cents: 12000,
      unit_cost_cents: 6000,
      fee_percent: 13,
      net_value_cents: 10440,
      profit_cents: 4440,
      margin_percent: 37,
      status: "delivered",
      action_required: 1,
      marketplace_url: null,
      notes: null,
      created_by_user_id: "cloud-owner-user",
      updated_by_user_id: "cloud-owner-user",
      created_at: now,
      updated_at: now,
      confirmed_at: now,
      delivered_at: now,
      completed_at: null,
      cancelled_at: null,
      refunded_at: null
    });
    const firstEvent = remoteEntity("events", "event-1", {
      id: "event-1",
      event_code: "EVT-1",
      source: "system",
      type: "order.created",
      severity: "info",
      title: "Pedido criado",
      message: "Pedido importado com segurança.",
      order_id: "order-1",
      product_id: "product-1",
      inventory_item_id: null,
      actor_user_id: "cloud-owner-user",
      read_at: null,
      created_at: now
    });
    const secondEvent = remoteEntity("events", "event-2", {
      ...firstEvent.payload,
      id: "event-2",
      event_code: "EVT-2",
      type: "order.delivered",
      title: "Pedido entregue"
    });
    const notification = remoteEntity("app_notifications", "notification-1", {
      id: "notification-1",
      type: "new_sale",
      severity: "info",
      title: "Nova venda",
      message: "Pedido recebido.",
      order_id: "order-1",
      external_order_id: "GMK-ORD-1",
      event_id: "event-1",
      dedupe_key: "order-1:new-sale",
      read_at: null,
      created_at: now
    });
    const setting = remoteSetting({
      cloudId: "cloud-setting-ui-density",
      localId: "ui_density",
      payload: {
        key: "ui_density",
        value_json: JSON.stringify("compact"),
        updated_at: now
      }
    });

    const result = cloudSyncLocalStore.applyRemote(
      [...variants, order, firstEvent, secondEvent, notification, setting, ...products],
      now
    );

    expect(result).toMatchObject({ applied: 51, conflicts: 0, skipped: 0 });
    expect(rowsFor("products")).toHaveLength(11);
    expect(rowsFor("product_variants")).toHaveLength(35);
    expect(rowsFor("orders")).toHaveLength(1);
    expect(rowsFor("events")).toHaveLength(2);
    expect(rowsFor("app_notifications")).toHaveLength(1);
    expect(rowsFor("settings")).toHaveLength(1);
    expect(rowsFor("products").every((row) => row.created_by_user_id === null && row.updated_by_user_id === null)).toBe(
      true
    );
    expect(rowsFor("events").every((row) => row.actor_user_id === null)).toBe(true);
    expect(rowsFor("orders")[0]).toMatchObject({
      product_id: "product-1",
      product_variant_id: "variant-1"
    });
    expect(state.writeOrder.findIndex((item) => item.startsWith("products:"))).toBeLessThan(
      state.writeOrder.findIndex((item) => item.startsWith("product_variants:"))
    );
    expect(state.writeOrder.findIndex((item) => item.startsWith("product_variants:"))).toBeLessThan(
      state.writeOrder.findIndex((item) => item.startsWith("orders:"))
    );
    expect(state.writeOrder.findIndex((item) => item.startsWith("orders:"))).toBeLessThan(
      state.writeOrder.findIndex((item) => item.startsWith("events:"))
    );
    expect(state.writeOrder.findIndex((item) => item.startsWith("events:"))).toBeLessThan(
      state.writeOrder.findIndex((item) => item.startsWith("app_notifications:"))
    );
  });

  it("turns a product variant with a missing parent into a safe conflict", () => {
    const result = cloudSyncLocalStore.applyRemote(
      [remoteEntity("product_variants", "variant-orphan", variantPayload(1, 999))],
      now
    );

    expect(result).toEqual({ applied: 0, conflicts: 1, ignored: 0, skipped: 1 });
    expect(rowsFor("product_variants")).toHaveLength(0);
    expect(state.conflicts).toHaveLength(1);
  });

  it("skips an order with a missing product without crashing", () => {
    const result = cloudSyncLocalStore.applyRemote(
      [
        remoteEntity("orders", "order-orphan", {
          id: "order-orphan",
          order_code: "ORD-ORPHAN",
          external_order_id: null,
          marketplace: "gamemarket",
          external_marketplace: "gamemarket",
          external_status: null,
          external_payload_hash: null,
          last_synced_at: now,
          product_id: "missing-product",
          product_variant_id: null,
          inventory_item_id: null,
          buyer_name: null,
          buyer_contact: null,
          product_name_snapshot: "Produto ausente",
          category_snapshot: "Contas",
          sale_price_cents: 1000,
          unit_cost_cents: 500,
          fee_percent: 13,
          net_value_cents: 870,
          profit_cents: 370,
          margin_percent: 37,
          status: "payment_confirmed",
          action_required: 1,
          marketplace_url: null,
          notes: null,
          created_by_user_id: "cloud-owner-user",
          updated_by_user_id: "cloud-owner-user",
          created_at: now,
          updated_at: now,
          confirmed_at: now,
          delivered_at: null,
          completed_at: null,
          cancelled_at: null,
          refunded_at: null
        })
      ],
      now
    );

    expect(result).toEqual({ applied: 0, conflicts: 1, ignored: 0, skipped: 1 });
    expect(rowsFor("orders")).toHaveLength(0);
    expect(state.conflicts).toHaveLength(1);
  });

  it("applies events and notifications with missing optional links as safe null references", () => {
    const result = cloudSyncLocalStore.applyRemote(
      [
        remoteEntity("events", "event-missing-actor", {
          id: "event-missing-actor",
          event_code: "EVT-MISSING",
          source: "system",
          type: "order.created",
          severity: "info",
          title: "Evento seguro",
          message: null,
          order_id: "missing-order",
          product_id: "missing-product",
          inventory_item_id: "missing-inventory",
          actor_user_id: "missing-user",
          read_at: null,
          created_at: now
        }),
        remoteEntity("app_notifications", "notification-missing-order", {
          id: "notification-missing-order",
          type: "internal_event",
          severity: "warning",
          title: "Notificação segura",
          message: "Referências ausentes foram removidas.",
          order_id: "missing-order",
          external_order_id: "GMK-MISSING",
          event_id: "missing-event",
          dedupe_key: "missing-order:notification",
          read_at: null,
          created_at: now
        })
      ],
      now
    );

    expect(result).toMatchObject({ applied: 2, conflicts: 0, skipped: 0 });
    expect(result.ignored).toBe(6);
    expect(rowsFor("events")[0]).toMatchObject({
      order_id: null,
      product_id: null,
      inventory_item_id: null,
      actor_user_id: null
    });
    expect(rowsFor("app_notifications")[0]).toMatchObject({
      order_id: null,
      event_id: null
    });
  });

  it("does not download protected inventory secrets from remote payloads", () => {
    rowsFor("products").push({
      id: "product-1",
      internal_code: "PRD-1",
      name: "Produto 1"
    });
    rowsFor("product_variants").push({
      id: "variant-1",
      product_id: "product-1",
      variant_code: "VAR-1",
      name: "Variação 1"
    });

    const result = cloudSyncLocalStore.applyRemote(
      [
        remoteEntity("inventory_items", "inventory-1", {
          id: "inventory-1",
          inventory_code: "INV-1",
          product_id: "product-1",
          product_variant_id: "variant-1",
          supplier_id: null,
          purchase_cost_cents: 5000,
          status: "available",
          public_notes: "ok",
          account_login_encrypted: "remote-login",
          account_password_encrypted: "remote-password",
          raw_payload: JSON.stringify({ token: "gm_sk_remote_secret" }),
          bought_at: null,
          sold_at: null,
          delivered_at: null,
          order_id: null,
          created_by_user_id: null,
          updated_by_user_id: null,
          created_at: now,
          updated_at: now
        })
      ],
      now
    );

    const serialized = JSON.stringify(rowsFor("inventory_items"));

    expect(result).toMatchObject({ applied: 1, conflicts: 0, skipped: 0 });
    expect(serialized).not.toContain("remote-login");
    expect(serialized).not.toContain("remote-password");
    expect(serialized).not.toContain("gm_sk_remote_secret");
  });

  it("does not overwrite newer local variation cost with stale remote data", () => {
    rowsFor("products").push({
      id: "product-1",
      internal_code: "PRD-1",
      name: "Produto 1"
    });
    rowsFor("product_variants").push({
      ...variantPayload(1, 1),
      unit_cost_cents: 9900,
      sync_revision: 1,
      sync_status: "pending",
      last_cloud_synced_at: "2026-05-01T12:00:00.000Z",
      updated_at: "2026-05-01T12:05:00.000Z"
    });

    const result = cloudSyncLocalStore.applyRemote(
      [
        remoteEntity("product_variants", "variant-1", variantPayload(1, 1), {
          version: 2,
          updatedAt: "2026-05-01T12:03:00.000Z"
        })
      ],
      now
    );

    expect(result).toEqual({ applied: 0, conflicts: 1, ignored: 0, skipped: 0 });
    expect(rowsFor("product_variants")[0]?.unit_cost_cents).toBe(9900);
    expect(state.conflicts).toHaveLength(1);
  });
});
