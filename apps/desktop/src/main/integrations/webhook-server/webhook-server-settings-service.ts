import type {
  WebhookServerConnectionStatus,
  WebhookServerSettingsUpdateInput,
  WebhookServerSettingsView
} from "../../../shared/contracts";
import { getSqliteDatabase } from "../../database/database";
import { decryptLocalSecret, encryptLocalSecret } from "../../security/secrets";

const defaultBackendUrl = "http://localhost:3001";

const keys = {
  backendUrl: "webhook_server_backend_url",
  tokenEncrypted: "webhook_server_app_sync_token_encrypted",
  pollingEnabled: "webhook_server_polling_enabled",
  pollingIntervalSeconds: "webhook_server_polling_interval_seconds",
  lastConnectionStatus: "webhook_server_last_connection_status",
  lastCheckedAt: "webhook_server_last_checked_at",
  lastSyncAt: "webhook_server_last_sync_at",
  lastEventReceivedAt: "webhook_server_last_event_received_at",
  lastError: "webhook_server_last_error",
  lastSyncSummary: "webhook_server_last_sync_summary"
} as const;

interface SettingRow {
  value_json: string;
}

const readSetting = <T>(key: string, fallback: T): T => {
  const row = getSqliteDatabase()
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
  getSqliteDatabase()
    .prepare(
      `
        INSERT INTO settings (key, value_json, is_secret, updated_at)
        VALUES (@key, @valueJson, @isSecret, @updatedAt)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          is_secret = excluded.is_secret,
          updated_at = excluded.updated_at
      `
    )
    .run({
      key,
      valueJson: JSON.stringify(value),
      isSecret: isSecret ? 1 : 0,
      updatedAt: new Date().toISOString()
    });
};

const deleteSetting = (key: string): void => {
  getSqliteDatabase().prepare("DELETE FROM settings WHERE key = ?").run(key);
};

export const maskWebhookServerToken = (token: string | null | undefined): string | null => {
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
  return encrypted ? decryptLocalSecret(encrypted) : null;
};

export const webhookServerSettingsService = {
  getSettings(): WebhookServerSettingsView {
    const token = getSavedToken();
    const connectionStatus = readSetting<WebhookServerConnectionStatus>(
      keys.lastConnectionStatus,
      token ? "configured" : "not_configured"
    );

    return {
      backendUrl: readSetting(keys.backendUrl, defaultBackendUrl),
      hasToken: Boolean(token),
      tokenMasked: maskWebhookServerToken(token),
      connectionStatus,
      pollingEnabled: readSetting(keys.pollingEnabled, false),
      pollingIntervalSeconds: readSetting(keys.pollingIntervalSeconds, 60),
      lastCheckedAt: readSetting<string | null>(keys.lastCheckedAt, null),
      lastSyncAt: readSetting<string | null>(keys.lastSyncAt, null),
      lastEventReceivedAt: readSetting<string | null>(keys.lastEventReceivedAt, null),
      lastError: readSetting<string | null>(keys.lastError, null)
    };
  },

  updateSettings(input: WebhookServerSettingsUpdateInput): WebhookServerSettingsView {
    if (input.backendUrl) {
      writeSetting(keys.backendUrl, input.backendUrl);
    }
    if (input.pollingEnabled !== undefined) {
      writeSetting(keys.pollingEnabled, input.pollingEnabled);
    }
    if (input.pollingIntervalSeconds !== undefined) {
      writeSetting(keys.pollingIntervalSeconds, input.pollingIntervalSeconds);
    }
    if (input.clearToken) {
      deleteSetting(keys.tokenEncrypted);
    }
    if (input.appSyncToken) {
      writeSetting(keys.tokenEncrypted, encryptLocalSecret(input.appSyncToken), true);
    }

    const settings = this.getSettings();
    writeSetting(keys.lastConnectionStatus, settings.hasToken ? "configured" : "not_configured");
    return this.getSettings();
  },

  getTokenForRequest(): string | null {
    return getSavedToken();
  },

  revealToken(): string {
    const token = this.getTokenForRequest();
    if (!token) {
      throw new Error("App Sync Token não configurado.");
    }

    return token;
  },

  markConnectionResult(status: WebhookServerConnectionStatus, safeError: string | null): void {
    const timestamp = new Date().toISOString();
    writeSetting(keys.lastConnectionStatus, status);
    writeSetting(keys.lastCheckedAt, timestamp);
    writeSetting(keys.lastError, safeError);
  },

  markSyncResult(
    status: "synced" | "partial" | "failed" | "error",
    lastSyncAt: string | null,
    lastEventReceivedAt: string | null,
    safeError: string | null
  ): void {
    writeSetting(keys.lastConnectionStatus, status === "failed" || status === "error" ? "error" : status);
    if (lastSyncAt) {
      writeSetting(keys.lastSyncAt, lastSyncAt);
    }
    if (lastEventReceivedAt) {
      writeSetting(keys.lastEventReceivedAt, lastEventReceivedAt);
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
