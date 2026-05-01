import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const { gameMarketSettingsService, isGameMarketConfigured, maskGameMarketToken } = await import(
  "./gamemarket-settings-service"
);

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

  it("keeps GameMarket configured when local documentation is absent", () => {
    const previousCwd = process.cwd();
    const tempDir = mkdtempSync(join(tmpdir(), "gm-docs-optional-"));

    try {
      process.chdir(tempDir);
      const settings = gameMarketSettingsService.updateSettings({
        apiBaseUrl: "https://gamemarket.com.br",
        integrationName: "Teste",
        environment: "production",
        token: "test-token-secret-123456"
      });

      expect(settings.documentation.status).toBe("missing");
      expect(settings.connectionStatus).toBe("configured");
      expect(isGameMarketConfigured(settings)).toBe(true);
      expect(settings.tokenMasked).toBe("test••••••••3456");
      expect(gameMarketSettingsService.revealToken()).toBe("test-token-secret-123456");
    } finally {
      process.chdir(previousCwd);
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("normalizes legacy docs_missing status without rewriting the saved token", () => {
    gameMarketSettingsService.updateSettings({
      token: "test-token-secret-123456"
    });
    const storedToken = state.settings.get("gamemarket_api_token_encrypted")?.value_json;
    state.settings.set("gamemarket_last_connection_status", {
      value_json: JSON.stringify("docs_missing"),
      is_secret: 0
    });

    const settings = gameMarketSettingsService.getSettings();

    expect(settings.connectionStatus).toBe("configured");
    expect(state.settings.get("gamemarket_api_token_encrypted")?.value_json).toBe(storedToken);
    expect(settings.tokenMasked).toBe("test••••••••3456");
  });

  it("requires valid base URL and a secure token to be configured", () => {
    expect(
      isGameMarketConfigured({
        apiBaseUrl: "https://gamemarket.com.br",
        hasToken: true
      })
    ).toBe(true);
    expect(
      isGameMarketConfigured({
        apiBaseUrl: "not-a-url",
        hasToken: true
      })
    ).toBe(false);
    expect(
      isGameMarketConfigured({
        apiBaseUrl: "https://gamemarket.com.br",
        hasToken: false
      })
    ).toBe(false);
  });
});
