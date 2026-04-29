import { calculateProductFinancials, GAMEMARKET_FEE_PERCENT } from "@hzdk/shared";
import { randomUUID } from "node:crypto";
import { buildCsv } from "../../shared/csv";
import type {
  CsvExportResult,
  ProductCreateInput,
  ProductListInput,
  ProductListResult,
  ProductRecord,
  ProductSummary,
  ProductUpdateData
} from "../../shared/contracts";
import { productRepository, type ProductWriteRecord } from "../repositories/product-repository";
import { centsToMoney, moneyToCents } from "./money";

const nowIso = (): string => new Date().toISOString();

const makeBusinessCode = (prefix: string, name: string): string => {
  const normalizedName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 22)
    .toUpperCase();
  const suffix = randomUUID().slice(0, 6).toUpperCase();
  return `${prefix}-${normalizedName || "ITEM"}-${suffix}`;
};

const normalizeInternalCode = (input: string | null | undefined, name: string): string =>
  input?.trim() ? input.trim().toUpperCase() : makeBusinessCode("PRD", name);

const makeWriteRecord = (
  input: {
    id: string;
    internalCode: string;
    name: string;
    category: string;
    game: string | null;
    platform: string | null;
    listingUrl: string | null;
    salePrice: number;
    unitCost: number;
    feePercent: number;
    stockCurrent: number;
    stockMin: number;
    status: ProductRecord["status"];
    deliveryType: ProductRecord["deliveryType"];
    supplierId: string | null;
    notes: string | null;
    createdByUserId: string | null;
    updatedByUserId: string | null;
    createdAt: string;
    updatedAt: string;
  }
): ProductWriteRecord => {
  const financials = calculateProductFinancials({
    salePrice: input.salePrice,
    unitCost: input.unitCost,
    feePercent: input.feePercent
  });

  return {
    id: input.id,
    internalCode: input.internalCode,
    name: input.name,
    category: input.category,
    game: input.game,
    platform: input.platform,
    listingUrl: input.listingUrl,
    salePriceCents: moneyToCents(input.salePrice),
    unitCostCents: moneyToCents(input.unitCost),
    feePercent: input.feePercent,
    netValueCents: moneyToCents(financials.netValue),
    estimatedProfitCents: moneyToCents(financials.estimatedProfit),
    marginPercent: financials.marginPercent,
    stockCurrent: input.stockCurrent,
    stockMin: input.stockMin,
    status: input.status,
    deliveryType: input.deliveryType,
    supplierId: input.supplierId,
    notes: input.notes,
    createdByUserId: input.createdByUserId,
    updatedByUserId: input.updatedByUserId,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
};

const mapSummary = (summary: ReturnType<typeof productRepository.getSummary>): ProductSummary => ({
  total: summary.total ?? 0,
  active: summary.active ?? 0,
  outOfStock: summary.out_of_stock ?? 0,
  lowStock: summary.low_stock ?? 0,
  averageEstimatedProfit: centsToMoney(summary.average_estimated_profit_cents)
});

export const productService = {
  list(filters: ProductListInput): ProductListResult {
    return {
      items: productRepository.list(filters),
      summary: mapSummary(productRepository.getSummary()),
      categories: productRepository.listCategories()
    };
  },

  get(id: string): ProductRecord {
    const product = productRepository.getById(id);
    if (!product) {
      throw new Error("Produto não encontrado.");
    }

    return product;
  },

  create(input: ProductCreateInput, actorUserId: string | null = null): ProductRecord {
    const timestamp = nowIso();
    const category = input.category ?? input.game ?? "Geral";
    const internalCode = normalizeInternalCode(input.internalCode, input.name);

    if (productRepository.getByInternalCode(internalCode)) {
      throw new Error("Já existe um produto com este ID interno.");
    }

    return productRepository.insert(
      makeWriteRecord({
        id: randomUUID(),
        internalCode,
        name: input.name,
        category,
        game: input.game ?? null,
        platform: input.platform ?? null,
        listingUrl: input.listingUrl ?? null,
        salePrice: input.salePrice,
        unitCost: input.unitCost,
        feePercent: input.feePercent ?? GAMEMARKET_FEE_PERCENT,
        stockCurrent: input.stockCurrent,
        stockMin: input.stockMin,
        status: input.status,
        deliveryType: input.deliveryType,
        supplierId: input.supplierId ?? null,
        notes: input.notes ?? null,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        createdAt: timestamp,
        updatedAt: timestamp
      })
    );
  },

  update(id: string, data: ProductUpdateData, actorUserId: string | null = null): ProductRecord {
    const current = this.get(id);
    const internalCode = normalizeInternalCode(
      Object.hasOwn(data, "internalCode") ? data.internalCode : current.internalCode,
      data.name ?? current.name
    );
    const duplicate = productRepository.getByInternalCode(internalCode);

    if (duplicate && duplicate.id !== id) {
      throw new Error("Já existe outro produto com este ID interno.");
    }

    return productRepository.update(
      makeWriteRecord({
        id,
        internalCode,
        name: data.name ?? current.name,
        category: Object.hasOwn(data, "category") ? data.category ?? "Geral" : current.category,
        game: Object.hasOwn(data, "game") ? data.game ?? null : current.game,
        platform: Object.hasOwn(data, "platform") ? data.platform ?? null : current.platform,
        listingUrl: Object.hasOwn(data, "listingUrl") ? data.listingUrl ?? null : current.listingUrl,
        salePrice: data.salePrice ?? current.salePrice,
        unitCost: data.unitCost ?? current.unitCost,
        feePercent: data.feePercent ?? current.feePercent,
        stockCurrent: data.stockCurrent ?? current.stockCurrent,
        stockMin: data.stockMin ?? current.stockMin,
        status: data.status ?? current.status,
        deliveryType: data.deliveryType ?? current.deliveryType,
        supplierId: Object.hasOwn(data, "supplierId") ? data.supplierId ?? null : current.supplierId,
        notes: Object.hasOwn(data, "notes") ? data.notes ?? null : current.notes,
        createdByUserId: current.createdByUserId,
        updatedByUserId: actorUserId ?? current.updatedByUserId,
        createdAt: current.createdAt,
        updatedAt: nowIso()
      })
    );
  },

  delete(id: string): void {
    if (!productRepository.delete(id)) {
      throw new Error("Produto não encontrado.");
    }
  },

  exportCsv(filters: ProductListInput): CsvExportResult {
    const rows = productRepository.list(filters);
    const content = buildCsv(rows, [
      { header: "ID", value: (row) => row.id },
      { header: "ID interno", value: (row) => row.internalCode },
      { header: "Nome", value: (row) => row.name },
      { header: "Categoria", value: (row) => row.category },
      { header: "Jogo", value: (row) => row.game },
      { header: "Plataforma", value: (row) => row.platform },
      { header: "Preço de venda", value: (row) => row.salePrice },
      { header: "Custo unitário", value: (row) => row.unitCost },
      { header: "Taxa %", value: (row) => row.feePercent },
      { header: "Valor líquido", value: (row) => row.netValue },
      { header: "Lucro estimado", value: (row) => row.estimatedProfit },
      { header: "Margem", value: (row) => row.marginPercent },
      { header: "Estoque atual", value: (row) => row.stockCurrent },
      { header: "Estoque mínimo", value: (row) => row.stockMin },
      { header: "Status", value: (row) => row.status },
      { header: "Tipo de entrega", value: (row) => row.deliveryType },
      { header: "Fornecedor", value: (row) => row.supplierId },
      { header: "Link do anúncio", value: (row) => row.listingUrl },
      { header: "Observações", value: (row) => row.notes },
      { header: "Criado em", value: (row) => row.createdAt },
      { header: "Atualizado em", value: (row) => row.updatedAt }
    ]);

    return {
      filename: "hzdk-products.csv",
      content
    };
  }
};
