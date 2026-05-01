import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rowsByTable: {} as Record<string, Array<Record<string, unknown>>>
}));

vi.mock("../../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: (sql: string) => ({
      all: () => {
        const table = /FROM\s+([a-z_]+)/i.exec(sql)?.[1] ?? "";
        return state.rowsByTable[table] ?? [];
      }
    })
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
});
