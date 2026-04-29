import { randomUUID } from "node:crypto";
import { buildCsv } from "../../shared/csv";
import type {
  CsvExportResult,
  InventoryCreateInput,
  InventoryListInput,
  InventoryListResult,
  InventoryRecord,
  InventoryRevealSecretInput,
  InventorySecretField,
  InventorySummary,
  OperationalStockSummary,
  InventoryUpdateData
} from "../../shared/contracts";
import {
  inventoryRepository,
  type InventoryWriteRecord
} from "../repositories/inventory-repository";
import { productVariantRepository } from "../repositories/product-variant-repository";
import { productRepository } from "../repositories/product-repository";
import { decryptLocalSecret, encryptLocalSecret } from "../security/secrets";
import { eventService } from "./event-service";
import { centsToMoney, moneyToCents } from "./money";
import { summarizeOperationalStock } from "./stock-rules";

const nowIso = (): string => new Date().toISOString();

const makeBusinessCode = (): string => `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;

const normalizeInventoryCode = (input: string | null | undefined): string =>
  input?.trim() ? input.trim().toUpperCase() : makeBusinessCode();

const encryptNullable = (value: string | null | undefined): string | null =>
  value ? encryptLocalSecret(value) : null;

const maybeEncryptUpdate = (
  data: InventoryUpdateData,
  key: keyof Pick<
    InventoryUpdateData,
    "accountLogin" | "accountPassword" | "accountEmail" | "accountEmailPassword" | "accessNotes"
  >,
  currentValue: string | null
): string | null => {
  if (!Object.hasOwn(data, key)) {
    return currentValue;
  }

  const value = data[key];
  return value ? encryptLocalSecret(value) : null;
};

const assertProductExists = (productId: string | null): void => {
  if (productId && !productRepository.getById(productId)) {
    throw new Error("Produto vinculado não encontrado.");
  }
};

const assertVariantCompatible = (productId: string | null, productVariantId: string | null): void => {
  if (!productVariantId) {
    return;
  }

  const variant = productVariantRepository.getById(productVariantId);
  if (!variant || variant.status === "archived") {
    throw new Error("Variação vinculada não encontrada.");
  }

  if (!productId || variant.productId !== productId) {
    throw new Error("Variação não pertence ao produto vinculado.");
  }
};

const mapSummary = (summary: ReturnType<typeof inventoryRepository.getSummary>): InventorySummary => ({
  available: summary.available ?? 0,
  sold: summary.sold ?? 0,
  problem: summary.problem ?? 0,
  totalCost: centsToMoney(summary.total_cost_cents),
  potentialProfit: centsToMoney(summary.potential_profit_cents)
});

const defaultOperationalFilters: InventoryListInput = {
  search: null,
  productId: null,
  category: null,
  status: "all",
  supplierId: null,
  sortDirection: "asc"
};

const roundOperationalSummary = (summary: OperationalStockSummary): OperationalStockSummary => ({
  ...summary,
  totalCost: Math.round((summary.totalCost + Number.EPSILON) * 100) / 100,
  potentialProfit: Math.round((summary.potentialProfit + Number.EPSILON) * 100) / 100
});

type SecretColumn =
  | "account_login_encrypted"
  | "account_password_encrypted"
  | "account_email_encrypted"
  | "account_email_password_encrypted"
  | "access_notes_encrypted";

const secretColumnByField: Record<InventorySecretField, SecretColumn> = {
  accountLogin: "account_login_encrypted",
  accountPassword: "account_password_encrypted",
  accountEmail: "account_email_encrypted",
  accountEmailPassword: "account_email_password_encrypted",
  accessNotes: "access_notes_encrypted"
};

export const inventoryService = {
  list(filters: InventoryListInput): InventoryListResult {
    const protectedSummary = mapSummary(inventoryRepository.getSummary());
    const operationalItems = inventoryRepository.listOperational(filters);
    const allOperationalItems = inventoryRepository.listOperational(defaultOperationalFilters);
    const operationalSummary = roundOperationalSummary(
      summarizeOperationalStock(allOperationalItems, inventoryRepository.countSoldOperationalOrders())
    );

    return {
      items: inventoryRepository.list(filters),
      summary: protectedSummary,
      protectedSummary,
      operationalItems,
      operationalSummary,
      products: productRepository.listAllForSelect(),
      productVariants: productVariantRepository.listAllForSelect(),
      suppliers: inventoryRepository.listSuppliers(),
      categories: productRepository.listCategories()
    };
  },

  get(id: string): InventoryRecord {
    const item = inventoryRepository.getById(id);
    if (!item) {
      throw new Error("Item de estoque não encontrado.");
    }

    return item;
  },

  create(input: InventoryCreateInput, actorUserId: string | null = null): InventoryRecord {
    const timestamp = nowIso();
    const productId = input.productId ?? null;
    const productVariantId = input.productVariantId ?? null;
    assertProductExists(productId);
    assertVariantCompatible(productId, productVariantId);

    return inventoryRepository.insert({
      id: randomUUID(),
      inventoryCode: normalizeInventoryCode(input.inventoryCode),
      productId,
      productVariantId,
      supplierId: input.supplierId ?? null,
      purchaseCostCents: moneyToCents(input.purchaseCost),
      status: input.status,
      accountLoginEncrypted: encryptNullable(input.accountLogin),
      accountPasswordEncrypted: encryptNullable(input.accountPassword),
      accountEmailEncrypted: encryptNullable(input.accountEmail),
      accountEmailPasswordEncrypted: encryptNullable(input.accountEmailPassword),
      accessNotesEncrypted: encryptNullable(input.accessNotes),
      publicNotes: input.publicNotes ?? null,
      boughtAt: input.boughtAt ?? timestamp,
      soldAt: input.soldAt ?? null,
      deliveredAt: input.deliveredAt ?? null,
      orderId: input.orderId ?? null,
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  },

  update(id: string, data: InventoryUpdateData, actorUserId: string | null = null): InventoryRecord {
    const current = inventoryRepository.getEncryptedById(id);
    if (!current) {
      throw new Error("Item de estoque não encontrado.");
    }

    const productId = Object.hasOwn(data, "productId") ? data.productId ?? null : current.product_id;
    const productVariantId = Object.hasOwn(data, "productVariantId")
      ? data.productVariantId ?? null
      : current.product_variant_id;
    assertProductExists(productId);
    assertVariantCompatible(productId, productVariantId);

    const status = data.status ?? current.status;
    const soldAt =
      Object.hasOwn(data, "soldAt") || status !== "sold"
        ? data.soldAt ?? current.sold_at
        : current.sold_at ?? nowIso();
    const deliveredAt =
      Object.hasOwn(data, "deliveredAt") || status !== "delivered"
        ? data.deliveredAt ?? current.delivered_at
        : current.delivered_at ?? nowIso();

    const writeRecord: InventoryWriteRecord = {
      id,
      inventoryCode: normalizeInventoryCode(
        Object.hasOwn(data, "inventoryCode") ? data.inventoryCode : current.inventory_code
      ),
      productId,
      productVariantId,
      supplierId: Object.hasOwn(data, "supplierId") ? data.supplierId ?? null : current.supplier_id,
      purchaseCostCents:
        data.purchaseCost === undefined ? current.purchase_cost_cents : moneyToCents(data.purchaseCost),
      status,
      accountLoginEncrypted: maybeEncryptUpdate(data, "accountLogin", current.account_login_encrypted),
      accountPasswordEncrypted: maybeEncryptUpdate(
        data,
        "accountPassword",
        current.account_password_encrypted
      ),
      accountEmailEncrypted: maybeEncryptUpdate(data, "accountEmail", current.account_email_encrypted),
      accountEmailPasswordEncrypted: maybeEncryptUpdate(
        data,
        "accountEmailPassword",
        current.account_email_password_encrypted
      ),
      accessNotesEncrypted: maybeEncryptUpdate(data, "accessNotes", current.access_notes_encrypted),
      publicNotes: Object.hasOwn(data, "publicNotes") ? data.publicNotes ?? null : current.public_notes,
      boughtAt: Object.hasOwn(data, "boughtAt") ? data.boughtAt ?? null : current.bought_at,
      soldAt,
      deliveredAt,
      orderId: Object.hasOwn(data, "orderId") ? data.orderId ?? null : current.order_id,
      createdByUserId: current.created_by_user_id,
      updatedByUserId: actorUserId ?? current.updated_by_user_id,
      createdAt: current.created_at,
      updatedAt: nowIso()
    };

    return inventoryRepository.update(writeRecord);
  },

  delete(id: string): void {
    if (!inventoryRepository.delete(id)) {
      throw new Error("Item de estoque não encontrado.");
    }
  },

  revealSecret(
    input: InventoryRevealSecretInput,
    actorUserId: string | null
  ): { field: InventorySecretField; value: string } {
    const current = inventoryRepository.getEncryptedById(input.id);
    if (!current) {
      throw new Error("Item de estoque não encontrado.");
    }

    const encryptedValue = current[secretColumnByField[input.field]];

    const value = encryptedValue ? decryptLocalSecret(encryptedValue) : "";

    eventService.createInternal({
      type: "security.secret_revealed",
      severity: "warning",
      title: "Dado sensível revelado",
      message: `Campo protegido de estoque foi revelado para o item ${current.inventory_code}.`,
      inventoryItemId: current.id,
      actorUserId,
      rawPayload: {
        actorUserId,
        field: input.field,
        inventoryItemId: current.id,
        revealedAt: nowIso()
      }
    });

    return {
      field: input.field,
      value
    };
  },

  exportCsv(filters: InventoryListInput): CsvExportResult {
    const rows = inventoryRepository.list(filters);
    const content = buildCsv(rows, [
      { header: "ID", value: (row) => row.id },
      { header: "ID interno", value: (row) => row.inventoryCode },
      { header: "Produto ID", value: (row) => row.productId },
      { header: "Variação ID", value: (row) => row.productVariantId },
      { header: "Variação", value: (row) => row.productVariantName },
      { header: "Produto", value: (row) => row.productName },
      { header: "Produto interno", value: (row) => row.productInternalCode },
      { header: "Categoria", value: (row) => row.category },
      { header: "Jogo", value: (row) => row.game },
      { header: "Fornecedor", value: (row) => row.supplierId },
      { header: "Custo de compra", value: (row) => row.purchaseCost },
      { header: "Lucro potencial", value: (row) => row.potentialProfit },
      { header: "Status", value: (row) => row.status },
      { header: "Tem login", value: (row) => row.hasAccountLogin },
      { header: "Tem senha", value: (row) => row.hasAccountPassword },
      { header: "Tem email", value: (row) => row.hasAccountEmail },
      { header: "Tem senha email", value: (row) => row.hasAccountEmailPassword },
      { header: "Tem notas protegidas", value: (row) => row.hasAccessNotes },
      { header: "Observações públicas", value: (row) => row.publicNotes },
      { header: "Compra", value: (row) => row.boughtAt },
      { header: "Venda", value: (row) => row.soldAt },
      { header: "Entrega", value: (row) => row.deliveredAt },
      { header: "Pedido", value: (row) => row.orderId },
      { header: "Criado em", value: (row) => row.createdAt },
      { header: "Atualizado em", value: (row) => row.updatedAt }
    ]);

    return {
      filename: "hzdk-inventory.csv",
      content
    };
  }
};
