import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EventRecord,
  InventoryRecord,
  OrderRecord,
  OrderStatus,
  ProductRecord
} from "../../shared/contracts";

const state = vi.hoisted(() => ({
  products: new Map<string, ProductRecord>(),
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
  productId: string;
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
  productId: write.productId,
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
        if (sql.includes("low_stock")) {
          const products = [...state.products.values()].filter((product) => product.status !== "archived");
          return {
            low_stock: products.filter(
              (product) => product.stockCurrent > 0 && product.stockCurrent <= product.stockMin
            ).length,
            out_of_stock: products.filter((product) => product.stockCurrent <= 0).length
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
        productName: item.productName,
        status: item.status
      })),
    countAvailableByProduct: (productId: string) =>
      [...state.inventory.values()].filter((item) => item.productId === productId && item.status === "available").length
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
  });

  it("updates status to delivered and completed with inventory events", () => {
    const order = createConfirmedOrder();

    const delivered = orderService.changeStatus({
      id: order.id,
      status: "delivered",
      notes: null
    });
    expect(delivered.actionRequired).toBe(false);
    expect(delivered.deliveredAt).toBeTruthy();
    expect(state.inventory.get("inventory-1")?.status).toBe("delivered");

    const completed = orderService.changeStatus({
      id: order.id,
      status: "completed",
      notes: null
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
      notes: null
    });

    const summary = dashboardService.getSummary();

    expect(summary.salesMonth).toBe(1);
    expect(summary.grossRevenueMonth).toBe(100);
    expect(summary.netRevenueMonth).toBe(87);
    expect(summary.estimatedProfitMonth).toBe(47);
    expect(summary.latestEvents.length).toBeGreaterThan(0);
    expect(summary.statusBreakdown.some((row) => row.status === "completed")).toBe(true);
  });
});
