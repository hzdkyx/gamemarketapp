export const GAMEMARKET_FEE_RATE = 0.13;
export const GAMEMARKET_NET_RATE = 1 - GAMEMARKET_FEE_RATE;
export const GAMEMARKET_FEE_PERCENT = 13;

export interface FinancialInput {
  salePrice: number;
  unitCost: number;
  desiredProfit?: number;
  feeRate?: number;
}

export interface FinancialSummary {
  salePrice: number;
  unitCost: number;
  feeRate: number;
  netRate: number;
  grossFee: number;
  netValue: number;
  profit: number;
  margin: number;
  breakEvenPrice: number;
  idealPrice: number;
}

export interface ProductFinancialInput {
  salePrice: number;
  unitCost: number;
  desiredProfit?: number;
  feePercent?: number;
}

export interface ProductFinancialSummary {
  salePrice: number;
  unitCost: number;
  feePercent: number;
  netValue: number;
  estimatedProfit: number;
  marginPercent: number;
  minimumPrice: number;
  idealPrice: number;
}

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const assertValidMoney = (label: string, value: number): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`);
  }
};

export const calculateFinancials = ({
  salePrice,
  unitCost,
  desiredProfit = 0,
  feeRate = GAMEMARKET_FEE_RATE
}: FinancialInput): FinancialSummary => {
  assertValidMoney("salePrice", salePrice);
  assertValidMoney("unitCost", unitCost);
  assertValidMoney("desiredProfit", desiredProfit);

  if (!Number.isFinite(feeRate) || feeRate < 0 || feeRate >= 1) {
    throw new Error("feeRate must be greater than or equal to 0 and less than 1.");
  }

  const netRate = 1 - feeRate;
  const grossFee = salePrice * feeRate;
  const netValue = salePrice * netRate;
  const profit = netValue - unitCost;
  const margin = salePrice === 0 ? 0 : profit / salePrice;
  const breakEvenPrice = unitCost / netRate;
  const idealPrice = (unitCost + desiredProfit) / netRate;

  return {
    salePrice: roundCurrency(salePrice),
    unitCost: roundCurrency(unitCost),
    feeRate,
    netRate,
    grossFee: roundCurrency(grossFee),
    netValue: roundCurrency(netValue),
    profit: roundCurrency(profit),
    margin,
    breakEvenPrice: roundCurrency(breakEvenPrice),
    idealPrice: roundCurrency(idealPrice)
  };
};

export const feePercentToRate = (feePercent: number): number => {
  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent >= 100) {
    throw new Error("feePercent must be greater than or equal to 0 and less than 100.");
  }

  return feePercent / 100;
};

export const calculateProductFinancials = ({
  salePrice,
  unitCost,
  desiredProfit = 0,
  feePercent = GAMEMARKET_FEE_PERCENT
}: ProductFinancialInput): ProductFinancialSummary => {
  const summary = calculateFinancials({
    salePrice,
    unitCost,
    desiredProfit,
    feeRate: feePercentToRate(feePercent)
  });

  return {
    salePrice: summary.salePrice,
    unitCost: summary.unitCost,
    feePercent,
    netValue: summary.netValue,
    estimatedProfit: summary.profit,
    marginPercent: summary.margin,
    minimumPrice: summary.breakEvenPrice,
    idealPrice: summary.idealPrice
  };
};

export const formatCurrencyBRL = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);

export const formatPercent = (value: number): string =>
  new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value);
