import { describe, expect, it } from "vitest";
import type { OperationalStockRecord } from "../../shared/contracts";
import { getOperationalStockState, summarizeOperationalStock } from "./stock-rules";

const operationalItem = (overrides: Partial<OperationalStockRecord>): OperationalStockRecord => ({
  id: "item-1",
  scope: "product",
  productId: "product-1",
  productInternalCode: "PRD-1",
  productName: "Produto",
  category: "Contas",
  game: null,
  productVariantId: null,
  productVariantCode: null,
  productVariantName: null,
  deliveryType: "manual",
  stockCurrent: 1,
  stockMin: 1,
  salePrice: 15,
  unitCost: 0,
  netValue: 13.05,
  unitProfit: 13.05,
  potentialProfit: 13.05,
  status: "active",
  stockState: "low_stock",
  needsReview: false,
  supplierName: null,
  supplierUrl: null,
  ...overrides
});

describe("operational stock rules", () => {
  it("does not count service or on-demand delivery as out of stock", () => {
    expect(getOperationalStockState({ deliveryType: "service", stockCurrent: 0, stockMin: 1 })).toBe("service");
    expect(getOperationalStockState({ deliveryType: "on_demand", stockCurrent: 0, stockMin: 1 })).toBe("on_demand");
  });

  it("counts manual and automatic zero stock as out of stock", () => {
    expect(getOperationalStockState({ deliveryType: "manual", stockCurrent: 0, stockMin: 1 })).toBe("out_of_stock");
    expect(getOperationalStockState({ deliveryType: "automatic", stockCurrent: 0, stockMin: 1 })).toBe("out_of_stock");
  });

  it("sums cost and potential profit only for real available stock", () => {
    const summary = summarizeOperationalStock(
      [
        operationalItem({
          id: "manual",
          deliveryType: "manual",
          stockCurrent: 2,
          unitCost: 4,
          unitProfit: 6,
          potentialProfit: 12,
          stockState: "available"
        }),
        operationalItem({
          id: "service",
          deliveryType: "service",
          stockCurrent: 999,
          unitCost: 20,
          unitProfit: 50,
          potentialProfit: 0,
          stockState: "service"
        }),
        operationalItem({
          id: "review",
          stockCurrent: 0,
          potentialProfit: 0,
          stockState: "out_of_stock",
          needsReview: true
        })
      ],
      1
    );

    expect(summary.available).toBe(2);
    expect(summary.sold).toBe(1);
    expect(summary.problem).toBe(1);
    expect(summary.totalCost).toBe(8);
    expect(summary.potentialProfit).toBe(12);
    expect(summary.outOfStock).toBe(1);
  });
});
