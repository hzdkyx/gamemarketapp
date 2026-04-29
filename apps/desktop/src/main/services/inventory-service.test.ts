import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InventoryRecord, OperationalStockRecord } from "../../shared/contracts";

const state = vi.hoisted(() => ({
  protectedItems: [] as InventoryRecord[],
  operationalItems: [] as OperationalStockRecord[],
  soldOrders: 0
}));

vi.mock("../repositories/inventory-repository", () => ({
  inventoryRepository: {
    list: () => state.protectedItems,
    getSummary: () => ({
      available: state.protectedItems.filter((item) => item.status === "available").length,
      sold: state.protectedItems.filter((item) => item.status === "sold" || item.status === "delivered").length,
      problem: state.protectedItems.filter((item) => item.status === "problem").length,
      total_cost_cents: 0,
      potential_profit_cents: 0
    }),
    listOperational: () => state.operationalItems,
    countSoldOperationalOrders: () => state.soldOrders,
    listSuppliers: () => ["Fornecedor A"]
  }
}));

vi.mock("../repositories/product-repository", () => ({
  productRepository: {
    listAllForSelect: () => [
      {
        id: "product-1",
        internalCode: "PRD-1",
        name: "Produto",
        category: "Contas",
        game: null
      }
    ],
    listCategories: () => ["Contas"]
  }
}));

vi.mock("../repositories/product-variant-repository", () => ({
  productVariantRepository: {
    listAllForSelect: () => [
      {
        id: "variant-1",
        productId: "product-1",
        variantCode: "VAR-1",
        name: "Variação",
        salePrice: 15,
        unitCost: 0,
        deliveryType: "manual",
        status: "active"
      }
    ]
  }
}));

vi.mock("../security/secrets", () => ({
  encryptLocalSecret: (value: string) => `encrypted:${value}`,
  decryptLocalSecret: (value: string) => value.replace("encrypted:", "")
}));

vi.mock("./event-service", () => ({
  eventService: {
    createInternal: vi.fn()
  }
}));

const { inventoryService } = await import("./inventory-service");

const protectedItem = (): InventoryRecord => ({
  id: "inventory-1",
  inventoryCode: "INV-1",
  productId: "product-1",
  productVariantId: "variant-1",
  productVariantCode: "VAR-1",
  productVariantName: "Variação",
  productName: "Produto",
  productInternalCode: "PRD-1",
  category: "Contas",
  game: null,
  supplierId: "Fornecedor A",
  purchaseCost: 0,
  status: "available",
  hasAccountLogin: true,
  hasAccountPassword: true,
  hasAccountEmail: false,
  hasAccountEmailPassword: false,
  hasAccessNotes: false,
  publicNotes: null,
  boughtAt: null,
  soldAt: null,
  deliveredAt: null,
  orderId: null,
  potentialProfit: 13.05,
  createdByUserId: null,
  updatedByUserId: null,
  createdAt: "2026-04-29T12:00:00.000Z",
  updatedAt: "2026-04-29T12:00:00.000Z"
});

const operationalVariant = (): OperationalStockRecord => ({
  id: "variant-1",
  scope: "variant",
  productId: "product-1",
  productInternalCode: "PRD-1",
  productName: "Produto",
  category: "Contas",
  game: null,
  productVariantId: "variant-1",
  productVariantCode: "VAR-1",
  productVariantName: "Variação",
  deliveryType: "manual",
  stockCurrent: 2,
  stockMin: 1,
  salePrice: 15,
  unitCost: 0,
  netValue: 13.05,
  unitProfit: 13.05,
  potentialProfit: 26.1,
  status: "active",
  stockState: "available",
  needsReview: false,
  supplierName: "Fornecedor A",
  supplierUrl: null
});

beforeEach(() => {
  state.protectedItems.length = 0;
  state.operationalItems.length = 0;
  state.soldOrders = 0;
});

describe("inventory service", () => {
  it("returns operational stock rows from variants and keeps protected items separate", () => {
    state.protectedItems.push(protectedItem());
    state.operationalItems.push(operationalVariant());
    state.soldOrders = 1;

    const result = inventoryService.list({
      search: null,
      productId: null,
      category: null,
      status: "all",
      supplierId: null,
      sortDirection: "asc"
    });

    expect(result.operationalItems).toHaveLength(1);
    expect(result.operationalItems[0]?.scope).toBe("variant");
    expect(result.operationalSummary.available).toBe(2);
    expect(result.operationalSummary.sold).toBe(1);
    expect(result.protectedSummary.available).toBe(1);
  });

  it("does not expose protected raw secret values in list results", () => {
    state.protectedItems.push(protectedItem());

    const result = inventoryService.list({
      search: null,
      productId: null,
      category: null,
      status: "all",
      supplierId: null,
      sortDirection: "asc"
    });
    const listed = result.items[0] as InventoryRecord & Record<string, unknown>;

    expect(listed.hasAccountLogin).toBe(true);
    expect(listed.hasAccountPassword).toBe(true);
    expect(listed.accountLogin).toBeUndefined();
    expect(listed.accountPassword).toBeUndefined();
  });
});
