import { describe, expect, it } from "vitest";
import {
  calculateFinancials,
  calculateProductFinancials,
  GAMEMARKET_FEE_PERCENT,
  GAMEMARKET_FEE_RATE,
  GAMEMARKET_NET_RATE
} from "./financial";

describe("calculateFinancials", () => {
  it("calculates GameMarket net value, profit and margin", () => {
    const summary = calculateFinancials({
      salePrice: 100,
      unitCost: 40
    });

    expect(GAMEMARKET_FEE_RATE).toBe(0.13);
    expect(GAMEMARKET_NET_RATE).toBe(0.87);
    expect(summary.netValue).toBe(87);
    expect(summary.profit).toBe(47);
    expect(summary.margin).toBeCloseTo(0.47);
    expect(summary.breakEvenPrice).toBe(45.98);
  });

  it("calculates ideal price from desired profit", () => {
    const summary = calculateFinancials({
      salePrice: 100,
      unitCost: 40,
      desiredProfit: 30
    });

    expect(summary.idealPrice).toBe(80.46);
  });

  it("calculates product fields from a 13 percent marketplace fee", () => {
    const summary = calculateProductFinancials({
      salePrice: 100,
      unitCost: 40,
      desiredProfit: 30,
      feePercent: GAMEMARKET_FEE_PERCENT
    });

    expect(summary.netValue).toBe(87);
    expect(summary.estimatedProfit).toBe(47);
    expect(summary.marginPercent).toBeCloseTo(0.47);
    expect(summary.minimumPrice).toBe(45.98);
    expect(summary.idealPrice).toBe(80.46);
  });

  it("rejects invalid fee rates", () => {
    expect(() =>
      calculateFinancials({
        salePrice: 100,
        unitCost: 40,
        feeRate: 1
      })
    ).toThrow("feeRate");
  });

  it("rejects invalid fee percents", () => {
    expect(() =>
      calculateProductFinancials({
        salePrice: 100,
        unitCost: 40,
        feePercent: 100
      })
    ).toThrow("feePercent");
  });
});
