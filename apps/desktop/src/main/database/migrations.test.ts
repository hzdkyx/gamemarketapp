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
});
