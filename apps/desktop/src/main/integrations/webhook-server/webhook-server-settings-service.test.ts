import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: new Map<string, { value_json: string; is_secret: number }>(),
  secrets: new Map<string, string>()
}));

vi.mock("../../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: (sql: string) => ({
      get: (key: string) => state.settings.get(key) ?? undefined,
      run: (params: { key?: string; valueJson?: string; isSecret?: number } | string) => {
        if (sql.startsWith("DELETE")) {
          state.settings.delete(String(params));
          return { changes: 1 };
        }

        if (typeof params === "object" && params.key && params.valueJson !== undefined) {
          state.settings.set(params.key, {
            value_json: params.valueJson,
            is_secret: params.isSecret ?? 0
          });
        }

        return { changes: 1 };
      }
    })
  })
}));

vi.mock("../../security/secrets", () => ({
  encryptLocalSecret: (plainText: string) => {
    const cipher = `encrypted:${state.secrets.size + 1}`;
    state.secrets.set(cipher, plainText);
    return cipher;
  },
  decryptLocalSecret: (encryptedValue: string) => state.secrets.get(encryptedValue) ?? ""
}));

const { maskWebhookServerToken, webhookServerSettingsService } = await import(
  "./webhook-server-settings-service"
);

beforeEach(() => {
  state.settings.clear();
  state.secrets.clear();
});

describe("Webhook Server settings service", () => {
  it("masks app sync tokens without exposing full value", () => {
    expect(maskWebhookServerToken("sync-token-123456")).toBe("sync••••••••3456");
    expect(maskWebhookServerToken("short")).toBe("••••");
  });

  it("stores app sync token encrypted and reveals only on explicit call", () => {
    const settings = webhookServerSettingsService.updateSettings({
      backendUrl: "http://localhost:3001",
      appSyncToken: "sync-token-secret-123456",
      pollingEnabled: true,
      pollingIntervalSeconds: 45
    });
    const stored = state.settings.get("webhook_server_app_sync_token_encrypted");

    expect(settings.hasToken).toBe(true);
    expect(settings.tokenMasked).toBe("sync••••••••3456");
    expect(settings.pollingEnabled).toBe(true);
    expect(stored?.value_json).toContain("encrypted:");
    expect(stored?.value_json).not.toContain("sync-token-secret-123456");
    expect(webhookServerSettingsService.revealToken()).toBe("sync-token-secret-123456");
  });
});
