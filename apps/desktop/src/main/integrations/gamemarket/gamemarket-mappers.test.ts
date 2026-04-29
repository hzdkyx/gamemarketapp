import { describe, expect, it } from "vitest";
import { hashExternalPayload, mapGameMarketProductStatus } from "./gamemarket-mappers";

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
});
