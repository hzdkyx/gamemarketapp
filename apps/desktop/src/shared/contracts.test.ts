import { describe, expect, it } from "vitest";
import {
  cloudSyncInviteUserInputSchema,
  cloudSyncLoginInputSchema,
  cloudSyncSettingsUpdateInputSchema,
  eventCreateManualInputSchema,
  appNotificationListInputSchema,
  authSetupAdminInputSchema,
  gamemarketRevealTokenInputSchema,
  gamemarketSettingsUpdateInputSchema,
  inventoryCreateInputSchema,
  inventoryRevealSecretInputSchema,
  orderChangeStatusInputSchema,
  orderCreateInputSchema,
  profitListInputSchema,
  productCreateInputSchema,
  productListInputSchema,
  productVariantCreateInputSchema,
  productVariantUpdateInputSchema,
  notificationSettingsSchema,
  userCreateInputSchema,
  webhookServerRevealTokenInputSchema,
  webhookServerSettingsUpdateInputSchema,
} from "./contracts";

describe("product contracts", () => {
  it("applies safe defaults and trims product input", () => {
    const parsed = productCreateInputSchema.parse({
      name: "  CS2 Prime  ",
      salePrice: 74.9,
      unitCost: 49,
      stockCurrent: 3,
      stockMin: 1,
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
        status: "enabled",
      }),
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
      accountPassword: "secret",
    });

    expect(parsed.inventoryCode).toBe("inv-cs2-1");
    expect(parsed.status).toBe("available");
    expect(parsed.accountPassword).toBe("secret");
  });

  it("validates reveal-secret requests by field enum", () => {
    expect(() =>
      inventoryRevealSecretInputSchema.parse({
        id: "item-1",
        field: "plainPassword",
      }),
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
      unitCost: 7.5,
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
        notes: "Atualizado manualmente",
      },
    });

    expect(parsed.data.unitCost).toBe(9);
    expect(parsed.data.stockCurrent).toBe(3);
  });
});

describe("profit contracts", () => {
  it("parses profit filters with operational defaults", () => {
    const parsed = profitListInputSchema.parse({});

    expect(parsed.deliveryType).toBe("all");
    expect(parsed.status).toBe("all");
    expect(parsed.review).toBe("all");
    expect(parsed.margin).toBe("all");
    expect(parsed.sortBy).toBe("profit_desc");
  });

  it("normalizes unknown and legacy profit filters safely", () => {
    const parsed = profitListInputSchema.parse({
      deliveryType: "invalid",
      status: "ativo",
      review: "OK",
      margin: "negative",
      sortBy: "unknown",
    });

    expect(parsed.deliveryType).toBe("all");
    expect(parsed.status).toBe("all");
    expect(parsed.review).toBe("ok");
    expect(parsed.margin).toBe("negative_profit");
    expect(parsed.sortBy).toBe("profit_desc");
  });
});

describe("order contracts", () => {
  it("defaults manual orders to gamemarket draft with 13 percent fee", () => {
    const parsed = orderCreateInputSchema.parse({
      productId: "product-1",
      productVariantId: "variant-1",
      buyerName: " comprador ",
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
        status: "completed",
      }),
    ).toThrow();
  });

  it("validates status change requests", () => {
    const parsed = orderChangeStatusInputSchema.parse({
      id: "order-1",
      status: "completed",
      manualCompletionConfirmed: true,
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
        visible: true,
      },
    });

    expect(parsed.title).toBe("Problema no pedido");
    expect(parsed.type).toBe("order.problem");
  });

  it("accepts internal order status correction events", () => {
    const parsed = eventCreateManualInputSchema.parse({
      type: "order.status_corrected",
      severity: "warning",
      title: "Status corrigido",
    });

    expect(parsed.type).toBe("order.status_corrected");
  });

  it("rejects invented marketplace event names", () => {
    expect(() =>
      eventCreateManualInputSchema.parse({
        type: "gamemarket.sale.approved",
        title: "Evento",
      }),
    ).toThrow();
  });
});

describe("GameMarket contracts", () => {
  it("validates settings updates and keeps token optional", () => {
    const parsed = gamemarketSettingsUpdateInputSchema.parse({
      apiBaseUrl: "https://gamemarket.com.br",
      integrationName: "HzdKyx Desktop",
      environment: "production",
    });

    expect(parsed.apiBaseUrl).toBe("https://gamemarket.com.br");
    expect(parsed.token).toBeUndefined();
  });

  it("requires explicit confirmation to reveal token", () => {
    expect(
      gamemarketRevealTokenInputSchema.parse({ confirm: true }).confirm,
    ).toBe(true);
    expect(() =>
      gamemarketRevealTokenInputSchema.parse({ confirm: false }),
    ).toThrow();
  });
});

describe("Webhook Server contracts", () => {
  it("validates backend settings and polling bounds", () => {
    const parsed = webhookServerSettingsUpdateInputSchema.parse({
      backendUrl: "http://localhost:3001",
      appSyncToken: "test-sync-token",
      pollingEnabled: true,
      pollingIntervalSeconds: 30,
    });

    expect(parsed.backendUrl).toBe("http://localhost:3001");
    expect(parsed.pollingEnabled).toBe(true);
  });

  it("rejects unsafe polling intervals and requires explicit token reveal", () => {
    expect(() =>
      webhookServerSettingsUpdateInputSchema.parse({
        backendUrl: "http://localhost:3001",
        pollingIntervalSeconds: 5,
      }),
    ).toThrow();
    expect(
      webhookServerRevealTokenInputSchema.parse({ confirm: true }).confirm,
    ).toBe(true);
    expect(() =>
      webhookServerRevealTokenInputSchema.parse({ confirm: false }),
    ).toThrow();
  });
});

describe("Cloud sync contracts", () => {
  it("defaults to local mode and validates workspace sync settings", () => {
    const parsed = cloudSyncSettingsUpdateInputSchema.parse({
      backendUrl: "https://gamemarketapp-production.up.railway.app",
      mode: "local",
      workspaceId: null,
      autoSyncEnabled: false,
      syncIntervalSeconds: 10,
    });

    expect(parsed.mode).toBe("local");
    expect(parsed.workspaceId).toBeNull();
    expect(parsed.autoSyncEnabled).toBe(false);
    expect(parsed.syncIntervalSeconds).toBe(10);
    expect(() => cloudSyncSettingsUpdateInputSchema.parse({ syncIntervalSeconds: 9 })).toThrow();
  });

  it("validates cloud login and collaborator creation without exposing raw token contracts", () => {
    const login = cloudSyncLoginInputSchema.parse({
      identifier: "operadora@example.com",
      password: "senha-forte-1",
    });
    const invite = cloudSyncInviteUserInputSchema.parse({
      name: "Operadora",
      email: "operadora@example.com",
      username: null,
      password: "senha-forte-2",
      role: "manager",
    });

    expect(login.identifier).toBe("operadora@example.com");
    expect(invite.role).toBe("manager");
    expect(() =>
      cloudSyncInviteUserInputSchema.parse({
        name: "Leitura",
        email: "viewer@example.com",
        password: "senha-forte-3",
        role: "owner",
      }),
    ).toThrow();
  });
});

describe("local notification contracts", () => {
  it("defaults local notification and polling settings for phase 6", () => {
    const parsed = notificationSettingsSchema.parse({
      enabledEventTypes: {},
    });

    expect(parsed.localNotificationsEnabled).toBe(true);
    expect(parsed.soundEnabled).toBe(true);
    expect(parsed.soundVolume).toBe(0.7);
    expect(parsed.automaticPollingEnabled).toBe(true);
    expect(parsed.pollingIntervalSeconds).toBe(60);
    expect(parsed.notifyNewSale).toBe(true);
    expect(parsed.notifyOrderCompleted).toBe(true);
  });

  it("validates app notification list bounds", () => {
    expect(appNotificationListInputSchema.parse({}).limit).toBe(20);
    expect(() => appNotificationListInputSchema.parse({ limit: 101 })).toThrow();
  });
});

describe("auth and user contracts", () => {
  it("validates initial admin setup and matching passwords", () => {
    const parsed = authSetupAdminInputSchema.parse({
      name: " Admin ",
      username: "Admin.Local",
      password: "senha-forte-1",
      confirmPassword: "senha-forte-1",
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
        confirmPassword: "senha-forte-1",
      }),
    ).toThrow();

    expect(() =>
      authSetupAdminInputSchema.parse({
        name: "Admin",
        username: "admin.local",
        password: "curta",
        confirmPassword: "curta",
      }),
    ).toThrow();

    expect(() =>
      authSetupAdminInputSchema.parse({
        name: "Admin",
        username: "admin.local",
        password: "senha-forte-1",
        confirmPassword: "senha-diferente",
        role: "viewer",
      }),
    ).toThrow();
  });

  it("rejects mismatched user creation passwords", () => {
    expect(() =>
      userCreateInputSchema.parse({
        name: "Operador",
        username: "operador1",
        password: "senha-forte-1",
        confirmPassword: "senha-diferente",
      }),
    ).toThrow();
  });
});
