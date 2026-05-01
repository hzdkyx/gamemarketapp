import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type {
  GameMarketDocumentationStatus,
  GameMarketEnvironment,
  GameMarketSettingsUpdateInput,
  GameMarketSettingsView
} from "../../../shared/contracts";
import { getSqliteDatabase } from "../../database/database";
import { encryptLocalSecret, decryptLocalSecret } from "../../security/secrets";

const defaultBaseUrl = "https://gamemarket.com.br";
const defaultIntegrationName = "HzdKyx Desktop";

const keys = {
  baseUrl: "gamemarket_api_base_url",
  tokenEncrypted: "gamemarket_api_token_encrypted",
  integrationName: "gamemarket_integration_name",
  environment: "gamemarket_environment",
  lastSyncAt: "gamemarket_last_sync_at",
  lastConnectionStatus: "gamemarket_last_connection_status",
  lastConnectionAt: "gamemarket_last_connection_at",
  lastError: "gamemarket_last_error",
  lastSyncSummary: "gamemarket_last_sync_summary"
} as const;

interface SettingRow {
  value_json: string;
}

const envTokenNames = ["GAMEMARKET_API_KEY", "GAMEMARKET_API_TOKEN"] as const;
const envBaseUrlNames = ["GAMEMARKET_API_BASE_URL"] as const;

const readSetting = <T>(key: string, fallback: T): T => {
  const db = getSqliteDatabase();
  const row = db
    .prepare("SELECT value_json FROM settings WHERE key = ?")
    .get(key) as SettingRow | undefined;

  if (!row) {
    return fallback;
  }

  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
};

const writeSetting = (key: string, value: unknown, isSecret = false): void => {
  const db = getSqliteDatabase();
  db.prepare(
    `
      INSERT INTO settings (key, value_json, is_secret, updated_at)
      VALUES (@key, @valueJson, @isSecret, @updatedAt)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        is_secret = excluded.is_secret,
        updated_at = excluded.updated_at
    `
  ).run({
    key,
    valueJson: JSON.stringify(value),
    isSecret: isSecret ? 1 : 0,
    updatedAt: new Date().toISOString()
  });
};

const deleteSetting = (key: string): void => {
  getSqliteDatabase().prepare("DELETE FROM settings WHERE key = ?").run(key);
};

const findUp = (relativePath: string): string | null => {
  let current = resolve(process.cwd());

  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = join(current, relativePath);
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }

  return null;
};

const parseEnvLine = (line: string): [string, string] | null => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
};

const readEnvLocalValue = (names: readonly string[]): string | null => {
  for (const name of names) {
    const processValue = process.env[name];
    if (processValue?.trim()) {
      return processValue.trim();
    }
  }

  const envPath = findUp(".env.local");
  if (!envPath) {
    return null;
  }

  const entries = readFileSync(envPath, "utf8").split(/\r?\n/).map(parseEnvLine).filter(Boolean) as Array<
    [string, string]
  >;
  const env = new Map(entries);

  for (const name of names) {
    const value = env.get(name);
    if (value?.trim()) {
      return value.trim();
    }
  }

  return null;
};

export const maskGameMarketToken = (token: string | null | undefined): string | null => {
  if (!token) {
    return null;
  }

  const trimmed = token.trim();
  if (trimmed.length <= 8) {
    return "••••";
  }

  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
};

const getSavedEncryptedToken = (): string | null => {
  const encrypted = readSetting<string | null>(keys.tokenEncrypted, null);
  return encrypted?.trim() ? encrypted : null;
};

const getSavedToken = (): string | null => {
  const encrypted = getSavedEncryptedToken();
  if (!encrypted) {
    return null;
  }

  return decryptLocalSecret(encrypted);
};

const normalizeConnectionStatus = (
  status: GameMarketSettingsView["connectionStatus"],
  hasToken: boolean
): GameMarketSettingsView["connectionStatus"] =>
  status === "docs_missing" ? (hasToken ? "configured" : "not_configured") : status;

export const getGameMarketDocumentationStatus = (): GameMarketDocumentationStatus => {
  const docsDirectory = findUp("docs/gamemarket-api");

  if (!docsDirectory) {
    return {
      status: "missing",
      files: [],
      missing: ["docs/gamemarket-api/"],
      message: "A pasta docs/gamemarket-api não foi encontrada."
    };
  }

  const files = readdirSync(docsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(docsDirectory, entry.name));
  const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");
  const requiredMarkers = [
    "x-api-key",
    "/api/v1/products",
    "/api/v1/orders",
    "/api/v1/games",
    "Rate Limits"
  ];
  const missing = requiredMarkers.filter((marker) => !combined.includes(marker));

  if (files.length === 0) {
    return {
      status: "missing",
      files: [],
      missing: requiredMarkers,
      message: "A pasta docs/gamemarket-api está vazia."
    };
  }

  return {
    status: missing.length > 0 ? "incomplete" : "available",
    files: files.map((file) => file.replace(`${process.cwd()}\\`, "")),
    missing,
    message:
      missing.length > 0
        ? "A documentação local existe, mas não contém todos os itens mínimos para chamadas reais."
        : "Documentação local suficiente para leitura básica da API."
  };
};

export const gameMarketSettingsService = {
  getSettings(): GameMarketSettingsView {
    const savedToken = getSavedToken();
    const envToken = savedToken ? null : readEnvLocalValue(envTokenNames);
    const envBaseUrl = readEnvLocalValue(envBaseUrlNames);
    const tokenSource = savedToken ? "saved" : envToken ? "env" : "none";
    const hasToken = Boolean(savedToken || envToken);
    const connectionStatus = normalizeConnectionStatus(
      readSetting<GameMarketSettingsView["connectionStatus"]>(
        keys.lastConnectionStatus,
        hasToken ? "configured" : "not_configured"
      ),
      hasToken
    );

    return {
      apiBaseUrl: readSetting(keys.baseUrl, envBaseUrl ?? defaultBaseUrl),
      integrationName: readSetting(keys.integrationName, defaultIntegrationName),
      environment: readSetting<GameMarketEnvironment>(keys.environment, "production"),
      hasToken,
      tokenMasked: maskGameMarketToken(savedToken ?? envToken),
      tokenSource,
      connectionStatus,
      lastConnectionAt: readSetting<string | null>(keys.lastConnectionAt, null),
      lastSyncAt: readSetting<string | null>(keys.lastSyncAt, null),
      lastError: readSetting<string | null>(keys.lastError, null),
      documentation: getGameMarketDocumentationStatus(),
      permissions: {
        read: true,
        write: false,
        delete: false,
        source: "documentation"
      }
    };
  },

  updateSettings(input: GameMarketSettingsUpdateInput): GameMarketSettingsView {
    if (input.apiBaseUrl) {
      writeSetting(keys.baseUrl, input.apiBaseUrl);
    }

    if (input.integrationName) {
      writeSetting(keys.integrationName, input.integrationName);
    }

    if (input.environment) {
      writeSetting(keys.environment, input.environment);
    }

    if (input.clearToken) {
      deleteSetting(keys.tokenEncrypted);
    }

    if (input.token) {
      writeSetting(keys.tokenEncrypted, encryptLocalSecret(input.token), true);
    }

    const settings = this.getSettings();
    writeSetting(keys.lastConnectionStatus, settings.hasToken ? "configured" : "not_configured");

    return this.getSettings();
  },

  getTokenForRequest(): string | null {
    return getSavedToken() ?? readEnvLocalValue(envTokenNames);
  },

  revealToken(): string {
    const token = this.getTokenForRequest();
    if (!token) {
      throw new Error("Token GameMarket não configurado.");
    }

    return token;
  },

  markConnectionResult(status: "connected" | "error" | "unavailable", safeError: string | null): void {
    const timestamp = new Date().toISOString();
    writeSetting(keys.lastConnectionStatus, status);
    writeSetting(keys.lastConnectionAt, timestamp);
    writeSetting(keys.lastError, safeError);
  },

  markSyncResult(
    status: "synced" | "partial" | "failed" | "error",
    lastSyncAt: string | null,
    safeError: string | null
  ): void {
    writeSetting(keys.lastConnectionStatus, status === "failed" || status === "error" ? "error" : status);
    if (lastSyncAt) {
      writeSetting(keys.lastSyncAt, lastSyncAt);
    }
    writeSetting(keys.lastError, safeError);
  },

  saveLastSyncSummary(summary: unknown): void {
    writeSetting(keys.lastSyncSummary, summary);
  },

  getLastSyncSummary<T>(): T | null {
    return readSetting<T | null>(keys.lastSyncSummary, null);
  }
};
