import { calculateProductFinancials } from "@hzdk/shared";
import { buildCsv } from "./csv";
import type {
  DeliveryType,
  ProfitAnalysisRow,
  ProfitAnalysisScope,
  ProfitAnalysisStatus,
  ProfitFilters,
  ProfitHighlight,
  ProfitListInput,
  ProfitListResult,
  ProfitProductGroup,
  ProfitSummary,
} from "./contracts";
import {
  deliveryTypeValues,
  profitDeliveryTypeFilterValues,
  profitMarginFilterValues,
  profitReviewFilterValues,
  profitStatusFilterValues,
} from "./contracts";

export interface ProfitAnalysisSource {
  id: string;
  scope: ProfitAnalysisScope;
  productId: string;
  productInternalCode: string;
  productName: string;
  productCategory: string;
  game: string | null;
  productVariantId: string | null;
  variantCode: string | null;
  variantName: string | null;
  salePrice: number;
  unitCost: number;
  feePercent: number;
  stockCurrent: number;
  stockMin: number;
  deliveryType: DeliveryType;
  supplierName: string | null;
  status: ProfitAnalysisStatus;
  needsReview: boolean;
}

const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const tracksRealStock = (deliveryType: DeliveryType): boolean =>
  deliveryType === "manual" || deliveryType === "automatic";

export const hasPendingUnitCost = (input: {
  unitCost: number;
  deliveryType: DeliveryType;
}): boolean => input.unitCost === 0 && input.deliveryType !== "service";

const getStockUnitsForPotential = (input: {
  deliveryType: DeliveryType;
  stockCurrent: number;
  status: ProfitAnalysisStatus;
}): number => {
  if (input.status === "archived" || !tracksRealStock(input.deliveryType)) {
    return 0;
  }

  return Math.max(0, input.stockCurrent);
};

const makeHighlight = (row: ProfitAnalysisRow): ProfitHighlight => ({
  rowId: row.id,
  label: row.variantCode ?? row.productInternalCode,
  productName: row.productName,
  variantName: row.variantName,
  value: row.profit,
  marginPercent: row.marginPercent,
});

export const makeProfitAnalysisRow = (
  input: ProfitAnalysisSource,
): ProfitAnalysisRow => {
  const financials = calculateProductFinancials({
    salePrice: input.salePrice,
    unitCost: input.unitCost,
    feePercent: input.feePercent,
  });
  const stockUnitsForPotential = getStockUnitsForPotential(input);
  const pendingCost = hasPendingUnitCost(input);
  const marginOnNet =
    financials.netValue === 0
      ? 0
      : financials.estimatedProfit / financials.netValue;

  return {
    id: `${input.scope}:${input.id}`,
    scope: input.scope,
    productId: input.productId,
    productInternalCode: input.productInternalCode,
    productName: input.productName,
    productCategory: input.productCategory,
    game: input.game,
    productVariantId: input.productVariantId,
    variantCode: input.variantCode,
    variantName: input.variantName,
    salePrice: financials.salePrice,
    feePercent: financials.feePercent,
    netValue: financials.netValue,
    unitCost: financials.unitCost,
    profit: financials.estimatedProfit,
    estimatedProfit: financials.estimatedProfit,
    marginPercent: financials.marginPercent,
    marginOnNet,
    breakEvenPrice: financials.minimumPrice,
    minimumPrice: financials.minimumPrice,
    stockCurrent: input.stockCurrent,
    stockMin: input.stockMin,
    deliveryType: input.deliveryType,
    supplierName: input.supplierName,
    status: input.status,
    needsReview: input.needsReview,
    pendingCost,
    stockUnitsForPotential,
    grossPotential: roundCurrency(
      financials.salePrice * stockUnitsForPotential,
    ),
    netPotential: roundCurrency(financials.netValue * stockUnitsForPotential),
    costInStock: roundCurrency(financials.unitCost * stockUnitsForPotential),
    potentialProfit: roundCurrency(
      financials.estimatedProfit * stockUnitsForPotential,
    ),
  };
};

const matchesMarginFilter = (
  row: ProfitAnalysisRow,
  margin: ProfitListInput["margin"],
): boolean => {
  switch (margin) {
    case "negative_profit":
      return row.profit < 0;
    case "low_margin":
      return row.profit >= 0 && row.marginPercent < 0.2;
    case "medium_margin":
      return row.marginPercent >= 0.2 && row.marginPercent < 0.4;
    case "high_margin":
      return row.marginPercent >= 0.4;
    case "all":
    default:
      return true;
  }
};

const normalizeText = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

const normalizeFilterValue = <T extends string>(
  value: string | null | undefined,
  values: readonly T[],
  fallback: T,
): T => (values.includes(value as T) ? (value as T) : fallback);

export const filterProfitRows = (
  rows: ProfitAnalysisRow[],
  filters: ProfitListInput,
): ProfitAnalysisRow[] => {
  const search = normalizeText(filters.search);
  const deliveryType = normalizeFilterValue(
    filters.deliveryType,
    profitDeliveryTypeFilterValues,
    "all",
  );
  const status = normalizeFilterValue(
    filters.status,
    profitStatusFilterValues,
    "all",
  );
  const review = normalizeFilterValue(
    filters.review,
    profitReviewFilterValues,
    "all",
  );
  const margin = normalizeFilterValue(
    filters.margin,
    profitMarginFilterValues,
    "all",
  );

  return rows.filter((row) => {
    if (search) {
      const haystack = [
        row.productName,
        row.productInternalCode,
        row.productCategory,
        row.game,
        row.variantCode,
        row.variantName,
        row.supplierName,
        row.status,
        row.deliveryType,
      ]
        .map(normalizeText)
        .join(" ");

      if (!haystack.includes(search)) {
        return false;
      }
    }

    if (
      filters.category &&
      row.productCategory !== filters.category &&
      row.game !== filters.category
    ) {
      return false;
    }

    if (deliveryType !== "all" && row.deliveryType !== deliveryType) {
      return false;
    }

    if (status !== "all" && row.status !== status) {
      return false;
    }

    if (review === "needs_review" && !row.needsReview) {
      return false;
    }

    if (review === "ok" && row.needsReview) {
      return false;
    }

    return matchesMarginFilter(row, margin);
  });
};

export const sortProfitRows = (
  rows: ProfitAnalysisRow[],
  sortBy: ProfitListInput["sortBy"],
): ProfitAnalysisRow[] => {
  const sorted = [...rows];
  const byName = (row: ProfitAnalysisRow): string =>
    `${normalizeText(row.productName)} ${normalizeText(row.variantName ?? "produto pai")}`;

  sorted.sort((left, right) => {
    switch (sortBy) {
      case "profit_asc":
        return left.profit - right.profit;
      case "margin_desc":
        return right.marginPercent - left.marginPercent;
      case "margin_asc":
        return left.marginPercent - right.marginPercent;
      case "sale_desc":
        return right.salePrice - left.salePrice;
      case "cost_desc":
        return right.unitCost - left.unitCost;
      case "stock_desc":
        return right.stockCurrent - left.stockCurrent;
      case "name_asc":
        return byName(left).localeCompare(byName(right), "pt-BR");
      case "profit_desc":
      default:
        return right.profit - left.profit;
    }
  });

  return sorted;
};

export const summarizeProfitRows = (
  rows: ProfitAnalysisRow[],
): ProfitSummary => {
  const activeRows = rows.filter((row) => row.status === "active");
  const marginRows = rows.filter(
    (row) => row.status !== "archived" && row.salePrice > 0,
  );
  const highestMargin = marginRows.reduce<ProfitAnalysisRow | null>(
    (best, row) =>
      !best || row.marginPercent > best.marginPercent ? row : best,
    null,
  );
  const lowestMargin = marginRows.reduce<ProfitAnalysisRow | null>(
    (worst, row) =>
      !worst || row.marginPercent < worst.marginPercent ? row : worst,
    null,
  );

  return {
    potentialProfitTotal: roundCurrency(
      rows.reduce((total, row) => total + row.potentialProfit, 0),
    ),
    averageProfitPerSale: roundCurrency(
      activeRows.length === 0
        ? 0
        : activeRows.reduce((total, row) => total + row.profit, 0) /
            activeRows.length,
    ),
    highestMargin: highestMargin ? makeHighlight(highestMargin) : null,
    lowestMargin: lowestMargin ? makeHighlight(lowestMargin) : null,
    stockCostTotal: roundCurrency(
      rows.reduce((total, row) => total + row.costInStock, 0),
    ),
    grossPotential: roundCurrency(
      rows.reduce((total, row) => total + row.grossPotential, 0),
    ),
    netPotential: roundCurrency(
      rows.reduce((total, row) => total + row.netPotential, 0),
    ),
    pendingCostCount: rows.filter(
      (row) => row.status !== "archived" && row.pendingCost,
    ).length,
    needsReviewCount: rows.filter(
      (row) => row.status !== "archived" && row.needsReview,
    ).length,
    analyzedRows: rows.length,
    variantRows: rows.filter((row) => row.scope === "variant").length,
    parentOnlyRows: rows.filter((row) => row.scope === "product").length,
  };
};

export const summarizeProfitByProduct = (
  rows: ProfitAnalysisRow[],
): ProfitProductGroup[] => {
  const groups = new Map<string, ProfitAnalysisRow[]>();

  for (const row of rows) {
    const current = groups.get(row.productId) ?? [];
    current.push(row);
    groups.set(row.productId, current);
  }

  return Array.from(groups.values())
    .map((items) => {
      const first = items[0]!;
      const highestMargin = items.reduce((best, row) =>
        row.marginPercent > best.marginPercent ? row : best,
      );

      return {
        productId: first.productId,
        productInternalCode: first.productInternalCode,
        productName: first.productName,
        category: first.productCategory,
        game: first.game,
        variationCount: items.filter((row) => row.scope === "variant").length,
        minimumProfit: roundCurrency(
          Math.min(...items.map((row) => row.profit)),
        ),
        averageProfit: roundCurrency(
          items.reduce((total, row) => total + row.profit, 0) / items.length,
        ),
        maximumProfit: roundCurrency(
          Math.max(...items.map((row) => row.profit)),
        ),
        averageCost: roundCurrency(
          items.reduce((total, row) => total + row.unitCost, 0) / items.length,
        ),
        highestMarginLabel: highestMargin.variantName ?? "Produto pai",
        highestMarginPercent: highestMargin.marginPercent,
        needsReviewCount: items.filter((row) => row.needsReview).length,
        pendingCostCount: items.filter((row) => row.pendingCost).length,
      };
    })
    .sort((left, right) => right.averageProfit - left.averageProfit);
};

export const analyzeProfitRows = (
  rows: ProfitAnalysisRow[],
  filters: ProfitListInput,
): {
  list: ProfitAnalysisRow[];
  summary: ProfitSummary;
  groups: ProfitProductGroup[];
} => {
  const filtered = filterProfitRows(rows, filters);
  const sorted = sortProfitRows(filtered, filters.sortBy ?? "profit_desc");

  return {
    list: sorted,
    summary: summarizeProfitRows(sorted),
    groups: summarizeProfitByProduct(sorted),
  };
};

export const buildProfitCsv = (rows: ProfitAnalysisRow[]): string =>
  buildCsv(rows, [
    { header: "Produto pai", value: (row) => row.productName },
    { header: "Código da variação", value: (row) => row.variantCode },
    {
      header: "Nome da variação",
      value: (row) => row.variantName ?? "Produto pai",
    },
    { header: "Venda", value: (row) => row.salePrice },
    { header: "Taxa", value: (row) => row.feePercent },
    { header: "Líquido", value: (row) => row.netValue },
    { header: "Custo", value: (row) => row.unitCost },
    { header: "Lucro", value: (row) => row.profit },
    { header: "Margem", value: (row) => row.marginPercent },
    { header: "Preço mínimo", value: (row) => row.breakEvenPrice },
    { header: "Estoque atual", value: (row) => row.stockCurrent },
    { header: "Estoque mínimo", value: (row) => row.stockMin },
    { header: "Tipo de entrega", value: (row) => row.deliveryType },
    { header: "Fornecedor", value: (row) => row.supplierName },
    { header: "Status", value: (row) => row.status },
    { header: "Revisão", value: (row) => (row.needsReview ? "sim" : "ok") },
  ]);

export const defaultProfitSummary: ProfitSummary = {
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
};

export const defaultProfitFilters: ProfitFilters = {
  categories: [],
  deliveryTypes: [],
  statuses: [],
  suppliers: [],
};

export const emptyProfitListResult: ProfitListResult = {
  summary: defaultProfitSummary,
  list: [],
  groups: [],
  filters: defaultProfitFilters,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeFiniteNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const normalizeHighlight = (value: unknown): ProfitHighlight | null => {
  if (!isRecord(value)) {
    return null;
  }

  const rowId = value.rowId;
  const label = value.label;
  const productName = value.productName;

  if (
    typeof rowId !== "string" ||
    typeof label !== "string" ||
    typeof productName !== "string"
  ) {
    return null;
  }

  return {
    rowId,
    label,
    productName,
    variantName:
      typeof value.variantName === "string" ? value.variantName : null,
    value: normalizeFiniteNumber(value.value),
    marginPercent: normalizeFiniteNumber(value.marginPercent),
  };
};

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

const normalizeDeliveryTypes = (value: unknown): DeliveryType[] => {
  const allowed = new Set<string>(deliveryTypeValues);
  return normalizeStringArray(value).filter((item): item is DeliveryType =>
    allowed.has(item),
  );
};

const normalizeStatuses = (value: unknown): ProfitAnalysisStatus[] => {
  const allowed = new Set<string>(
    profitStatusFilterValues.filter((status) => status !== "all"),
  );
  return normalizeStringArray(value).filter(
    (item): item is ProfitAnalysisStatus => allowed.has(item),
  );
};

export const normalizeProfitSummary = (value: unknown): ProfitSummary => {
  const input = isRecord(value) ? value : {};

  return {
    potentialProfitTotal: normalizeFiniteNumber(
      input.potentialProfitTotal ?? input.totalPotentialProfit,
    ),
    averageProfitPerSale: normalizeFiniteNumber(input.averageProfitPerSale),
    highestMargin: normalizeHighlight(input.highestMargin),
    lowestMargin: normalizeHighlight(input.lowestMargin),
    stockCostTotal: normalizeFiniteNumber(
      input.stockCostTotal ?? input.totalInventoryCost,
    ),
    grossPotential: normalizeFiniteNumber(
      input.grossPotential ?? input.potentialGrossRevenue,
    ),
    netPotential: normalizeFiniteNumber(
      input.netPotential ?? input.potentialNetValue,
    ),
    pendingCostCount: normalizeFiniteNumber(
      input.pendingCostCount ?? input.pendingCostItems,
    ),
    needsReviewCount: normalizeFiniteNumber(
      input.needsReviewCount ?? input.reviewItems,
    ),
    analyzedRows: normalizeFiniteNumber(input.analyzedRows ?? input.rows),
    variantRows: normalizeFiniteNumber(input.variantRows),
    parentOnlyRows: normalizeFiniteNumber(
      input.parentOnlyRows ?? input.parentProductRows,
    ),
  };
};

export const normalizeProfitFilters = (value: unknown): ProfitFilters => {
  const input = isRecord(value) ? value : {};

  return {
    categories: normalizeStringArray(input.categories),
    deliveryTypes: normalizeDeliveryTypes(input.deliveryTypes),
    statuses: normalizeStatuses(input.statuses),
    suppliers: normalizeStringArray(input.suppliers),
  };
};

export const normalizeProfitListResult = (value: unknown): ProfitListResult => {
  const input = isRecord(value) ? value : {};
  const legacyFilters = {
    categories: input.categories,
    suppliers: input.suppliers,
  };
  const filtersInput = isRecord(input.filters)
    ? { ...legacyFilters, ...input.filters }
    : legacyFilters;

  return {
    summary: normalizeProfitSummary(input.summary),
    list: Array.isArray(input.list)
      ? (input.list as ProfitAnalysisRow[])
      : Array.isArray(input.items)
        ? (input.items as ProfitAnalysisRow[])
        : [],
    groups: Array.isArray(input.groups)
      ? (input.groups as ProfitProductGroup[])
      : Array.isArray(input.productSummaries)
        ? (input.productSummaries as ProfitProductGroup[])
        : [],
    filters: normalizeProfitFilters(filtersInput),
  };
};
