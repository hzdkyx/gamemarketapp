import { describe, expect, it } from "vitest";
import { maskHeaders, maskSensitive } from "./mask-sensitive.js";

describe("maskSensitive", () => {
  it("removes sensitive fields from payloads and headers", () => {
    const masked = maskSensitive({
      Authorization: "Bearer secret",
      token: "secret-token",
      password: "secret-password",
      email: "buyer@example.com",
      visible: "ok",
    });
    const headers = maskHeaders({
      authorization: "Bearer secret",
      cookie: "session=secret",
      "content-type": "application/json",
    });

    expect(JSON.stringify(masked)).not.toContain("secret-token");
    expect(JSON.stringify(masked)).not.toContain("secret-password");
    expect(JSON.stringify(masked)).not.toContain("buyer@example.com");
    expect(JSON.stringify(masked)).toContain("visible");
    expect(headers.authorization).toBe("[masked]");
    expect(headers.cookie).toBe("[masked]");
  });
});
