import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rowsByTable: {} as Record<string, Array<Record<string, unknown>>>,
  conflicts: [] as Array<Record<string, unknown>>
}));

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

        if (sql.includes("INSERT INTO settings")) {
          const values = params as Record<string, unknown>;
          if (values.is_secret === null || values.is_secret === undefined) {
            throw new Error("NOT NULL constraint failed: settings.is_secret");
          }
          const rows = state.rowsByTable.settings ?? (state.rowsByTable.settings = []);
          const existingIndex = rows.findIndex((row) => row.key === values.key);
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
        }

        if (sql.includes("UPDATE settings") && sql.includes("sync_status = 'conflict'")) {
          const row = (state.rowsByTable.settings ?? []).find((item) => item.key === params);
          if (row) {
            row.sync_status = "conflict";
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
    settings: []
  };
  state.conflicts = [];
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

  it("applies non-sensitive settings with is_secret false when the cloud payload omits it", () => {
    const result = cloudSyncLocalStore.applyRemote([remoteSetting()], now);
    const stored = rowsFor("settings").find((row) => row.key === "ui_density");

    expect(result).toEqual({ applied: 1, conflicts: 0, ignored: 0 });
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

    expect(result).toEqual({ applied: 0, conflicts: 0, ignored: 1 });
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

    expect(result).toEqual({ applied: 0, conflicts: 1, ignored: 0 });
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

    expect(result).toEqual({ applied: 0, conflicts: 0, ignored: 1 });
    expect(state.conflicts).toHaveLength(0);
    expect(stored?.value_json).toBe(JSON.stringify("local-newer"));
  });
});
