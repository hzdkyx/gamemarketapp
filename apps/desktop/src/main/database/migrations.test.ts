import { describe, expect, it } from "vitest";
import { runtimeMigrations } from "./migrations";

describe("runtime migrations", () => {
  it("defines the product variants migration with inventory and order links", () => {
    const migration = runtimeMigrations.find((item) => item.id === "0006_product_variants");

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS product_variants");
    expect(migration?.sql).toContain("variant_code TEXT NOT NULL UNIQUE");
    expect(migration?.sql).toContain("needs_review INTEGER NOT NULL DEFAULT 0");
    expect(migration?.sql).toContain("ALTER TABLE inventory_items ADD COLUMN product_variant_id");
    expect(migration?.sql).toContain("ALTER TABLE orders ADD COLUMN product_variant_id");
    expect(migration?.sql).toContain("idx_product_variants_product");
  });

  it("defines the GameMarket release status hotfix migration", () => {
    const migration = runtimeMigrations.find((item) => item.id === "0007_gamemarket_release_status_hotfix");

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain("order.status_corrected");
    expect(migration?.sql).toContain("external_marketplace = 'gamemarket'");
    expect(migration?.sql).toContain("external_status, '')) = 'processing'");
    expect(migration?.sql).toContain("completed_at = NULL");
  });

  it("defines the local app notifications migration with dedupe indexes", () => {
    const migration = runtimeMigrations.find((item) => item.id === "0008_phase6_local_notifications_polling");

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS app_notifications");
    expect(migration?.sql).toContain("dedupe_key TEXT");
    expect(migration?.sql).toContain("metadata_json TEXT");
    expect(migration?.sql).toContain("idx_app_notifications_dedupe");
    expect(migration?.sql).toContain("WHERE dedupe_key IS NOT NULL");
  });

  it("defines the cloud workspace sync migration without removing local mode tables", () => {
    const migration = runtimeMigrations.find((item) => item.id === "0009_phase7_cloud_workspace_sync");

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain("ALTER TABLE products ADD COLUMN cloud_id");
    expect(migration?.sql).toContain("ALTER TABLE product_variants ADD COLUMN workspace_id");
    expect(migration?.sql).toContain("ALTER TABLE inventory_items ADD COLUMN sync_status");
    expect(migration?.sql).toContain("ALTER TABLE orders ADD COLUMN sync_revision");
    expect(migration?.sql).toContain("ALTER TABLE events ADD COLUMN deleted_at");
    expect(migration?.sql).toContain("CREATE TABLE IF NOT EXISTS cloud_sync_conflicts");
    expect(migration?.sql).toContain("idx_cloud_sync_conflicts_workspace");
  });
});
