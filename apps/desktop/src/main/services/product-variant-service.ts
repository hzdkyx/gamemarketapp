import { calculateProductFinancials, GAMEMARKET_FEE_PERCENT } from "@hzdk/shared";
import { randomUUID } from "node:crypto";
import { buildCsv } from "../../shared/csv";
import type {
  CsvExportResult,
  ProductVariantCreateInput,
  ProductVariantListResult,
  ProductVariantRecord,
  ProductVariantSource,
  ProductVariantUpdateData
} from "../../shared/contracts";
import {
  productVariantRepository,
  type ProductVariantWriteRecord
} from "../repositories/product-variant-repository";
import { productRepository } from "../repositories/product-repository";
import { auditHistoryService, type AuditFieldDefinition } from "./audit-history-service";
import { moneyToCents } from "./money";

const nowIso = (): string => new Date().toISOString();

const normalizeVariantCode = (input: string | null | undefined, name: string): string => {
  if (input?.trim()) {
    return input.trim().toUpperCase();
  }

  const normalizedName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 26)
    .toUpperCase();

  return `VAR-${normalizedName || "ITEM"}-${randomUUID().slice(0, 6).toUpperCase()}`;
};

const makeWriteRecord = (
  input: {
    id: string;
    productId: string;
    variantCode: string;
    name: string;
    description: string | null;
    salePrice: number;
    unitCost: number;
    feePercent: number;
    stockCurrent: number;
    stockMin: number;
    supplierName: string | null;
    supplierUrl: string | null;
    deliveryType: ProductVariantRecord["deliveryType"];
    status: ProductVariantRecord["status"];
    notes: string | null;
    source: ProductVariantSource;
    needsReview: boolean;
    manuallyEditedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }
): ProductVariantWriteRecord => {
  const financials = calculateProductFinancials({
    salePrice: input.salePrice,
    unitCost: input.unitCost,
    feePercent: input.feePercent
  });

  return {
    id: input.id,
    productId: input.productId,
    variantCode: input.variantCode,
    name: input.name,
    description: input.description,
    salePriceCents: moneyToCents(input.salePrice),
    unitCostCents: moneyToCents(input.unitCost),
    feePercent: input.feePercent,
    netValueCents: moneyToCents(financials.netValue),
    estimatedProfitCents: moneyToCents(financials.estimatedProfit),
    marginPercent: financials.marginPercent,
    stockCurrent: input.stockCurrent,
    stockMin: input.stockMin,
    supplierName: input.supplierName,
    supplierUrl: input.supplierUrl,
    deliveryType: input.deliveryType,
    status: input.status,
    notes: input.notes,
    source: input.source,
    needsReview: input.needsReview,
    manuallyEditedAt: input.manuallyEditedAt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt
  };
};

const assertProductExists = (productId: string): void => {
  if (!productRepository.getById(productId)) {
    throw new Error("Produto vinculado não encontrado.");
  }
};

const assertUniqueCode = (variantCode: string, currentId: string | null): void => {
  const duplicate = productVariantRepository.getByVariantCode(variantCode);
  if (duplicate && duplicate.id !== currentId) {
    throw new Error("Já existe uma variação com este código.");
  }
};

const makeDuplicateCode = (variantCode: string): string => {
  for (let index = 1; index <= 99; index += 1) {
    const suffix = index === 1 ? "COPY" : `COPY-${index}`;
    const candidate = normalizeVariantCode(`${variantCode}-${suffix}`, variantCode);
    if (!productVariantRepository.getByVariantCode(candidate)) {
      return candidate;
    }
  }

  return normalizeVariantCode(`${variantCode}-COPY-${randomUUID().slice(0, 6)}`, variantCode);
};

const variantAuditFields: Array<AuditFieldDefinition<ProductVariantRecord>> = [
  { field: "title", label: "Nome da variação", read: (variant) => variant.name },
  { field: "sku", label: "Código/SKU", read: (variant) => variant.variantCode },
  { field: "description", label: "Descrição", read: (variant) => variant.description },
  { field: "salePrice", label: "Preço de venda", read: (variant) => variant.salePrice },
  { field: "unitCost", label: "Custo unitário", read: (variant) => variant.unitCost },
  { field: "marketplaceFeePercent", label: "Taxa GameMarket %", read: (variant) => variant.feePercent },
  { field: "currentStock", label: "Estoque atual", read: (variant) => variant.stockCurrent },
  { field: "minimumStock", label: "Estoque mínimo", read: (variant) => variant.stockMin },
  { field: "supplier", label: "Fornecedor", read: (variant) => variant.supplierName },
  { field: "supplierUrl", label: "URL do fornecedor", read: (variant) => variant.supplierUrl },
  { field: "status", label: "Status", read: (variant) => variant.status },
  { field: "deliveryType", label: "Tipo de entrega", read: (variant) => variant.deliveryType },
  { field: "needsReview", label: "Precisa revisar", read: (variant) => variant.needsReview },
  { field: "notes", label: "Observações", read: (variant) => variant.notes }
];

export const productVariantService = {
  listByProduct(productId: string): ProductVariantListResult {
    assertProductExists(productId);
    return {
      items: productVariantRepository.listByProductId(productId)
    };
  },

  get(id: string): ProductVariantRecord {
    const variant = productVariantRepository.getById(id);
    if (!variant) {
      throw new Error("Variação não encontrada.");
    }

    return variant;
  },

  create(input: ProductVariantCreateInput, actorUserId: string | null = null): ProductVariantRecord {
    assertProductExists(input.productId);
    const timestamp = nowIso();
    const variantCode = normalizeVariantCode(input.variantCode, input.name);
    assertUniqueCode(variantCode, null);

    const created = productVariantRepository.insert(
      makeWriteRecord({
        id: randomUUID(),
        productId: input.productId,
        variantCode,
        name: input.name,
        description: input.description ?? null,
        salePrice: input.salePrice,
        unitCost: input.unitCost,
        feePercent: input.feePercent ?? GAMEMARKET_FEE_PERCENT,
        stockCurrent: input.stockCurrent,
        stockMin: input.stockMin,
        supplierName: input.supplierName ?? null,
        supplierUrl: input.supplierUrl ?? null,
        deliveryType: input.deliveryType,
        status: input.status,
        notes: input.notes ?? null,
        source: input.source,
        needsReview: input.needsReview,
        manuallyEditedAt: input.source === "manual" ? timestamp : null,
        createdAt: timestamp,
        updatedAt: timestamp
      })
    );

    auditHistoryService.record({
      entityType: "variant",
      entityId: created.id,
      source: created.source === "gamemarket_sync" ? "gamemarket_api" : "manual",
      action: "created",
      title: "Variação criada",
      message: `Variação ${created.name} criada para o produto vinculado.`,
      actorUserId,
      relatedProductId: created.productId,
      relatedVariantId: created.id,
      createdAt: timestamp,
      changes: auditHistoryService.buildChanges(null, created, variantAuditFields)
    });

    return created;
  },

  update(id: string, data: ProductVariantUpdateData, actorUserId: string | null = null): ProductVariantRecord {
    const current = this.get(id);
    const name = data.name ?? current.name;
    const variantCode = normalizeVariantCode(
      Object.hasOwn(data, "variantCode") ? data.variantCode : current.variantCode,
      name
    );
    assertUniqueCode(variantCode, id);

    const updated = productVariantRepository.update(
      makeWriteRecord({
        id,
        productId: current.productId,
        variantCode,
        name,
        description: Object.hasOwn(data, "description") ? data.description ?? null : current.description,
        salePrice: data.salePrice ?? current.salePrice,
        unitCost: data.unitCost ?? current.unitCost,
        feePercent: data.feePercent ?? current.feePercent,
        stockCurrent: data.stockCurrent ?? current.stockCurrent,
        stockMin: data.stockMin ?? current.stockMin,
        supplierName: Object.hasOwn(data, "supplierName") ? data.supplierName ?? null : current.supplierName,
        supplierUrl: Object.hasOwn(data, "supplierUrl") ? data.supplierUrl ?? null : current.supplierUrl,
        deliveryType: data.deliveryType ?? current.deliveryType,
        status: data.status ?? current.status,
        notes: Object.hasOwn(data, "notes") ? data.notes ?? null : current.notes,
        source: data.source ?? current.source,
        needsReview: data.needsReview ?? current.needsReview,
        manuallyEditedAt: nowIso(),
        createdAt: current.createdAt,
        updatedAt: nowIso()
      })
    );

    auditHistoryService.record({
      entityType: "variant",
      entityId: id,
      source: "manual",
      action: "updated",
      title: "Variação atualizada",
      message: `Variação ${updated.name} teve dados operacionais alterados.`,
      actorUserId,
      relatedProductId: updated.productId,
      relatedVariantId: updated.id,
      createdAt: updated.updatedAt,
      changes: auditHistoryService.buildChanges(current, updated, variantAuditFields)
    });

    return updated;
  },

  duplicate(id: string, actorUserId: string | null = null): ProductVariantRecord {
    const current = this.get(id);
    const timestamp = nowIso();
    const variantCode = makeDuplicateCode(current.variantCode);

    const duplicated = productVariantRepository.insert(
      makeWriteRecord({
        id: randomUUID(),
        productId: current.productId,
        variantCode,
        name: `${current.name} cópia`,
        description: current.description,
        salePrice: current.salePrice,
        unitCost: current.unitCost,
        feePercent: current.feePercent,
        stockCurrent: current.stockCurrent,
        stockMin: current.stockMin,
        supplierName: current.supplierName,
        supplierUrl: current.supplierUrl,
        deliveryType: current.deliveryType,
        status: current.status,
        notes: current.notes,
        source: "manual",
        needsReview: true,
        manuallyEditedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      })
    );

    auditHistoryService.record({
      entityType: "variant",
      entityId: duplicated.id,
      source: "manual",
      action: "created",
      title: "Variação duplicada",
      message: `Variação ${duplicated.name} criada a partir de ${current.name}.`,
      actorUserId,
      relatedProductId: duplicated.productId,
      relatedVariantId: duplicated.id,
      createdAt: timestamp,
      changes: auditHistoryService.buildChanges(null, duplicated, variantAuditFields)
    });

    return duplicated;
  },

  archive(id: string, actorUserId: string | null = null): ProductVariantRecord {
    return this.update(id, {
      status: "archived"
    }, actorUserId);
  },

  markNeedsReview(id: string, actorUserId: string | null = null): ProductVariantRecord {
    return this.update(id, {
      needsReview: true
    }, actorUserId);
  },

  delete(id: string): void {
    if (!productVariantRepository.delete(id)) {
      throw new Error("Variação não encontrada.");
    }
  },

  exportCsv(productId: string): CsvExportResult {
    const rows = productVariantRepository.listByProductId(productId);
    const content = buildCsv(rows, [
      { header: "ID", value: (row) => row.id },
      { header: "Produto ID", value: (row) => row.productId },
      { header: "Código", value: (row) => row.variantCode },
      { header: "Nome", value: (row) => row.name },
      { header: "Descrição", value: (row) => row.description },
      { header: "Preço de venda", value: (row) => row.salePrice },
      { header: "Custo unitário", value: (row) => row.unitCost },
      { header: "Taxa %", value: (row) => row.feePercent },
      { header: "Valor líquido", value: (row) => row.netValue },
      { header: "Lucro estimado", value: (row) => row.estimatedProfit },
      { header: "Margem", value: (row) => row.marginPercent },
      { header: "Preço mínimo", value: (row) => row.minimumPrice },
      { header: "Estoque atual", value: (row) => row.stockCurrent },
      { header: "Estoque mínimo", value: (row) => row.stockMin },
      { header: "Entrega", value: (row) => row.deliveryType },
      { header: "Fornecedor", value: (row) => row.supplierName },
      { header: "Link fornecedor", value: (row) => row.supplierUrl },
      { header: "Status", value: (row) => row.status },
      { header: "Revisão", value: (row) => row.needsReview },
      { header: "Origem", value: (row) => row.source },
      { header: "Observações", value: (row) => row.notes },
      { header: "Criado em", value: (row) => row.createdAt },
      { header: "Atualizado em", value: (row) => row.updatedAt }
    ]);

    return {
      filename: "hzdk-product-variants.csv",
      content
    };
  }
};
