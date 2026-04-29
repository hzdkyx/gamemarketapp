import type { DeliveryType, OperationalStockRecord, OperationalStockSummary, OperationalStockState } from "../../shared/contracts";

export const tracksRealStock = (deliveryType: DeliveryType): boolean =>
  deliveryType === "manual" || deliveryType === "automatic";

export const getOperationalStockState = (input: {
  deliveryType: DeliveryType;
  stockCurrent: number;
  stockMin: number;
}): OperationalStockState => {
  if (input.deliveryType === "service") {
    return "service";
  }

  if (input.deliveryType === "on_demand") {
    return "on_demand";
  }

  if (input.stockCurrent <= 0) {
    return "out_of_stock";
  }

  if (input.stockCurrent <= input.stockMin) {
    return "low_stock";
  }

  return "available";
};

export const getRealStockUnits = (input: {
  deliveryType: DeliveryType;
  stockCurrent: number;
}): number => (tracksRealStock(input.deliveryType) ? Math.max(0, input.stockCurrent) : 0);

export const summarizeOperationalStock = (
  items: OperationalStockRecord[],
  soldOrders: number
): OperationalStockSummary => {
  const initial: OperationalStockSummary = {
    available: 0,
    sold: soldOrders,
    problem: 0,
    totalCost: 0,
    potentialProfit: 0,
    lowStock: 0,
    outOfStock: 0,
    productRows: 0,
    variantRows: 0
  };

  return items.reduce((summary, item) => {
    if (item.scope === "variant") {
      summary.variantRows += 1;
    } else {
      summary.productRows += 1;
    }

    const units = getRealStockUnits(item);
    summary.available += units;
    summary.totalCost += units * item.unitCost;
    summary.potentialProfit += item.potentialProfit;

    if (item.stockState === "low_stock") {
      summary.lowStock += 1;
    }

    if (item.stockState === "out_of_stock") {
      summary.outOfStock += 1;
    }

    if (item.stockState === "low_stock" || item.stockState === "out_of_stock" || item.needsReview) {
      summary.problem += 1;
    }

    return summary;
  }, initial);
};
