import { describe, expect, it } from "vitest";
import { sanitizeSyncPayloadObjectWithStats } from "./sync-sanitizer";

describe("desktop sync sanitizer", () => {
  it("removes protected sync fields before upload", () => {
    const result = sanitizeSyncPayloadObjectWithStats({
      name: "Produto seguro",
      apiKey: "fake-api-key",
      gameMarketToken: "fake-token",
      webhookSecret: "fake-webhook-secret",
      appSyncToken: "fake-app-sync-token",
      cloudSessionToken: "fake-cloud-session-token",
      password: "fake-password",
      passwordHash: "fake-password-hash",
      accountPassword: "fake-account-password",
      accountLogin: "fake-account-login",
      accountEmail: "fake-account-email",
      serialKey: "fake-serial-key",
      secretValue: "fake-secret-value",
      encryptedSecret: "fake-encrypted-secret",
      rawExternalPayload: { unsafe: true },
      nested: {
        safe: "kept",
        token: "fake-nested-token",
        raw_payload: { unsafe: true }
      }
    });
    const serialized = JSON.stringify(result.payload);

    expect(result.payload).toMatchObject({
      name: "Produto seguro",
      nested: { safe: "kept" }
    });
    expect(result.ignoredFields).toBeGreaterThanOrEqual(16);
    expect(serialized).not.toContain("fake-");
    expect(serialized).not.toContain("unsafe");
  });
});
