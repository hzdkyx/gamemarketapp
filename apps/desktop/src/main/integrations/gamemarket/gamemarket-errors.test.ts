import { describe, expect, it } from "vitest";
import { GameMarketApiError, redactSensitiveValue } from "./gamemarket-errors";

describe("GameMarket safe errors", () => {
  it("redacts tokens and sensitive keys from safe details", () => {
    const error = new GameMarketApiError({
      endpoint: "/api/v1/products",
      token: "plain-secret-token",
      nested: {
        "x-api-key": "plain-secret-token",
        visible: "ok"
      }
    });

    expect(JSON.stringify(error.toSafeError())).not.toContain("plain-secret-token");
    expect(JSON.stringify(error.toSafeError())).toContain("visible");
  });

  it("redacts token-like values in strings", () => {
    expect(redactSensitiveValue("Authorization Bearer plainsecrettoken")).toBe(
      "Authorization [mascarado]"
    );
  });
});
