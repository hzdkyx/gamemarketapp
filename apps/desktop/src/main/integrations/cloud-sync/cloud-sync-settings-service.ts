import type {
  CloudSyncConnectionStatus,
  CloudSyncMode,
  CloudSyncSettingsUpdateInput,
  CloudSyncSettingsView,
  CloudUserView,
  CloudWorkspaceView
} from "../../../shared/contracts";
import { getSqliteDatabase } from "../../database/database";
import { decryptLocalSecret, encryptLocalSecret } from "../../security/secrets";

const defaultBackendUrl = "http://localhost:3001";

const keys = {
  backendUrl: "cloud_sync_backend_url",
  sessionTokenEncrypted: "cloud_sync_session_token_encrypted",
  mode: "cloud_sync_mode",
  currentUser: "cloud_sync_current_user",
  workspaces: "cloud_sync_workspaces",
  workspaceId: "cloud_sync_workspace_id",
  autoSyncEnabled: "cloud_sync_auto_enabled",
  syncIntervalSeconds: "cloud_sync_interval_seconds",
  connectionStatus: "cloud_sync_connection_status",
  lastSyncAt: "cloud_sync_last_sync_at",
  lastPullAt: "cloud_sync_last_pull_at",
  lastPushAt: "cloud_sync_last_push_at",
  lastError: "cloud_sync_last_error",
  lastSummary: "cloud_sync_last_summary"
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

const getSavedToken = (): string | null => {
  const encrypted = readSetting<string | null>(keys.sessionTokenEncrypted, null);
  return encrypted ? decryptLocalSecret(encrypted) : null;
};

const countRows = (sql: string): number => {
  const row = getSqliteDatabase().prepare(sql).get() as { total: number } | undefined;
  return row?.total ?? 0;
};

const countPendingChanges = (): number =>
  [
    "products",
    "product_variants",
    "inventory_items",
    "orders",
    "events",
    "app_notifications",
    "settings"
  ].reduce(
    (total, table) =>
      total +
      countRows(
        `SELECT COUNT(*) AS total FROM ${table} WHERE COALESCE(sync_status, 'pending') != 'synced' AND (deleted_at IS NULL OR deleted_at != '')`
      ),
    0
  );

export const cloudSyncSettingsService = {
  getSettings(): CloudSyncSettingsView {
    const currentUser = readSetting<CloudUserView | null>(keys.currentUser, null);
    const workspaces = readSetting<CloudWorkspaceView[]>(keys.workspaces, []);
    const workspaceId = readSetting<string | null>(keys.workspaceId, null);
    const workspace = workspaces.find((item) => item.id === workspaceId) ?? null;
    const token = getSavedToken();
    const fallbackStatus: CloudSyncConnectionStatus = token ? "connected" : "auth_required";

    return {
      backendUrl: readSetting(keys.backendUrl, defaultBackendUrl),
      mode: readSetting<CloudSyncMode>(keys.mode, "local"),
      connectionStatus: readSetting<CloudSyncConnectionStatus>(keys.connectionStatus, token ? fallbackStatus : "not_configured"),
      hasSession: Boolean(token),
      currentUser,
      workspaces,
      workspaceId,
      workspaceName: workspace?.name ?? null,
      workspaceRole: workspace?.role ?? null,
      autoSyncEnabled: readSetting(keys.autoSyncEnabled, false),
      syncIntervalSeconds: readSetting(keys.syncIntervalSeconds, 300),
      lastSyncAt: readSetting<string | null>(keys.lastSyncAt, null),
      lastPullAt: readSetting<string | null>(keys.lastPullAt, null),
      lastPushAt: readSetting<string | null>(keys.lastPushAt, null),
      lastError: readSetting<string | null>(keys.lastError, null),
      pendingChanges: countPendingChanges(),
      conflictCount: countRows("SELECT COUNT(*) AS total FROM cloud_sync_conflicts WHERE resolved_at IS NULL")
    };
  },

  updateSettings(input: CloudSyncSettingsUpdateInput): CloudSyncSettingsView {
    if (input.backendUrl) {
      writeSetting(keys.backendUrl, input.backendUrl);
    }
    if (input.mode) {
      writeSetting(keys.mode, input.mode);
    }
    if (input.workspaceId !== undefined) {
      if (input.workspaceId) {
        writeSetting(keys.workspaceId, input.workspaceId);
      } else {
        deleteSetting(keys.workspaceId);
      }
    }
    if (input.autoSyncEnabled !== undefined) {
      writeSetting(keys.autoSyncEnabled, input.autoSyncEnabled);
    }
    if (input.syncIntervalSeconds !== undefined) {
      writeSetting(keys.syncIntervalSeconds, input.syncIntervalSeconds);
    }
    if (input.clearSession) {
      deleteSetting(keys.sessionTokenEncrypted);
      deleteSetting(keys.currentUser);
      deleteSetting(keys.workspaces);
      deleteSetting(keys.workspaceId);
      writeSetting(keys.connectionStatus, "auth_required");
    }

    return this.getSettings();
  },

  saveSession(token: string, user: CloudUserView, workspaces: CloudWorkspaceView[]): CloudSyncSettingsView {
    writeSetting(keys.sessionTokenEncrypted, encryptLocalSecret(token), true);
    writeSetting(keys.currentUser, user);
    writeSetting(keys.workspaces, workspaces);
    writeSetting(keys.mode, "cloud");
    writeSetting(keys.connectionStatus, "connected");
    const currentWorkspaceId = readSetting<string | null>(keys.workspaceId, null);
    if (!currentWorkspaceId && workspaces[0]) {
      writeSetting(keys.workspaceId, workspaces[0].id);
    }
    return this.getSettings();
  },

  refreshSessionView(user: CloudUserView, workspaces: CloudWorkspaceView[]): void {
    writeSetting(keys.currentUser, user);
    writeSetting(keys.workspaces, workspaces);
  },

  getTokenForRequest(): string | null {
    return getSavedToken();
  },

  markStatus(status: CloudSyncConnectionStatus, safeError: string | null): void {
    writeSetting(keys.connectionStatus, status);
    writeSetting(keys.lastError, safeError);
  },

  markSyncResult(input: {
    status: CloudSyncConnectionStatus;
    lastSyncAt?: string | null;
    lastPullAt?: string | null;
    lastPushAt?: string | null;
    safeError?: string | null;
    summary?: unknown;
  }): void {
    writeSetting(keys.connectionStatus, input.status);
    if (input.lastSyncAt) {
      writeSetting(keys.lastSyncAt, input.lastSyncAt);
    }
    if (input.lastPullAt) {
      writeSetting(keys.lastPullAt, input.lastPullAt);
    }
    if (input.lastPushAt) {
      writeSetting(keys.lastPushAt, input.lastPushAt);
    }
    writeSetting(keys.lastError, input.safeError ?? null);
    if (input.summary) {
      writeSetting(keys.lastSummary, input.summary);
    }
  },

  getLastSummary<T>(): T | null {
    return readSetting<T | null>(keys.lastSummary, null);
  }
};
