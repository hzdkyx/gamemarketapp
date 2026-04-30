import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfitAnalysisRow } from "../../shared/contracts";
import {
  makeProfitAnalysisRow,
  type ProfitAnalysisSource,
} from "../../shared/profit-analysis";

const state = vi.hoisted(() => ({
  rows: [] as ProfitAnalysisRow[],
}));

vi.mock("../repositories/profit-repository", () => ({
  profitRepository: {
    listRows: () => state.rows,
    getDiagnostics: () => ({
      totalProducts: new Set(state.rows.map((row) => row.productId)).size,
      totalVariants: state.rows.filter((row) => row.scope === "variant").length,
      activeVariants: state.rows.filter(
        (row) => row.scope === "variant" && row.status !== "archived",
      ).length,
      parentOnlyProducts: state.rows.filter((row) => row.scope === "product")
        .length,
    }),
  },
}));

const { profitService } = await import("./profit-service");

const defaultFilters = {
  search: null,
  category: null,
  deliveryType: "all",
  status: "all",
  review: "all",
  margin: "all",
  sortBy: "profit_desc",
} as const;

const source = (
  overrides: Partial<ProfitAnalysisSource>,
): ProfitAnalysisSource => ({
  id: "variant-1",
  scope: "variant",
  productId: "product-1",
  productInternalCode: "PRD-1",
  productName: "Clash of Clans",
  productCategory: "Contas",
  game: "Clash of Clans",
  productVariantId: "variant-1",
  variantCode: "COC-CV14",
  variantName: "CV14",
  salePrice: 100,
  unitCost: 40,
  feePercent: 13,
  stockCurrent: 2,
  stockMin: 1,
  deliveryType: "manual",
  supplierName: "Fornecedor A",
  status: "active",
  needsReview: false,
  ...overrides,
});

const row = (overrides: Partial<ProfitAnalysisSource>): ProfitAnalysisRow =>
  makeProfitAnalysisRow(source(overrides));

beforeEach(() => {
  state.rows.length = 0;
});

describe("profit service", () => {
  it("always returns a safe list, groups, filters and summary", () => {
    const result = profitService.list(defaultFilters);

    expect(Array.isArray(result.list)).toBe(true);
    expect(Array.isArray(result.groups)).toBe(true);
    expect(result.summary).toBeTruthy();
    expect(result.filters).toEqual({
      categories: [],
      deliveryTypes: [],
      statuses: [],
      suppliers: [],
    });
  });

  it("returns existing variation rows for CS2 and Clash", () => {
    state.rows.push(
      row({
        id: "cs2",
        productId: "product-cs2",
        productInternalCode: "CS2",
        productName: "CS2 Prime",
        productCategory: "Contas",
        game: "CS2",
        productVariantId: "variant-cs2",
        variantCode: "CS2-PRIME-PREMIER",
        variantName: "CS2 Prime | Premier Ativo",
      }),
      row({
        id: "clash",
        productId: "product-clash",
        productInternalCode: "COC",
        productName: "Clash of Clans",
        productCategory: "Contas",
        game: "Clash of Clans",
        productVariantId: "variant-clash",
        variantCode: "COC-CV14",
        variantName: "Clash of Clans CV14",
      }),
    );

    const result = profitService.list(defaultFilters);

    expect(
      result.list.some((item) => item.variantCode === "CS2-PRIME-PREMIER"),
    ).toBe(true);
    expect(
      result.list.some((item) => item.productName === "Clash of Clans"),
    ).toBe(true);
    expect(result.summary.variantRows).toBe(2);
  });

  it("returns LoL and TFT variation rows and CSV data beyond the header", () => {
    state.rows.push(
      row({
        id: "lol",
        productId: "product-lol",
        productInternalCode: "LOL",
        productName: "LoL Smurf",
        productCategory: "Contas",
        game: "League of Legends",
        productVariantId: "variant-lol",
        variantCode: "LOL-BR-BASE-20-29",
        variantName: "[BR] Level 20-29",
        stockCurrent: 0,
      }),
      row({
        id: "tft",
        productId: "product-tft",
        productInternalCode: "TFT",
        productName: "TFT Elojob",
        productCategory: "Serviços",
        game: "TFT",
        productVariantId: "variant-tft",
        variantCode: "TFT-OURO-PLATINA",
        variantName: "[ELOJOB TFT] Ouro para Platina",
        deliveryType: "service",
        unitCost: 0,
        stockCurrent: 0,
      }),
    );

    const result = profitService.list(defaultFilters);
    const csv = profitService.exportCsv(defaultFilters).content;

    expect(
      result.list.some((item) => item.variantCode?.startsWith("LOL-")),
    ).toBe(true);
    expect(
      result.list.some((item) => item.variantCode?.startsWith("TFT-")),
    ).toBe(true);
    expect(csv.split("\n").length).toBeGreaterThan(1);
    expect(csv).toContain("LOL-BR-BASE-20-29");
    expect(csv).toContain("TFT-OURO-PLATINA");
  });

  it("returns parent products without variations as parent-only rows", () => {
    state.rows.push(
      row({
        id: "melodyne",
        scope: "product",
        productId: "product-melodyne",
        productInternalCode: "MELODYNE",
        productName: "Melodyne",
        game: null,
        productVariantId: null,
        variantCode: null,
        variantName: null,
      }),
    );

    const result = profitService.list(defaultFilters);

    expect(result.list[0]?.scope).toBe("product");
    expect(result.summary.parentOnlyRows).toBe(1);
  });

  it("keeps TFT service rows in per-sale analysis but out of real stock cost", () => {
    state.rows.push(
      row({
        id: "tft-service",
        productId: "product-tft",
        productInternalCode: "TFT",
        productName: "TFT Elojob",
        productCategory: "Serviços",
        game: "TFT",
        productVariantId: "variant-tft",
        variantCode: "TFT-OURO-PLATINA",
        variantName: "[ELOJOB TFT] Ouro para Platina",
        salePrice: 24.9,
        unitCost: 0,
        stockCurrent: 999,
        stockMin: 0,
        deliveryType: "service",
        supplierName: "Serviço próprio",
      }),
    );

    const result = profitService.list(defaultFilters);

    expect(result.list).toHaveLength(1);
    expect(result.list[0]?.profit).toBeGreaterThan(0);
    expect(result.summary.averageProfitPerSale).toBeGreaterThan(0);
    expect(result.summary.stockCostTotal).toBe(0);
    expect(result.summary.grossPotential).toBe(0);
    expect(result.summary.potentialProfitTotal).toBe(0);
  });

  it("keeps on-demand rows in per-sale analysis but out of real stock cost", () => {
    state.rows.push(
      row({
        id: "on-demand",
        productId: "product-cs2",
        productInternalCode: "CS2",
        productName: "CS2 Prime",
        game: "CS2",
        productVariantId: "variant-cs2",
        variantCode: "CS2-PRIME-NO-PREMIER",
        variantName: "CS2 Prime | Sem Premier Ativo",
        deliveryType: "on_demand",
        unitCost: 30,
        stockCurrent: 999,
      }),
    );

    const result = profitService.list(defaultFilters);

    expect(result.list).toHaveLength(1);
    expect(result.list[0]?.deliveryType).toBe("on_demand");
    expect(result.summary.averageProfitPerSale).toBeGreaterThan(0);
    expect(result.summary.stockCostTotal).toBe(0);
    expect(result.summary.grossPotential).toBe(0);
    expect(result.summary.potentialProfitTotal).toBe(0);
  });

  it("counts manual and automatic real stock in potential profit", () => {
    state.rows.push(
      row({
        id: "manual",
        stockCurrent: 2,
        unitCost: 50,
        deliveryType: "manual",
      }),
      row({
        id: "automatic",
        stockCurrent: 1,
        unitCost: 40,
        deliveryType: "automatic",
      }),
    );

    const result = profitService.list(defaultFilters);

    expect(result.summary.potentialProfitTotal).toBe(121);
    expect(result.summary.stockCostTotal).toBe(140);
  });

  it("filters with empty option arrays and exports CSV without sensitive columns", () => {
    const empty = profitService.list({
      ...defaultFilters,
      category: "Sem linhas",
    });
    const csv = profitService.exportCsv(defaultFilters).content;
    const header = csv.split("\n")[0]?.toLowerCase() ?? "";

    expect(empty.list).toEqual([]);
    expect(empty.filters.deliveryTypes).toEqual([]);
    expect(header).not.toContain("login");
    expect(header).not.toContain("senha");
    expect(header).not.toContain("e-mail");
    expect(header).not.toContain("token");
    expect(header).not.toContain("api key");
    expect(header).not.toContain("webhook secret");
    expect(header).not.toContain("app sync token");
  });

  it("filters review with all, ok and needs_review without changing the base list", () => {
    state.rows.push(
      row({ id: "ok", variantCode: "OK", needsReview: false }),
      row({
        id: "needs-review",
        variantCode: "REVIEW",
        needsReview: true,
      }),
    );

    expect(profitService.list(defaultFilters).list).toHaveLength(2);
    expect(
      profitService.list({ ...defaultFilters, review: "ok" }).list,
    ).toHaveLength(1);
    expect(
      profitService.list({ ...defaultFilters, review: "needs_review" }).list,
    ).toHaveLength(1);
    expect(
      profitService.list({ ...defaultFilters, review: "ok" }).list[0]
        ?.needsReview,
    ).toBe(false);
    expect(
      profitService.list({ ...defaultFilters, review: "needs_review" }).list[0]
        ?.needsReview,
    ).toBe(true);
  });

  it("returns safe diagnostics for rows before and after filters", () => {
    state.rows.push(
      row({ id: "cs2", game: "CS2", variantCode: "CS2-PRIME-PREMIER" }),
      row({ id: "clash", game: "Clash of Clans", variantCode: "COC-CV14" }),
    );

    const diagnostics = profitService.getDiagnostics({
      ...defaultFilters,
      search: "CS2",
    });

    expect(diagnostics.totalVariants).toBe(2);
    expect(diagnostics.rowsBeforeFilters).toBe(2);
    expect(diagnostics.rowsAfterFilters).toBe(1);
  });
});
