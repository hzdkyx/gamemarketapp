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

const { gameMarketSettingsService, maskGameMarketToken } = await import("./gamemarket-settings-service");

beforeEach(() => {
  state.settings.clear();
  state.secrets.clear();
  delete process.env.GAMEMARKET_API_KEY;
  delete process.env.GAMEMARKET_API_TOKEN;
  delete process.env.GAMEMARKET_API_BASE_URL;
});

describe("GameMarket settings service", () => {
  it("masks tokens without exposing the full value", () => {
    expect(maskGameMarketToken("test-token-123456")).toBe("test••••••••3456");
    expect(maskGameMarketToken("short")).toBe("••••");
  });

  it("stores encrypted token and reveals it only through explicit service call", () => {
    const settings = gameMarketSettingsService.updateSettings({
      apiBaseUrl: "https://gamemarket.com.br",
      integrationName: "Teste",
      environment: "production",
      token: "test-token-secret-123456"
    });
    const stored = state.settings.get("gamemarket_api_token_encrypted");

    expect(settings.tokenMasked).toBe("test••••••••3456");
    expect(stored?.value_json).toContain("encrypted:");
    expect(stored?.value_json).not.toContain('"test-token-secret-123456"');
    expect(gameMarketSettingsService.revealToken()).toBe("test-token-secret-123456");
  });

  it("can use env token without persisting it", () => {
    process.env.GAMEMARKET_API_KEY = "test-env-token-9999";

    const settings = gameMarketSettingsService.getSettings();

    expect(settings.hasToken).toBe(true);
    expect(settings.tokenSource).toBe("env");
    expect(state.settings.has("gamemarket_api_token_encrypted")).toBe(false);
  });
});
