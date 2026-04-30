import { describe, expect, it } from "vitest";
import {
  hashExternalPayload,
  isGameMarketCompletedStatus,
  isGameMarketDeliveredStatus,
  isGameMarketProcessingStatus,
  mapGameMarketOrderStatus,
  mapGameMarketProductStatus,
  shouldApplyGameMarketOrderStatus
} from "./gamemarket-mappers";

describe("GameMarket mappers", () => {
  it("uses stable hashes to detect duplicate external payloads", () => {
    const left = hashExternalPayload({ id: 1, title: "Produto", nested: { b: 2, a: 1 } });
    const right = hashExternalPayload({ nested: { a: 1, b: 2 }, title: "Produto", id: 1 });

    expect(left).toBe(right);
  });

  it("maps only documented product statuses to local broad status", () => {
    expect(mapGameMarketProductStatus("ativo")).toBe("active");
    expect(mapGameMarketProductStatus("desativado")).toBe("paused");
    expect(mapGameMarketProductStatus("em_analise")).toBe("paused");
    expect(mapGameMarketProductStatus("rejeitado")).toBe("archived");
  });

  it("maps processing orders to confirmed local orders with action required", () => {
    expect(mapGameMarketOrderStatus("processing")).toEqual({
      status: "payment_confirmed",
      actionRequired: true
    });
    expect(mapGameMarketOrderStatus("draft")).toEqual({
      status: "draft",
      actionRequired: false
    });
  });

  it("maps completed, concluded and funds released statuses to completed", () => {
    expect(mapGameMarketOrderStatus("completed")).toEqual({
      status: "completed",
      actionRequired: false
    });
    expect(mapGameMarketOrderStatus("concluded")).toEqual({
      status: "completed",
      actionRequired: false
    });
    expect(mapGameMarketOrderStatus("Fundos Liberados")).toEqual({
      status: "completed",
      actionRequired: false
    });
    expect(isGameMarketCompletedStatus("Pedido Concluído")).toBe(true);
    expect(isGameMarketProcessingStatus("processing")).toBe(true);
  });

  it("maps delivered as awaiting release without completing the order", () => {
    expect(mapGameMarketOrderStatus("delivered")).toEqual({
      status: "delivered",
      actionRequired: false
    });
    expect(isGameMarketDeliveredStatus("Pedido Entregue")).toBe(true);
  });

  it.each(["delivered", "completed", "cancelled", "refunded"] as const)(
    "preserves local %s orders from GameMarket processing demotion",
    (status) => {
      expect(shouldApplyGameMarketOrderStatus(status, "payment_confirmed")).toBe(false);
    }
  );

  it("promotes delivered orders only when GameMarket reports a completion signal", () => {
    expect(shouldApplyGameMarketOrderStatus("delivered", "completed")).toBe(true);
    expect(shouldApplyGameMarketOrderStatus("cancelled", "completed")).toBe(false);
  });
});
