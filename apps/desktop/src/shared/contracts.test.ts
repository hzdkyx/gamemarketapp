import { describe, expect, it } from "vitest";
import {
  eventCreateManualInputSchema,
  authSetupAdminInputSchema,
  gamemarketRevealTokenInputSchema,
  gamemarketSettingsUpdateInputSchema,
  inventoryCreateInputSchema,
  inventoryRevealSecretInputSchema,
  orderChangeStatusInputSchema,
  orderCreateInputSchema,
  productCreateInputSchema,
  productListInputSchema,
  productVariantCreateInputSchema,
  productVariantUpdateInputSchema,
  userCreateInputSchema,
  webhookServerRevealTokenInputSchema,
  webhookServerSettingsUpdateInputSchema
} from "./contracts";

describe("product contracts", () => {
  it("applies safe defaults and trims product input", () => {
    const parsed = productCreateInputSchema.parse({
      name: "  CS2 Prime  ",
      salePrice: 74.9,
      unitCost: 49,
      stockCurrent: 3,
      stockMin: 1
    });

    expect(parsed.name).toBe("CS2 Prime");
    expect(parsed.feePercent).toBe(13);
    expect(parsed.status).toBe("active");
    expect(parsed.deliveryType).toBe("manual");
  });

  it("rejects invalid product statuses", () => {
    expect(() =>
      productCreateInputSchema.parse({
        name: "Conta LoL",
        status: "enabled"
      })
    ).toThrow();
  });

  it("parses product list filters with defaults", () => {
    const parsed = productListInputSchema.parse({});

    expect(parsed.status).toBe("all");
    expect(parsed.stock).toBe("all");
    expect(parsed.sortBy).toBe("name");
    expect(parsed.sortDirection).toBe("asc");
  });
});

describe("inventory contracts", () => {
  it("accepts protected inventory fields and defaults status", () => {
    const parsed = inventoryCreateInputSchema.parse({
      inventoryCode: " inv-cs2-1 ",
      productId: null,
      productVariantId: null,
      purchaseCost: 50,
      accountLogin: "login",
      accountPassword: "secret"
    });

    expect(parsed.inventoryCode).toBe("inv-cs2-1");
    expect(parsed.status).toBe("available");
    expect(parsed.accountPassword).toBe("secret");
  });

  it("validates reveal-secret requests by field enum", () => {
    expect(() =>
      inventoryRevealSecretInputSchema.parse({
        id: "item-1",
        field: "plainPassword"
      })
    ).toThrow();
  });
});

describe("product variant contracts", () => {
  it("applies safe defaults for operational variants", () => {
    const parsed = productVariantCreateInputSchema.parse({
      productId: "product-1",
      variantCode: " lol-br-base ",
      name: " [BR] Conta base ",
      salePrice: 15,
      unitCost: 7.5
    });

    expect(parsed.variantCode).toBe("lol-br-base");
    expect(parsed.name).toBe("[BR] Conta base");
    expect(parsed.feePercent).toBe(13);
    expect(parsed.deliveryType).toBe("manual");
    expect(parsed.status).toBe("active");
    expect(parsed.source).toBe("manual");
    expect(parsed.needsReview).toBe(false);
  });

  it("accepts quick-edit fields for variants", () => {
    const parsed = productVariantUpdateInputSchema.parse({
      id: "variant-1",
      data: {
        salePrice: 24.9,
        unitCost: 9,
        stockCurrent: 3,
        stockMin: 1,
        deliveryType: "manual",
        supplierName: "Fornecedor / a definir",
        supplierUrl: null,
        notes: "Atualizado manualmente"
      }
    });

    expect(parsed.data.unitCost).toBe(9);
    expect(parsed.data.stockCurrent).toBe(3);
  });
});

describe("order contracts", () => {
  it("defaults manual orders to gamemarket draft with 13 percent fee", () => {
    const parsed = orderCreateInputSchema.parse({
      productId: "product-1",
      productVariantId: "variant-1",
      buyerName: " comprador "
    });

    expect(parsed.marketplace).toBe("gamemarket");
    expect(parsed.status).toBe("draft");
    expect(parsed.feePercent).toBe(13);
    expect(parsed.buyerName).toBe("comprador");
    expect(parsed.productVariantId).toBe("variant-1");
  });

  it("rejects unsupported initial manual statuses", () => {
    expect(() =>
      orderCreateInputSchema.parse({
        productId: "product-1",
        status: "completed"
      })
    ).toThrow();
  });

  it("validates status change requests", () => {
    const parsed = orderChangeStatusInputSchema.parse({
      id: "order-1",
      status: "completed",
      manualCompletionConfirmed: true
    });

    expect(parsed.status).toBe("completed");
    expect(parsed.manualCompletionConfirmed).toBe(true);
  });
});

describe("event contracts", () => {
  it("validates manual internal events", () => {
    const parsed = eventCreateManualInputSchema.parse({
      type: "order.problem",
      severity: "critical",
      title: " Problema no pedido ",
      rawPayload: {
        token: "secret",
        visible: true
      }
    });

    expect(parsed.title).toBe("Problema no pedido");
    expect(parsed.type).toBe("order.problem");
  });

  it("accepts internal order status correction events", () => {
    const parsed = eventCreateManualInputSchema.parse({
      type: "order.status_corrected",
      severity: "warning",
      title: "Status corrigido"
    });

    expect(parsed.type).toBe("order.status_corrected");
  });

  it("rejects invented marketplace event names", () => {
    expect(() =>
      eventCreateManualInputSchema.parse({
        type: "gamemarket.sale.approved",
        title: "Evento"
      })
    ).toThrow();
  });
});

describe("GameMarket contracts", () => {
  it("validates settings updates and keeps token optional", () => {
    const parsed = gamemarketSettingsUpdateInputSchema.parse({
      apiBaseUrl: "https://gamemarket.com.br",
      integrationName: "HzdKyx Desktop",
      environment: "production"
    });

    expect(parsed.apiBaseUrl).toBe("https://gamemarket.com.br");
    expect(parsed.token).toBeUndefined();
  });

  it("requires explicit confirmation to reveal token", () => {
    expect(gamemarketRevealTokenInputSchema.parse({ confirm: true }).confirm).toBe(true);
    expect(() => gamemarketRevealTokenInputSchema.parse({ confirm: false })).toThrow();
  });
});

describe("Webhook Server contracts", () => {
  it("validates backend settings and polling bounds", () => {
    const parsed = webhookServerSettingsUpdateInputSchema.parse({
      backendUrl: "http://localhost:3001",
      appSyncToken: "test-sync-token",
      pollingEnabled: true,
      pollingIntervalSeconds: 30
    });

    expect(parsed.backendUrl).toBe("http://localhost:3001");
    expect(parsed.pollingEnabled).toBe(true);
  });

  it("rejects unsafe polling intervals and requires explicit token reveal", () => {
    expect(() =>
      webhookServerSettingsUpdateInputSchema.parse({
        backendUrl: "http://localhost:3001",
        pollingIntervalSeconds: 5
      })
    ).toThrow();
    expect(webhookServerRevealTokenInputSchema.parse({ confirm: true }).confirm).toBe(true);
    expect(() => webhookServerRevealTokenInputSchema.parse({ confirm: false })).toThrow();
  });
});

describe("auth and user contracts", () => {
  it("validates initial admin setup and matching passwords", () => {
    const parsed = authSetupAdminInputSchema.parse({
      name: " Admin ",
      username: "Admin.Local",
      password: "senha-forte-1",
      confirmPassword: "senha-forte-1"
    });

    expect(parsed.name).toBe("Admin");
    expect(parsed.username).toBe("Admin.Local");
  });

  it("rejects invalid initial admin setup payloads", () => {
    expect(() =>
      authSetupAdminInputSchema.parse({
        name: "Admin",
        username: "admin local",
        password: "senha-forte-1",
        confirmPassword: "senha-forte-1"
      })
    ).toThrow();

    expect(() =>
      authSetupAdminInputSchema.parse({
        name: "Admin",
        username: "admin.local",
        password: "curta",
        confirmPassword: "curta"
      })
    ).toThrow();

    expect(() =>
      authSetupAdminInputSchema.parse({
        name: "Admin",
        username: "admin.local",
        password: "senha-forte-1",
        confirmPassword: "senha-diferente",
        role: "viewer"
      })
    ).toThrow();
  });

  it("rejects mismatched user creation passwords", () => {
    expect(() =>
      userCreateInputSchema.parse({
        name: "Operador",
        username: "operador1",
        password: "senha-forte-1",
        confirmPassword: "senha-diferente"
      })
    ).toThrow();
  });
});
