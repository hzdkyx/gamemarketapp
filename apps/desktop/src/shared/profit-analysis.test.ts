import { describe, expect, it } from "vitest";
import type { ProfitListInput } from "./contracts";
import type { ProfitAnalysisSource } from "./profit-analysis";
import {
  analyzeProfitRows,
  buildProfitCsv,
  hasPendingUnitCost,
  makeProfitAnalysisRow,
  normalizeProfitListResult,
  summarizeProfitRows,
} from "./profit-analysis";

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

describe("profit analysis rules", () => {
  it("calculates net value, profit, margin and minimum price per variation", () => {
    const row = makeProfitAnalysisRow(source({ salePrice: 100, unitCost: 40 }));

    expect(row.netValue).toBe(87);
    expect(row.estimatedProfit).toBe(47);
    expect(row.marginPercent).toBeCloseTo(0.47);
    expect(row.minimumPrice).toBe(45.98);
  });

  it("does not duplicate parent product profit when variants exist", () => {
    const rows = [
      makeProfitAnalysisRow(
        source({ id: "variant-1", variantName: "CV11", unitCost: 20 }),
      ),
      makeProfitAnalysisRow(
        source({
          id: "variant-2",
          variantCode: "COC-CV12",
          variantName: "CV12",
          unitCost: 30,
        }),
      ),
    ];
    const result = analyzeProfitRows(rows, {
      search: null,
      category: null,
      deliveryType: "all",
      status: "all",
      review: "all",
      margin: "all",
      sortBy: "name_asc",
    });

    expect(result.summary.variantRows).toBe(2);
    expect(result.summary.parentOnlyRows).toBe(0);
    expect(result.groups[0]?.variationCount).toBe(2);
  });

  it("keeps parent products without variations as product rows", () => {
    const row = makeProfitAnalysisRow(
      source({
        id: "product-2",
        scope: "product",
        productId: "product-2",
        productInternalCode: "PRD-2",
        productName: "Produto avulso",
        productVariantId: null,
        variantCode: null,
        variantName: null,
      }),
    );
    const summary = summarizeProfitRows([row]);

    expect(row.scope).toBe("product");
    expect(summary.parentOnlyRows).toBe(1);
    expect(summary.variantRows).toBe(0);
  });

  it("ignores service and on-demand rows for real stock potential", () => {
    const summary = summarizeProfitRows([
      makeProfitAnalysisRow(
        source({ id: "manual", stockCurrent: 3, unitCost: 20 }),
      ),
      makeProfitAnalysisRow(
        source({
          id: "service",
          deliveryType: "service",
          stockCurrent: 999,
          unitCost: 20,
        }),
      ),
      makeProfitAnalysisRow(
        source({
          id: "on-demand",
          deliveryType: "on_demand",
          stockCurrent: 999,
          unitCost: 20,
        }),
      ),
    ]);

    expect(summary.stockCostTotal).toBe(60);
    expect(summary.grossPotential).toBe(300);
    expect(summary.netPotential).toBe(261);
    expect(summary.potentialProfitTotal).toBe(201);
  });

  it("counts manual and automatic available stock in potential profit", () => {
    const summary = summarizeProfitRows([
      makeProfitAnalysisRow(
        source({
          id: "manual",
          deliveryType: "manual",
          stockCurrent: 2,
          unitCost: 50,
        }),
      ),
      makeProfitAnalysisRow(
        source({
          id: "automatic",
          deliveryType: "automatic",
          stockCurrent: 1,
          unitCost: 40,
        }),
      ),
    ]);

    expect(summary.potentialProfitTotal).toBe(121);
  });

  it("flags zero cost as pending except for services", () => {
    expect(hasPendingUnitCost({ unitCost: 0, deliveryType: "manual" })).toBe(
      true,
    );
    expect(hasPendingUnitCost({ unitCost: 0, deliveryType: "automatic" })).toBe(
      true,
    );
    expect(hasPendingUnitCost({ unitCost: 0, deliveryType: "on_demand" })).toBe(
      true,
    );
    expect(hasPendingUnitCost({ unitCost: 0, deliveryType: "service" })).toBe(
      false,
    );
  });

  it("filters review, margin and search fields", () => {
    const rows = [
      makeProfitAnalysisRow(
        source({
          id: "review",
          variantName: "CS2 com Premier",
          needsReview: true,
        }),
      ),
      makeProfitAnalysisRow(
        source({
          id: "negative",
          variantName: "TFT plano caro",
          unitCost: 120,
        }),
      ),
      makeProfitAnalysisRow(
        source({
          id: "healthy",
          variantName: "Mobile Legends 76K BP",
          unitCost: 20,
        }),
      ),
    ];

    const result = analyzeProfitRows(rows, {
      search: "premier",
      category: null,
      deliveryType: "all",
      status: "all",
      review: "needs_review",
      margin: "all",
      sortBy: "profit_desc",
    });
    const negative = analyzeProfitRows(rows, {
      search: null,
      category: null,
      deliveryType: "all",
      status: "all",
      review: "all",
      margin: "negative_profit",
      sortBy: "profit_desc",
    });

    expect(result.list).toHaveLength(1);
    expect(result.list[0]?.variantName).toBe("CS2 com Premier");
    expect(negative.list).toHaveLength(1);
    expect(negative.list[0]?.variantName).toBe("TFT plano caro");
  });

  it("treats unknown runtime filters as all instead of emptying the list", () => {
    const rows = [
      makeProfitAnalysisRow(source({ id: "cs2", game: "CS2" })),
      makeProfitAnalysisRow(
        source({
          id: "clash",
          game: "Clash of Clans",
          productName: "Clash of Clans",
        }),
      ),
    ];

    const result = analyzeProfitRows(rows, {
      search: null,
      category: null,
      deliveryType: "desconhecido",
      status: "ativo",
      review: "OK",
      margin: "fora",
      sortBy: "profit_desc",
    } as unknown as ProfitListInput);

    expect(result.list).toHaveLength(2);
  });

  it("normalizes empty, partial and legacy profit IPC payloads", () => {
    expect(normalizeProfitListResult(undefined)).toEqual({
      summary: {
        potentialProfitTotal: 0,
        averageProfitPerSale: 0,
        highestMargin: null,
        lowestMargin: null,
        stockCostTotal: 0,
        grossPotential: 0,
        netPotential: 0,
        pendingCostCount: 0,
        needsReviewCount: 0,
        analyzedRows: 0,
        variantRows: 0,
        parentOnlyRows: 0,
      },
      list: [],
      groups: [],
      filters: {
        categories: [],
        deliveryTypes: [],
        statuses: [],
        suppliers: [],
      },
    });

    const legacyRow = makeProfitAnalysisRow(source({ id: "legacy" }));
    const normalized = normalizeProfitListResult({
      items: [legacyRow],
      productSummaries: [{ productId: "product-1" }],
      categories: ["Clash of Clans"],
      suppliers: ["Fornecedor A"],
      summary: {
        totalPotentialProfit: 10,
        totalInventoryCost: 5,
        rows: 1,
        parentProductRows: 0,
      },
    });

    expect(normalized.list).toHaveLength(1);
    expect(normalized.groups).toHaveLength(1);
    expect(normalized.filters.categories).toEqual(["Clash of Clans"]);
    expect(normalized.summary.potentialProfitTotal).toBe(10);
    expect(normalized.summary.stockCostTotal).toBe(5);
    expect(normalized.summary.analyzedRows).toBe(1);
  });

  it("exports CSV without sensitive account or token columns", () => {
    const csv = buildProfitCsv([
      makeProfitAnalysisRow(source({ needsReview: true })),
    ]);
    const header = csv.split("\n")[0] ?? "";

    expect(header).toContain("Produto pai");
    expect(header).toContain("Lucro");
    expect(header.toLowerCase()).not.toContain("login");
    expect(header.toLowerCase()).not.toContain("senha");
    expect(header.toLowerCase()).not.toContain("token");
    expect(header.toLowerCase()).not.toContain("api key");
    expect(header.toLowerCase()).not.toContain("e-mail");
  });
});
