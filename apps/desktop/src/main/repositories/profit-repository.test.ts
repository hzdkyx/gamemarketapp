import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  sourceRows: [] as Array<Record<string, unknown>>,
  queries: [] as string[],
}));

vi.mock("../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: (sql: string) => {
      state.queries.push(sql);

      return {
        all: () => {
          if (sql.includes("FROM product_variants")) {
            return state.sourceRows;
          }

          return [];
        },
        get: () => {
          if (sql.includes("NOT EXISTS")) {
            return { total: 0 };
          }

          if (sql.includes("FROM products") && !sql.includes("NOT EXISTS")) {
            return { total: 2 };
          }

          if (sql.includes("FROM product_variants WHERE status")) {
            return { total: 2 };
          }

          if (sql.includes("FROM product_variants")) {
            return { total: 2 };
          }

          return { total: 0 };
        },
      };
    },
  }),
}));

const { profitRepository } = await import("./profit-repository");

const sourceRow = (overrides: Record<string, unknown>) => ({
  id: "variant-1",
  scope: "variant",
  product_id: "product-1",
  product_internal_code: "PRD-1",
  product_name: "CS2 Prime",
  product_category: "Contas",
  game: "CS2",
  product_variant_id: "variant-1",
  variant_code: "CS2-PRIME-NO-PREMIER",
  variant_name: "CS2 Prime | Sem Premier Ativo",
  sale_price_cents: 10000,
  unit_cost_cents: 4000,
  fee_percent: 13,
  stock_current: 0,
  stock_min: 0,
  delivery_type: "on_demand",
  supplier_name: "Fornecedor CS2 / a definir",
  status: "active",
  needs_review: 1,
  ...overrides,
});

beforeEach(() => {
  state.sourceRows.length = 0;
  state.queries.length = 0;
});

describe("profit repository", () => {
  it("finds variant rows without requiring stock and without excluding on-demand or service", () => {
    state.sourceRows.push(
      sourceRow({ id: "cs2", delivery_type: "on_demand", stock_current: 0 }),
      sourceRow({
        id: "tft",
        product_name: "TFT Elojob",
        game: "TFT",
        variant_code: "TFT-OURO-PLATINA",
        variant_name: "[ELOJOB TFT] Ouro para Platina",
        delivery_type: "service",
        stock_current: 0,
        unit_cost_cents: 0,
      }),
    );

    const rows = profitRepository.listRows();
    const query = state.queries[0] ?? "";

    expect(rows).toHaveLength(2);
    expect(rows[0]?.variantCode).toBe("CS2-PRIME-NO-PREMIER");
    expect(rows[0]?.stockCurrent).toBe(0);
    expect(rows[0]?.deliveryType).toBe("on_demand");
    expect(rows[1]?.deliveryType).toBe("service");
    expect(query).toContain("FROM product_variants");
    expect(query).toContain("INNER JOIN products");
    expect(query).not.toContain("stock_current > 0");
    expect(query).not.toContain("delivery_type != 'service'");
  });

  it("returns parent product rows when the base query provides products without variations", () => {
    state.sourceRows.push(
      sourceRow({
        id: "product-melodyne",
        scope: "product",
        product_id: "product-melodyne",
        product_internal_code: "MELODYNE",
        product_name: "Melodyne",
        game: null,
        product_variant_id: null,
        variant_code: null,
        variant_name: null,
        delivery_type: "manual",
      }),
    );

    const rows = profitRepository.listRows();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.scope).toBe("product");
    expect(rows[0]?.productVariantId).toBeNull();
  });

  it("returns safe diagnostic counts", () => {
    const diagnostics = profitRepository.getDiagnostics();

    expect(diagnostics.totalProducts).toBe(2);
    expect(diagnostics.totalVariants).toBe(2);
    expect(diagnostics.activeVariants).toBe(2);
    expect(diagnostics.parentOnlyProducts).toBe(0);
  });
});
