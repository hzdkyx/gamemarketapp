import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EventRecord,
  InventoryRecord,
  OrderRecord,
  OrderStatus,
  ProductRecord,
  ProductVariantRecord
} from "../../shared/contracts";

const state = vi.hoisted(() => ({
  products: new Map<string, ProductRecord>(),
  productVariants: new Map<string, ProductVariantRecord>(),
  inventory: new Map<string, InventoryRecord>(),
  orders: new Map<string, OrderRecord>(),
  events: [] as EventRecord[]
}));

const centsToMoney = (value: number): number => Math.round(value) / 100;
const moneyToCents = (value: number): number => Math.round((value + Number.EPSILON) * 100);

const mapWriteOrder = (write: {
  id: string;
  orderCode: string;
  externalOrderId: string | null;
  marketplace: "gamemarket";
  externalMarketplace?: "gamemarket" | null;
  externalStatus?: string | null;
  externalPayloadHash?: string | null;
  lastSyncedAt?: string | null;
  productId: string;
  productVariantId: string | null;
  inventoryItemId: string | null;
  buyerName: string | null;
  buyerContact: string | null;
  productNameSnapshot: string;
  categorySnapshot: string;
  salePriceCents: number;
  unitCostCents: number;
  feePercent: number;
  netValueCents: number;
  profitCents: number;
  marginPercent: number;
  status: OrderStatus;
  actionRequired: boolean;
  marketplaceUrl: string | null;
  notes: string | null;
  createdByUserId: string | null;
  updatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  refundedAt: string | null;
}): OrderRecord => ({
  id: write.id,
  orderCode: write.orderCode,
  externalOrderId: write.externalOrderId,
  marketplace: write.marketplace,
  externalMarketplace: write.externalMarketplace ?? null,
  externalStatus: write.externalStatus ?? null,
  externalPayloadHash: write.externalPayloadHash ?? null,
  lastSyncedAt: write.lastSyncedAt ?? null,
  productId: write.productId,
  productVariantId: write.productVariantId,
  productVariantCode: write.productVariantId ? state.productVariants.get(write.productVariantId)?.variantCode ?? null : null,
  productVariantName: write.productVariantId ? state.productVariants.get(write.productVariantId)?.name ?? null : null,
  variantPending:
    !write.productVariantId &&
    [...state.productVariants.values()].some(
      (variant) => variant.productId === write.productId && variant.status !== "archived"
    ),
  inventoryItemId: write.inventoryItemId,
  inventoryCode: write.inventoryItemId ? state.inventory.get(write.inventoryItemId)?.inventoryCode ?? null : null,
  buyerName: write.buyerName,
  buyerContact: write.buyerContact,
  productNameSnapshot: write.productNameSnapshot,
  categorySnapshot: write.categorySnapshot,
  salePrice: centsToMoney(write.salePriceCents),
  unitCost: centsToMoney(write.unitCostCents),
  feePercent: write.feePercent,
  netValue: centsToMoney(write.netValueCents),
  profit: centsToMoney(write.profitCents),
  marginPercent: write.marginPercent,
  status: write.status,
  actionRequired: write.actionRequired,
  marketplaceUrl: write.marketplaceUrl,
  notes: write.notes,
  createdByUserId: write.createdByUserId,
  updatedByUserId: write.updatedByUserId,
  createdAt: write.createdAt,
  updatedAt: write.updatedAt,
  confirmedAt: write.confirmedAt,
  deliveredAt: write.deliveredAt,
  completedAt: write.completedAt,
  cancelledAt: write.cancelledAt,
  refundedAt: write.refundedAt
});

vi.mock("../database/database", () => ({
  getSqliteDatabase: () => ({
    transaction: <T>(fn: () => T) => () => fn(),
    prepare: (sql: string) => ({
      get: () => {
        if (sql.includes("waiting_release_count")) {
          const waitingReleaseOrders = [...state.orders.values()].filter(
            (order) => order.status === "delivered" && !order.completedAt
          );
          return {
            waiting_release_count: waitingReleaseOrders.length,
            waiting_release_gross_cents: moneyToCents(waitingReleaseOrders.reduce((total, order) => total + order.salePrice, 0)),
            waiting_release_net_cents: moneyToCents(waitingReleaseOrders.reduce((total, order) => total + order.netValue, 0)),
            waiting_release_profit_cents: moneyToCents(waitingReleaseOrders.reduce((total, order) => total + order.profit, 0))
          };
        }

        if (sql.includes("low_stock")) {
          const productsWithVariants = new Set(
            [...state.productVariants.values()]
              .filter((variant) => variant.status !== "archived")
              .map((variant) => variant.productId)
          );
          const units = [
            ...[...state.productVariants.values()].filter((variant) => variant.status !== "archived"),
            ...[...state.products.values()].filter(
              (product) => product.status !== "archived" && !productsWithVariants.has(product.id)
            )
          ];
          const trackedUnits = units.filter((unit) => unit.deliveryType === "manual" || unit.deliveryType === "automatic");
          return {
            low_stock: trackedUnits.filter((unit) => unit.stockCurrent > 0 && unit.stockCurrent <= unit.stockMin).length,
            out_of_stock: trackedUnits.filter((unit) => unit.stockCurrent <= 0).length
          };
        }

        const saleStatuses = new Set(["payment_confirmed", "awaiting_delivery", "delivered", "completed"]);
        const saleOrders = [...state.orders.values()].filter((order) => saleStatuses.has(order.status));
        return {
          sales_today: saleOrders.length,
          sales_month: saleOrders.length,
          gross_month_cents: moneyToCents(saleOrders.reduce((total, order) => total + order.salePrice, 0)),
          net_month_cents: moneyToCents(saleOrders.reduce((total, order) => total + order.netValue, 0)),
          profit_month_cents: moneyToCents(saleOrders.reduce((total, order) => total + order.profit, 0)),
          pending_action: [...state.orders.values()].filter((order) => order.actionRequired).length,
          problem_or_mediation: [...state.orders.values()].filter(
            (order) => order.status === "problem" || order.status === "mediation"
          ).length
        };
      },
      all: () => {
        if (sql.includes("category_snapshot")) {
          const byCategory = new Map<string, number>();
          for (const order of state.orders.values()) {
            byCategory.set(order.categorySnapshot, (byCategory.get(order.categorySnapshot) ?? 0) + order.profit);
          }
          return [...byCategory.entries()].map(([category, profit]) => ({
            category,
            profit_cents: moneyToCents(profit)
          }));
        }

        if (sql.includes("SUBSTR")) {
          return [
            {
              day: new Date().toISOString().slice(0, 10),
              orders: state.orders.size,
              gross_cents: moneyToCents([...state.orders.values()].reduce((total, order) => total + order.salePrice, 0)),
              profit_cents: moneyToCents([...state.orders.values()].reduce((total, order) => total + order.profit, 0))
            }
          ];
        }

        const byStatus = new Map<OrderStatus, number>();
        for (const order of state.orders.values()) {
          byStatus.set(order.status, (byStatus.get(order.status) ?? 0) + 1);
        }
        return [...byStatus.entries()].map(([status, count]) => ({ status, count }));
      }
    })
  })
}));

vi.mock("../repositories/product-repository", () => ({
  productRepository: {
    getById: (id: string) => state.products.get(id) ?? null,
    listAllForSelect: () =>
      [...state.products.values()].map((product) => ({
        id: product.id,
        internalCode: product.internalCode,
        name: product.name,
        category: product.category,
        game: product.game
      })),
    listCategories: () => [...new Set([...state.products.values()].map((product) => product.category))]
  }
}));

vi.mock("../repositories/inventory-repository", () => ({
  inventoryRepository: {
    listForOrderSelect: () =>
      [...state.inventory.values()].map((item) => ({
        id: item.id,
        inventoryCode: item.inventoryCode,
        productId: item.productId,
        productVariantId: item.productVariantId,
        productName: item.productName,
        productVariantName: item.productVariantName,
        status: item.status
      })),
    countAvailableByProduct: (productId: string) =>
      [...state.inventory.values()].filter((item) => item.productId === productId && item.status === "available").length,
    countAvailableByProductVariant: (productVariantId: string) =>
      [...state.inventory.values()].filter(
        (item) => item.productVariantId === productVariantId && item.status === "available"
      ).length
  }
}));

vi.mock("../repositories/product-variant-repository", () => ({
  productVariantRepository: {
    getById: (id: string) => state.productVariants.get(id) ?? null,
    listAllForSelect: () =>
      [...state.productVariants.values()].map((variant) => ({
        id: variant.id,
        productId: variant.productId,
        variantCode: variant.variantCode,
        name: variant.name,
        salePrice: variant.salePrice,
        unitCost: variant.unitCost,
        deliveryType: variant.deliveryType,
        status: variant.status
      }))
  }
}));

vi.mock("../repositories/order-repository", () => ({
  orderRepository: {
    list: () => [...state.orders.values()],
    getById: (id: string) => state.orders.get(id) ?? null,
    getByOrderCode: (orderCode: string) =>
      [...state.orders.values()].find((order) => order.orderCode === orderCode) ?? null,
    insert: (write: Parameters<typeof mapWriteOrder>[0]) => {
      const order = mapWriteOrder(write);
      state.orders.set(order.id, order);
      return order;
    },
    update: (write: Parameters<typeof mapWriteOrder>[0]) => {
      const order = mapWriteOrder(write);
      state.orders.set(order.id, order);
      return order;
    },
    delete: (id: string) => state.orders.delete(id),
    getSummary: () => ({
      total: state.orders.size,
      pendingAction: [...state.orders.values()].filter((order) => order.actionRequired).length,
      problemOrMediation: [...state.orders.values()].filter(
        (order) => order.status === "problem" || order.status === "mediation"
      ).length,
      grossRevenue: [...state.orders.values()].reduce((total, order) => total + order.salePrice, 0),
      netRevenue: [...state.orders.values()].reduce((total, order) => total + order.netValue, 0),
      estimatedProfit: [...state.orders.values()].reduce((total, order) => total + order.profit, 0)
    })
  }
}));

vi.mock("./inventory-service", () => ({
  inventoryService: {
    get: (id: string) => {
      const item = state.inventory.get(id);
      if (!item) {
        throw new Error("Item de estoque não encontrado.");
      }
      return item;
    },
    update: (id: string, data: Partial<InventoryRecord>) => {
      const current = state.inventory.get(id);
      if (!current) {
        throw new Error("Item de estoque não encontrado.");
      }
      const updated = {
        ...current,
        ...data,
        updatedAt: new Date().toISOString()
      };
      state.inventory.set(id, updated);
      return updated;
    }
  }
}));

vi.mock("./event-service", () => ({
  eventService: {
    createInternal: (input: {
      type: EventRecord["type"];
      severity?: EventRecord["severity"];
      title: string;
      message?: string | null;
      orderId?: string | null;
      productId?: string | null;
      inventoryItemId?: string | null;
      actorUserId?: string | null;
    }) => {
      const event: EventRecord = {
        id: `event-${state.events.length + 1}`,
        eventCode: `EVT-${state.events.length + 1}`,
        source: "system",
        type: input.type,
        severity: input.severity ?? "info",
        title: input.title,
        message: input.message ?? null,
        orderId: input.orderId ?? null,
        orderCode: input.orderId ? state.orders.get(input.orderId)?.orderCode ?? null : null,
        productId: input.productId ?? null,
        productName: input.productId ? state.products.get(input.productId)?.name ?? null : null,
        inventoryItemId: input.inventoryItemId ?? null,
        inventoryCode: input.inventoryItemId ? state.inventory.get(input.inventoryItemId)?.inventoryCode ?? null : null,
        actorUserId: input.actorUserId ?? null,
        actorUserName: null,
        readAt: null,
        rawPayload: null,
        createdAt: new Date().toISOString()
      };
      state.events.push(event);
      return event;
    },
    listByOrderId: (orderId: string) => state.events.filter((event) => event.orderId === orderId)
  }
}));

vi.mock("../repositories/event-repository", () => ({
  eventRepository: {
    listLatest: (limit: number) => state.events.slice(-limit).reverse()
  }
}));

const { orderService } = await import("./order-service");
const { dashboardService } = await import("./dashboard-service");

const productFixture = (): ProductRecord => ({
  id: "product-1",
  internalCode: "PRD-LOL-1",
  name: "Conta LoL Prata",
  category: "Contas",
  game: "League of Legends",
  platform: null,
  listingUrl: null,
  salePrice: 100,
  unitCost: 40,
  feePercent: 13,
  netValue: 87,
  estimatedProfit: 47,
  marginPercent: 0.47,
  stockCurrent: 1,
  stockMin: 1,
  status: "active",
  deliveryType: "manual",
  supplierId: null,
  notes: null,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const inventoryFixture = (): InventoryRecord => ({
  id: "inventory-1",
  inventoryCode: "INV-LOL-1",
  productId: "product-1",
  productVariantId: null,
  productVariantCode: null,
  productVariantName: null,
  productName: "Conta LoL Prata",
  productInternalCode: "PRD-LOL-1",
  category: "Contas",
  game: "League of Legends",
  supplierId: null,
  purchaseCost: 40,
  status: "available",
  hasAccountLogin: false,
  hasAccountPassword: false,
  hasAccountEmail: false,
  hasAccountEmailPassword: false,
  hasAccessNotes: false,
  publicNotes: null,
  boughtAt: null,
  soldAt: null,
  deliveredAt: null,
  orderId: null,
  potentialProfit: 47,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const productVariantFixture = (): ProductVariantRecord => ({
  id: "variant-1",
  productId: "product-1",
  variantCode: "LOL-BR-SKIN",
  name: "[BR] LoL com skin | Full Acesso",
  description: null,
  salePrice: 25,
  unitCost: 7.5,
  feePercent: 13,
  netValue: 21.75,
  estimatedProfit: 14.25,
  marginPercent: 0.57,
  minimumPrice: 8.62,
  stockCurrent: 1,
  stockMin: 1,
  supplierName: "Fornecedor LoL / a definir",
  supplierUrl: null,
  deliveryType: "manual",
  status: "active",
  notes: null,
  source: "manual",
  needsReview: false,
  manuallyEditedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

const createConfirmedOrder = (): OrderRecord =>
  orderService.create({
    productId: "product-1",
    inventoryItemId: "inventory-1",
    buyerName: "Cliente",
    feePercent: 13,
    status: "payment_confirmed",
    marketplace: "gamemarket",
    orderCode: null,
    externalOrderId: null,
    buyerContact: null,
    marketplaceUrl: null,
    notes: null
  });

beforeEach(() => {
  state.products.clear();
  state.productVariants.clear();
  state.inventory.clear();
  state.orders.clear();
  state.events.length = 0;
  state.products.set("product-1", productFixture());
  state.inventory.set("inventory-1", inventoryFixture());
});

describe("order service", () => {
  it("creates a confirmed order with financial snapshots, events and reserved inventory", () => {
    const order = createConfirmedOrder();

    expect(order.netValue).toBe(87);
    expect(order.profit).toBe(47);
    expect(order.marginPercent).toBeCloseTo(0.47);
    expect(order.actionRequired).toBe(true);

    const inventory = state.inventory.get("inventory-1");
    expect(inventory?.status).toBe("reserved");
    expect(inventory?.orderId).toBe(order.id);
    expect(state.events.map((event) => event.type)).toContain("order.payment_confirmed");
    expect(state.events.map((event) => event.type)).toContain("inventory.reserved");
    expect(state.events.map((event) => event.type)).toContain("audit.order_updated");
  });

  it("uses the selected product variant cost and sale price in order financials", () => {
    const variant = productVariantFixture();
    state.productVariants.set(variant.id, variant);
    state.inventory.set("inventory-variant-1", {
      ...inventoryFixture(),
      id: "inventory-variant-1",
      inventoryCode: "INV-LOL-SKIN-1",
      productVariantId: variant.id,
      productVariantCode: variant.variantCode,
      productVariantName: variant.name,
      purchaseCost: variant.unitCost,
      potentialProfit: variant.estimatedProfit
    });

    const order = orderService.create({
      productId: "product-1",
      productVariantId: variant.id,
      inventoryItemId: "inventory-variant-1",
      buyerName: "Cliente",
      feePercent: 13,
      status: "payment_confirmed",
      marketplace: "gamemarket",
      orderCode: null,
      externalOrderId: null,
      buyerContact: null,
      marketplaceUrl: null,
      notes: null
    });

    expect(order.productVariantId).toBe(variant.id);
    expect(order.salePrice).toBe(25);
    expect(order.unitCost).toBe(7.5);
    expect(order.netValue).toBe(21.75);
    expect(order.profit).toBe(14.25);
    expect(order.variantPending).toBe(false);
  });

  it("updates status to delivered without completing the order automatically", () => {
    const order = createConfirmedOrder();

    const delivered = orderService.changeStatus({
      id: order.id,
      status: "delivered",
      notes: null
    });
    expect(delivered.actionRequired).toBe(false);
    expect(delivered.deliveredAt).toBeTruthy();
    expect(delivered.completedAt).toBeNull();
    expect(state.inventory.get("inventory-1")?.status).toBe("delivered");
    expect(state.events.map((event) => event.type)).toContain("order.delivered");
    expect(state.events.map((event) => event.type)).toContain("audit.order_status_changed");
    expect(state.events.map((event) => event.type)).not.toContain("order.completed");
  });

  it("requires explicit confirmation before completing a GameMarket order manually", () => {
    const order = createConfirmedOrder();
    const delivered = orderService.changeStatus({
      id: order.id,
      status: "delivered",
      notes: null
    });

    expect(() =>
      orderService.changeStatus({
        id: delivered.id,
        status: "completed",
        notes: null
      })
    ).toThrow("Para concluir manualmente");

    const completed = orderService.changeStatus({
      id: order.id,
      status: "completed",
      notes: null,
      manualCompletionConfirmed: true
    });
    expect(completed.completedAt).toBeTruthy();
    expect(state.events.map((event) => event.type)).toContain("order.completed");
  });

  it("releases reserved inventory when a confirmed order is cancelled", () => {
    const order = createConfirmedOrder();

    orderService.changeStatus({
      id: order.id,
      status: "cancelled",
      notes: null
    });

    const inventory = state.inventory.get("inventory-1");
    expect(inventory?.status).toBe("available");
    expect(inventory?.orderId).toBeNull();
    expect(state.events.map((event) => event.type)).toContain("inventory.released");
  });

  it("exports order CSV without protected inventory secrets", () => {
    createConfirmedOrder();

    const orderCsv = orderService.exportCsv({
      search: null,
      status: "all",
      productId: null,
      category: null,
      dateFrom: null,
      dateTo: null,
      actionRequired: "all",
      sortBy: "date",
      sortDirection: "desc"
    });

    expect(orderCsv.content).toContain("Cliente");
    expect(orderCsv.content).not.toContain("account_password");
  });
});

describe("dashboard service", () => {
  it("summarizes real order and event data from mocked repositories", () => {
    const order = createConfirmedOrder();
    orderService.changeStatus({
      id: order.id,
      status: "completed",
      notes: null,
      manualCompletionConfirmed: true
    });

    const summary = dashboardService.getSummary();

    expect(summary.salesMonth).toBe(1);
    expect(summary.grossRevenueMonth).toBe(100);
    expect(summary.netRevenueMonth).toBe(87);
    expect(summary.estimatedProfitMonth).toBe(47);
    expect(summary.latestEvents.length).toBeGreaterThan(0);
    expect(summary.statusBreakdown.some((row) => row.status === "completed")).toBe(true);
  });

  it("keeps a delivered GMK order in monthly dashboard revenue while release is pending", () => {
    state.products.set("product-1", {
      ...productFixture(),
      salePrice: 15,
      unitCost: 0,
      netValue: 13.05,
      estimatedProfit: 13.05
    });

    const order = orderService.create({
      productId: "product-1",
      inventoryItemId: null,
      buyerName: "comprador",
      feePercent: 13,
      status: "payment_confirmed",
      marketplace: "gamemarket",
      orderCode: "GMK-ORD-34831",
      externalOrderId: "34831",
      buyerContact: null,
      marketplaceUrl: null,
      notes: null
    });
    orderService.changeStatus({
      id: order.id,
      status: "delivered",
      notes: null
    });

    const summary = dashboardService.getSummary();

    expect(summary.salesMonth).toBe(1);
    expect(summary.grossRevenueMonth).toBe(15);
    expect(summary.netRevenueMonth).toBe(13.05);
    expect(summary.estimatedProfitMonth).toBe(13.05);
  });

  it("counts completed sales but excludes draft, cancelled and refunded from dashboard revenue", () => {
    const completedOrder = createConfirmedOrder();
    orderService.changeStatus({
      id: completedOrder.id,
      status: "completed",
      notes: null,
      manualCompletionConfirmed: true
    });

    orderService.create({
      productId: "product-1",
      inventoryItemId: null,
      buyerName: "Draft",
      feePercent: 13,
      status: "draft",
      marketplace: "gamemarket",
      orderCode: "ORD-DRAFT",
      externalOrderId: null,
      buyerContact: null,
      marketplaceUrl: null,
      notes: null
    });

    const cancelled = orderService.create({
      productId: "product-1",
      inventoryItemId: null,
      buyerName: "Cancelado",
      feePercent: 13,
      status: "payment_confirmed",
      marketplace: "gamemarket",
      orderCode: "ORD-CANCELLED",
      externalOrderId: null,
      buyerContact: null,
      marketplaceUrl: null,
      notes: null
    });
    orderService.changeStatus({
      id: cancelled.id,
      status: "cancelled",
      notes: null
    });

    const refunded = orderService.create({
      productId: "product-1",
      inventoryItemId: null,
      buyerName: "Reembolsado",
      feePercent: 13,
      status: "payment_confirmed",
      marketplace: "gamemarket",
      orderCode: "ORD-REFUNDED",
      externalOrderId: null,
      buyerContact: null,
      marketplaceUrl: null,
      notes: null
    });
    orderService.changeStatus({
      id: refunded.id,
      status: "refunded",
      notes: null
    });

    const summary = dashboardService.getSummary();

    expect(summary.salesMonth).toBe(1);
    expect(summary.grossRevenueMonth).toBe(100);
    expect(summary.netRevenueMonth).toBe(87);
    expect(summary.estimatedProfitMonth).toBe(47);
  });

  it("counts stock problems only for manual or automatic variants when products have variants", () => {
    state.products.set("product-service", {
      ...productFixture(),
      id: "product-service",
      internalCode: "SITE-1",
      name: "Criação de site",
      deliveryType: "service",
      stockCurrent: 0,
      stockMin: 0
    });
    state.productVariants.set("variant-manual-zero", {
      ...productVariantFixture(),
      id: "variant-manual-zero",
      stockCurrent: 0,
      stockMin: 1,
      deliveryType: "manual"
    });
    state.productVariants.set("variant-service-zero", {
      ...productVariantFixture(),
      id: "variant-service-zero",
      productId: "product-service",
      variantCode: "SITE-PROFISSIONAL-BASE",
      name: "Criação de site profissional | Base",
      stockCurrent: 0,
      stockMin: 0,
      deliveryType: "service"
    });
    state.productVariants.set("variant-on-demand-zero", {
      ...productVariantFixture(),
      id: "variant-on-demand-zero",
      variantCode: "CS2-PRIME-NO-PREMIER",
      name: "CS2 Prime | Sem Premier Ativo | Full Acesso",
      stockCurrent: 0,
      stockMin: 0,
      deliveryType: "on_demand"
    });
    state.productVariants.set("variant-automatic-zero", {
      ...productVariantFixture(),
      id: "variant-automatic-zero",
      variantCode: "AUTO-KEY-ZERO",
      name: "Chave automática zerada",
      stockCurrent: 0,
      stockMin: 1,
      deliveryType: "automatic"
    });

    const summary = dashboardService.getSummary();

    expect(summary.outOfStockProducts).toBe(2);
    expect(summary.lowStockProducts).toBe(0);
  });
});
