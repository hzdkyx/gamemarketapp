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
  userCreateInputSchema
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

describe("order contracts", () => {
  it("defaults manual orders to gamemarket draft with 13 percent fee", () => {
    const parsed = orderCreateInputSchema.parse({
      productId: "product-1",
      buyerName: " comprador "
    });

    expect(parsed.marketplace).toBe("gamemarket");
    expect(parsed.status).toBe("draft");
    expect(parsed.feePercent).toBe(13);
    expect(parsed.buyerName).toBe("comprador");
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
      status: "payment_confirmed"
    });

    expect(parsed.status).toBe("payment_confirmed");
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
