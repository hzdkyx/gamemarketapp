import { calculateProductFinancials, GAMEMARKET_FEE_PERCENT } from "@hzdk/shared";
import { randomUUID } from "node:crypto";
import { buildCsv } from "../../shared/csv";
import type {
  CsvExportResult,
  EventType,
  InventoryRecord,
  OrderChangeStatusInput,
  OrderCreateInput,
  OrderDetailResult,
  OrderListInput,
  OrderListResult,
  OrderRecord,
  OrderStatus,
  OrderSummary,
  OrderUpdateData
} from "../../shared/contracts";
import { getSqliteDatabase } from "../database/database";
import { inventoryRepository } from "../repositories/inventory-repository";
import { orderRepository, type OrderWriteRecord } from "../repositories/order-repository";
import { productRepository } from "../repositories/product-repository";
import { eventService } from "./event-service";
import { inventoryService } from "./inventory-service";
import { moneyToCents } from "./money";

const nowIso = (): string => new Date().toISOString();

const makeOrderCode = (): string =>
  `ORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 6).toUpperCase()}`;

const normalizeOrderCode = (value: string | null | undefined): string =>
  value?.trim() ? value.trim().toUpperCase() : makeOrderCode();

const actionRequiredByStatus: Record<OrderStatus, boolean> = {
  draft: false,
  pending_payment: false,
  payment_confirmed: true,
  awaiting_delivery: true,
  delivered: false,
  completed: false,
  cancelled: false,
  refunded: true,
  mediation: true,
  problem: true,
  archived: false
};

const orderEventTypeByStatus: Record<OrderStatus, EventType | null> = {
  draft: null,
  pending_payment: null,
  payment_confirmed: "order.payment_confirmed",
  awaiting_delivery: "order.awaiting_delivery",
  delivered: "order.delivered",
  completed: "order.completed",
  cancelled: "order.cancelled",
  refunded: "order.refunded",
  mediation: "order.mediation",
  problem: "order.problem",
  archived: null
};

const orderEventTitleByStatus: Partial<Record<OrderStatus, string>> = {
  payment_confirmed: "Pagamento confirmado",
  awaiting_delivery: "Pedido aguardando entrega",
  delivered: "Pedido marcado como entregue",
  completed: "Pedido concluído",
  cancelled: "Pedido cancelado",
  refunded: "Pedido reembolsado",
  mediation: "Pedido em mediação",
  problem: "Pedido com problema"
};

const orderEventSeverityByStatus: Partial<Record<OrderStatus, "info" | "success" | "warning" | "critical">> = {
  payment_confirmed: "success",
  awaiting_delivery: "warning",
  delivered: "success",
  completed: "success",
  cancelled: "warning",
  refunded: "warning",
  mediation: "warning",
  problem: "critical"
};

const statusLabel: Record<OrderStatus, string> = {
  draft: "rascunho",
  pending_payment: "pagamento pendente",
  payment_confirmed: "pagamento confirmado",
  awaiting_delivery: "aguardando entrega",
  delivered: "entregue",
  completed: "concluído",
  cancelled: "cancelado",
  refunded: "reembolsado",
  mediation: "mediação",
  problem: "problema",
  archived: "arquivado"
};

const makeFinancials = (input: { salePrice: number; unitCost: number; feePercent: number }) => {
  const financials = calculateProductFinancials({
    salePrice: input.salePrice,
    unitCost: input.unitCost,
    feePercent: input.feePercent
  });

  return {
    salePriceCents: moneyToCents(financials.salePrice),
    unitCostCents: moneyToCents(financials.unitCost),
    feePercent: financials.feePercent,
    netValueCents: moneyToCents(financials.netValue),
    profitCents: moneyToCents(financials.estimatedProfit),
    marginPercent: financials.marginPercent
  };
};

const recordToWrite = (order: OrderRecord): OrderWriteRecord => ({
  id: order.id,
  orderCode: order.orderCode,
  externalOrderId: order.externalOrderId,
  marketplace: order.marketplace,
  externalMarketplace: order.externalMarketplace ?? null,
  externalStatus: order.externalStatus ?? null,
  externalPayloadHash: order.externalPayloadHash ?? null,
  lastSyncedAt: order.lastSyncedAt ?? null,
  productId: order.productId,
  inventoryItemId: order.inventoryItemId,
  buyerName: order.buyerName,
  buyerContact: order.buyerContact,
  productNameSnapshot: order.productNameSnapshot,
  categorySnapshot: order.categorySnapshot,
  salePriceCents: moneyToCents(order.salePrice),
  unitCostCents: moneyToCents(order.unitCost),
  feePercent: order.feePercent,
  netValueCents: moneyToCents(order.netValue),
  profitCents: moneyToCents(order.profit),
  marginPercent: order.marginPercent,
  status: order.status,
  actionRequired: order.actionRequired,
  marketplaceUrl: order.marketplaceUrl,
  notes: order.notes,
  createdByUserId: order.createdByUserId,
  updatedByUserId: order.updatedByUserId,
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
  confirmedAt: order.confirmedAt,
  deliveredAt: order.deliveredAt,
  completedAt: order.completedAt,
  cancelledAt: order.cancelledAt,
  refundedAt: order.refundedAt
});

const summarizeOrders = (orders: OrderRecord[]): OrderSummary => ({
  total: orders.length,
  pendingAction: orders.filter((order) => order.actionRequired).length,
  problemOrMediation: orders.filter((order) => order.status === "problem" || order.status === "mediation").length,
  grossRevenue: orders.reduce((total, order) => total + order.salePrice, 0),
  netRevenue: orders.reduce((total, order) => total + order.netValue, 0),
  estimatedProfit: orders.reduce((total, order) => total + order.profit, 0)
});

const assertInventoryCompatible = (order: OrderRecord, item: InventoryRecord): void => {
  if (item.status === "archived") {
    throw new Error("Item de estoque arquivado não pode ser vinculado.");
  }

  if (item.productId !== order.productId) {
    throw new Error("Item de estoque não pertence ao produto do pedido.");
  }

  if (item.status === "reserved" && item.orderId && item.orderId !== order.id) {
    throw new Error("Item de estoque já está reservado para outro pedido.");
  }
};

const updateInventory = (
  item: InventoryRecord,
  data: Parameters<typeof inventoryService.update>[1],
  actorUserId: string | null,
  event: {
    type: "inventory.reserved" | "inventory.released" | "inventory.sold" | "inventory.delivered" | "inventory.problem";
    title: string;
    message: string;
    severity?: "info" | "success" | "warning" | "critical";
    orderId: string;
  }
): InventoryRecord => {
  const updated = inventoryService.update(item.id, data, actorUserId);

  eventService.createInternal({
    type: event.type,
    severity: event.severity ?? "info",
    title: event.title,
    message: event.message,
    orderId: event.orderId,
    productId: updated.productId,
    inventoryItemId: updated.id,
    actorUserId
  });

  emitStockLevelEvents(updated.productId);
  return updated;
};

function emitStockLevelEvents(productId: string | null): void {
  if (!productId) {
    return;
  }

  const product = productRepository.getById(productId);
  if (!product) {
    return;
  }

  const available = inventoryRepository.countAvailableByProduct(productId);

  if (available === 0) {
    eventService.createInternal({
      type: "product.out_of_stock",
      severity: "warning",
      title: "Produto sem estoque disponível",
      message: `${product.name} não possui itens de estoque disponíveis.`,
      productId
    });
    return;
  }

  if (available <= product.stockMin) {
    eventService.createInternal({
      type: "product.low_stock",
      severity: "warning",
      title: "Produto com estoque baixo",
      message: `${product.name} possui ${available} item(ns) disponível(is).`,
      productId
    });
  }
}

const reserveInventoryForOrder = (order: OrderRecord, actorUserId: string | null): void => {
  if (!order.inventoryItemId) {
    return;
  }

  const item = inventoryService.get(order.inventoryItemId);
  assertInventoryCompatible(order, item);

  if (item.status === "available") {
    updateInventory(
      item,
      { status: "reserved", orderId: order.id },
      actorUserId,
      {
        type: "inventory.reserved",
        title: "Estoque reservado para pedido",
        message: `${item.inventoryCode} reservado para ${order.orderCode}.`,
        orderId: order.id
      }
    );
  }
};

const releaseInventoryForOrder = (order: OrderRecord, actorUserId: string | null): void => {
  if (!order.inventoryItemId) {
    return;
  }

  const item = inventoryService.get(order.inventoryItemId);
  if (item.status === "reserved" && item.orderId === order.id) {
    updateInventory(
      item,
      { status: "available", orderId: null },
      actorUserId,
      {
        type: "inventory.released",
        title: "Estoque liberado",
        message: `${item.inventoryCode} voltou para disponível após ${order.orderCode}.`,
        orderId: order.id
      }
    );
  }
};

const markInventoryDelivered = (order: OrderRecord, actorUserId: string | null): void => {
  if (!order.inventoryItemId) {
    return;
  }

  const item = inventoryService.get(order.inventoryItemId);
  if (item.status !== "delivered" && item.status !== "sold" && item.status !== "archived") {
    updateInventory(
      item,
      { status: "delivered", orderId: order.id, deliveredAt: nowIso() },
      actorUserId,
      {
        type: "inventory.delivered",
        title: "Estoque marcado como entregue",
        message: `${item.inventoryCode} foi marcado como entregue para ${order.orderCode}.`,
        severity: "success",
        orderId: order.id
      }
    );
  }
};

const markInventorySold = (order: OrderRecord, actorUserId: string | null): void => {
  if (!order.inventoryItemId) {
    return;
  }

  const item = inventoryService.get(order.inventoryItemId);
  if (item.status !== "delivered" && item.status !== "sold" && item.status !== "archived") {
    updateInventory(
      item,
      { status: "sold", orderId: order.id, soldAt: nowIso() },
      actorUserId,
      {
        type: "inventory.sold",
        title: "Estoque marcado como vendido",
        message: `${item.inventoryCode} foi marcado como vendido para ${order.orderCode}.`,
        severity: "success",
        orderId: order.id
      }
    );
  }
};

const handleRefundedInventory = (order: OrderRecord, actorUserId: string | null): void => {
  if (!order.inventoryItemId) {
    return;
  }

  const item = inventoryService.get(order.inventoryItemId);

  if (item.status === "available" || item.status === "reserved") {
    updateInventory(
      item,
      { status: "available", orderId: null },
      actorUserId,
      {
        type: "inventory.released",
        title: "Estoque liberado após reembolso",
        message: `${item.inventoryCode} não foi entregue e voltou para disponível.`,
        severity: "warning",
        orderId: order.id
      }
    );
    return;
  }

  if (item.status === "delivered" || item.status === "sold") {
    updateInventory(
      item,
      { status: "refunded", orderId: order.id },
      actorUserId,
      {
        type: "inventory.problem",
        title: "Estoque entregue em pedido reembolsado",
        message: `${item.inventoryCode} foi mantido como reembolsado para revisão manual.`,
        severity: "warning",
        orderId: order.id
      }
    );
  }
};

const createStatusEvent = (
  order: OrderRecord,
  previousStatus: OrderStatus | null,
  actorUserId: string | null
): void => {
  const type = orderEventTypeByStatus[order.status];
  if (!type) {
    return;
  }

  const notesSuffix = order.notes ? ` Observações: ${order.notes}` : "";
  eventService.createInternal({
    type,
    severity: orderEventSeverityByStatus[order.status] ?? "info",
    title: orderEventTitleByStatus[order.status] ?? "Status do pedido atualizado",
    message: `Pedido ${order.orderCode} mudou de ${
      previousStatus ? statusLabel[previousStatus] : "criação manual"
    } para ${statusLabel[order.status]}.${notesSuffix}`,
    orderId: order.id,
    productId: order.productId,
    inventoryItemId: order.inventoryItemId,
    actorUserId
  });
};

const applyInventoryTransition = (order: OrderRecord, actorUserId: string | null): void => {
  if (order.status === "payment_confirmed" || order.status === "awaiting_delivery") {
    reserveInventoryForOrder(order, actorUserId);
    return;
  }

  if (order.status === "delivered") {
    markInventoryDelivered(order, actorUserId);
    return;
  }

  if (order.status === "completed") {
    markInventorySold(order, actorUserId);
    return;
  }

  if (order.status === "cancelled") {
    releaseInventoryForOrder(order, actorUserId);
    return;
  }

  if (order.status === "refunded") {
    handleRefundedInventory(order, actorUserId);
  }
};

export const orderService = {
  list(filters: OrderListInput): OrderListResult {
    const items = orderRepository.list(filters);
    return {
      items,
      summary: summarizeOrders(items),
      products: productRepository.listAllForSelect(),
      inventoryItems: inventoryRepository.listForOrderSelect(),
      categories: productRepository.listCategories()
    };
  },

  get(id: string): OrderDetailResult {
    const order = orderRepository.getById(id);
    if (!order) {
      throw new Error("Pedido não encontrado.");
    }

    return {
      order,
      timeline: eventService.listByOrderId(id)
    };
  },

  create(input: OrderCreateInput, actorUserId: string | null = null): OrderRecord {
    const db = getSqliteDatabase();
    return db.transaction(() => {
      const product = productRepository.getById(input.productId);
      if (!product) {
        throw new Error("Produto vinculado não encontrado.");
      }

      const orderCode = normalizeOrderCode(input.orderCode);
      if (orderRepository.getByOrderCode(orderCode)) {
        throw new Error("Já existe um pedido com este código.");
      }

      const timestamp = nowIso();
      const status = input.status;
      const salePrice = input.salePrice ?? product.salePrice;
      const unitCost = input.unitCost ?? product.unitCost;
      const feePercent = input.feePercent ?? GAMEMARKET_FEE_PERCENT;
      const financials = makeFinancials({ salePrice, unitCost, feePercent });

      const writeRecord: OrderWriteRecord = {
        id: randomUUID(),
        orderCode,
        externalOrderId: input.externalOrderId ?? null,
        marketplace: input.marketplace,
        externalMarketplace: null,
        externalStatus: null,
        externalPayloadHash: null,
        lastSyncedAt: null,
        productId: product.id,
        inventoryItemId: input.inventoryItemId ?? null,
        buyerName: input.buyerName ?? null,
        buyerContact: input.buyerContact ?? null,
        productNameSnapshot: product.name,
        categorySnapshot: product.game ?? product.category,
        ...financials,
        status,
        actionRequired: actionRequiredByStatus[status],
        marketplaceUrl: input.marketplaceUrl ?? null,
        notes: input.notes ?? null,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
        confirmedAt: status === "payment_confirmed" || status === "awaiting_delivery" ? timestamp : null,
        deliveredAt: null,
        completedAt: null,
        cancelledAt: null,
        refundedAt: null
      };

      const created = orderRepository.insert(writeRecord);

      if (created.inventoryItemId) {
        const item = inventoryService.get(created.inventoryItemId);
        assertInventoryCompatible(created, item);
      }

      eventService.createInternal({
        type: "order.created",
        severity: "info",
        title: "Pedido manual criado",
        message: `Pedido ${created.orderCode} criado manualmente para ${created.productNameSnapshot}.`,
        orderId: created.id,
        productId: created.productId,
        inventoryItemId: created.inventoryItemId,
        actorUserId
      });

      createStatusEvent(created, null, actorUserId);
      applyInventoryTransition(created, actorUserId);

      return created;
    })();
  },

  update(id: string, data: OrderUpdateData, actorUserId: string | null = null): OrderRecord {
    const db = getSqliteDatabase();
    return db.transaction(() => {
      const currentDetail = this.get(id);
      const current = currentDetail.order;
      const productId = data.productId ?? current.productId;
      const product = productRepository.getById(productId);
      if (!product) {
        throw new Error("Produto vinculado não encontrado.");
      }

      const orderCode = normalizeOrderCode(
        Object.hasOwn(data, "orderCode") ? data.orderCode : current.orderCode
      );
      const duplicate = orderRepository.getByOrderCode(orderCode);
      if (duplicate && duplicate.id !== id) {
        throw new Error("Já existe outro pedido com este código.");
      }

      const productChanged = productId !== current.productId;
      if (productChanged && current.inventoryItemId) {
        releaseInventoryForOrder(current, actorUserId);
      }

      const salePrice = data.salePrice ?? current.salePrice;
      const unitCost = data.unitCost ?? current.unitCost;
      const feePercent = data.feePercent ?? current.feePercent;
      const financials = makeFinancials({ salePrice, unitCost, feePercent });

      const writeRecord: OrderWriteRecord = {
        ...recordToWrite(current),
        orderCode,
        externalOrderId: Object.hasOwn(data, "externalOrderId")
          ? data.externalOrderId ?? null
          : current.externalOrderId,
        marketplace: data.marketplace ?? current.marketplace,
        productId,
        inventoryItemId: productChanged ? null : current.inventoryItemId,
        buyerName: Object.hasOwn(data, "buyerName") ? data.buyerName ?? null : current.buyerName,
        buyerContact: Object.hasOwn(data, "buyerContact") ? data.buyerContact ?? null : current.buyerContact,
        productNameSnapshot: productChanged ? product.name : current.productNameSnapshot,
        categorySnapshot: productChanged ? product.game ?? product.category : current.categorySnapshot,
        ...financials,
        actionRequired: data.actionRequired ?? current.actionRequired,
        marketplaceUrl: Object.hasOwn(data, "marketplaceUrl")
          ? data.marketplaceUrl ?? null
          : current.marketplaceUrl,
        notes: Object.hasOwn(data, "notes") ? data.notes ?? null : current.notes,
        updatedByUserId: actorUserId ?? current.updatedByUserId,
        updatedAt: nowIso()
      };

      const updated = orderRepository.update(writeRecord);

      if (Object.hasOwn(data, "inventoryItemId")) {
        if (data.inventoryItemId) {
          return this.linkInventoryItem(updated.id, data.inventoryItemId, actorUserId);
        }

        return this.unlinkInventoryItem(updated.id, actorUserId);
      }

      return updated;
    })();
  },

  delete(id: string): void {
    if (!orderRepository.delete(id)) {
      throw new Error("Pedido não encontrado.");
    }
  },

  archive(id: string, actorUserId: string | null = null): OrderRecord {
    return this.changeStatus({ id, status: "archived", notes: null }, actorUserId);
  },

  changeStatus(input: OrderChangeStatusInput, actorUserId: string | null = null): OrderRecord {
    const db = getSqliteDatabase();
    return db.transaction(() => {
      const current = this.get(input.id).order;
      const timestamp = nowIso();
      const updatedWrite: OrderWriteRecord = {
        ...recordToWrite(current),
        status: input.status,
        actionRequired: actionRequiredByStatus[input.status],
        notes: input.notes ?? current.notes,
        updatedAt: timestamp,
        confirmedAt:
          (input.status === "payment_confirmed" || input.status === "awaiting_delivery") &&
          !current.confirmedAt
            ? timestamp
            : current.confirmedAt,
        deliveredAt: input.status === "delivered" && !current.deliveredAt ? timestamp : current.deliveredAt,
        completedAt: input.status === "completed" && !current.completedAt ? timestamp : current.completedAt,
        cancelledAt: input.status === "cancelled" && !current.cancelledAt ? timestamp : current.cancelledAt,
        refundedAt: input.status === "refunded" && !current.refundedAt ? timestamp : current.refundedAt
      };
      updatedWrite.updatedByUserId = actorUserId ?? current.updatedByUserId;
      const updated = orderRepository.update(updatedWrite);

      createStatusEvent(updated, current.status, actorUserId);
      applyInventoryTransition(updated, actorUserId);

      return updated;
    })();
  },

  linkInventoryItem(
    orderId: string,
    inventoryItemId: string,
    actorUserId: string | null = null
  ): OrderRecord {
    const db = getSqliteDatabase();
    return db.transaction(() => {
      const current = this.get(orderId).order;
      const item = inventoryService.get(inventoryItemId);
      assertInventoryCompatible(current, item);

      if (current.inventoryItemId && current.inventoryItemId !== inventoryItemId) {
        releaseInventoryForOrder(current, actorUserId);
      }

      const updated = orderRepository.update({
        ...recordToWrite(current),
        inventoryItemId,
        updatedByUserId: actorUserId ?? current.updatedByUserId,
        updatedAt: nowIso()
      });

      applyInventoryTransition(updated, actorUserId);
      return updated;
    })();
  },

  unlinkInventoryItem(orderId: string, actorUserId: string | null = null): OrderRecord {
    const db = getSqliteDatabase();
    return db.transaction(() => {
      const current = this.get(orderId).order;
      releaseInventoryForOrder(current, actorUserId);

      return orderRepository.update({
        ...recordToWrite(current),
        inventoryItemId: null,
        updatedByUserId: actorUserId ?? current.updatedByUserId,
        updatedAt: nowIso()
      });
    })();
  },

  exportCsv(filters: OrderListInput): CsvExportResult {
    const rows = orderRepository.list(filters);
    const content = buildCsv(rows, [
      { header: "ID", value: (row) => row.id },
      { header: "Código", value: (row) => row.orderCode },
      { header: "ID externo", value: (row) => row.externalOrderId },
      { header: "Marketplace", value: (row) => row.marketplace },
      { header: "Produto ID", value: (row) => row.productId },
      { header: "Produto snapshot", value: (row) => row.productNameSnapshot },
      { header: "Categoria snapshot", value: (row) => row.categorySnapshot },
      { header: "Item estoque", value: (row) => row.inventoryCode ?? row.inventoryItemId },
      { header: "Comprador", value: (row) => row.buyerName },
      { header: "Contato comprador", value: (row) => row.buyerContact },
      { header: "Valor venda", value: (row) => row.salePrice },
      { header: "Custo unitário", value: (row) => row.unitCost },
      { header: "Taxa %", value: (row) => row.feePercent },
      { header: "Valor líquido", value: (row) => row.netValue },
      { header: "Lucro", value: (row) => row.profit },
      { header: "Margem", value: (row) => row.marginPercent },
      { header: "Status", value: (row) => row.status },
      { header: "Ação pendente", value: (row) => row.actionRequired },
      { header: "URL marketplace", value: (row) => row.marketplaceUrl },
      { header: "Observações", value: (row) => row.notes },
      { header: "Criado em", value: (row) => row.createdAt },
      { header: "Atualizado em", value: (row) => row.updatedAt },
      { header: "Confirmado em", value: (row) => row.confirmedAt },
      { header: "Entregue em", value: (row) => row.deliveredAt },
      { header: "Concluído em", value: (row) => row.completedAt },
      { header: "Cancelado em", value: (row) => row.cancelledAt },
      { header: "Reembolsado em", value: (row) => row.refundedAt }
    ]);

    return {
      filename: "hzdk-orders.csv",
      content
    };
  }
};
