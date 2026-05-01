import type {
  CloudSyncBootstrapOwnerInput,
  CloudSyncInviteUserInput,
  CloudSyncLoginInput,
  CloudSyncSettingsUpdateInput,
  CloudSyncSettingsView,
  CloudSyncSummary,
  CloudSyncUpdateMemberInput,
  CloudWorkspaceMemberView
} from "../../../shared/contracts";
import { CloudSyncClient } from "./cloud-sync-client";
import { cloudSyncLocalStore } from "./cloud-sync-local-store";
import { cloudSyncSettingsService } from "./cloud-sync-settings-service";

const toSafeCloudError = (error: unknown): string =>
  error instanceof Error ? error.message.replace(/Bearer\s+[A-Za-z0-9._~-]+/g, "Bearer [masked]") : "Falha no cloud sync.";

const getClient = (): CloudSyncClient => {
  const settings = cloudSyncSettingsService.getSettings();
  const token = cloudSyncSettingsService.getTokenForRequest();
  return new CloudSyncClient({
    baseUrl: settings.backendUrl,
    sessionToken: token
  });
};

const requireCloudReady = (): { settings: CloudSyncSettingsView; workspaceId: string } => {
  const settings = cloudSyncSettingsService.getSettings();
  if (settings.mode !== "cloud") {
    throw new Error("Modo nuvem não está ativado.");
  }
  if (!settings.hasSession) {
    throw new Error("Faça login na conta cloud.");
  }
  if (!settings.workspaceId) {
    throw new Error("Selecione um workspace.");
  }
  return { settings, workspaceId: settings.workspaceId };
};

const finishSummary = (
  startedAt: string,
  partial: Omit<CloudSyncSummary, "startedAt" | "finishedAt" | "durationMs">
): CloudSyncSummary => {
  const finishedAt = new Date().toISOString();
  return {
    startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
    ...partial
  };
};

export const cloudSyncService = {
  getSettings(): CloudSyncSettingsView {
    return cloudSyncSettingsService.getSettings();
  },

  updateSettings(input: CloudSyncSettingsUpdateInput): CloudSyncSettingsView {
    return cloudSyncSettingsService.updateSettings(input);
  },

  async testConnection(): Promise<{ ok: boolean; safeMessage: string }> {
    try {
      await getClient().health();
      cloudSyncSettingsService.markStatus("connected", null);
      return { ok: true, safeMessage: "Backend cloud respondeu ao healthcheck." };
    } catch (error) {
      const safeError = toSafeCloudError(error);
      cloudSyncSettingsService.markStatus("error", safeError);
      return { ok: false, safeMessage: safeError };
    }
  },

  async bootstrapOwner(input: CloudSyncBootstrapOwnerInput): Promise<CloudSyncSettingsView> {
    const settings = cloudSyncSettingsService.getSettings();
    const result = await new CloudSyncClient({ baseUrl: settings.backendUrl }).bootstrapOwner(input);
    return cloudSyncSettingsService.saveSession(result.token, result.user, result.workspaces);
  },

  async login(input: CloudSyncLoginInput): Promise<CloudSyncSettingsView> {
    const settings = cloudSyncSettingsService.getSettings();
    const result = await new CloudSyncClient({ baseUrl: settings.backendUrl }).login(input);
    const saved = cloudSyncSettingsService.saveSession(result.token, result.user, result.workspaces);
    if (saved.workspaceId) {
      await this.downloadWorkspace();
    }
    return cloudSyncSettingsService.getSettings();
  },

  async logout(): Promise<CloudSyncSettingsView> {
    try {
      await getClient().logout();
    } catch {
      // Local logout must work even when the backend is temporarily offline.
    }
    return cloudSyncSettingsService.updateSettings({ clearSession: true, mode: "local" });
  },

  async refreshAccount(): Promise<CloudSyncSettingsView> {
    const result = await getClient().me();
    cloudSyncSettingsService.refreshSessionView(result.user, result.workspaces);
    cloudSyncSettingsService.markStatus("connected", null);
    return cloudSyncSettingsService.getSettings();
  },

  async listMembers(): Promise<CloudWorkspaceMemberView[]> {
    const { workspaceId } = requireCloudReady();
    return getClient().listMembers(workspaceId);
  },

  async inviteUser(input: CloudSyncInviteUserInput): Promise<CloudWorkspaceMemberView> {
    const { workspaceId } = requireCloudReady();
    return getClient().inviteUser(workspaceId, input);
  },

  async updateMember(input: CloudSyncUpdateMemberInput): Promise<CloudWorkspaceMemberView> {
    const { workspaceId } = requireCloudReady();
    return getClient().updateMember(workspaceId, input);
  },

  async publishLocalData(): Promise<CloudSyncSummary> {
    const startedAt = new Date().toISOString();
    try {
      const { workspaceId } = requireCloudReady();
      const changes = cloudSyncLocalStore.listChanges(true);
      const pushed = await getClient().push(workspaceId, changes);
      const syncedAt = pushed.serverTime;
      cloudSyncLocalStore.markPushed(pushed.applied, syncedAt);
      cloudSyncLocalStore.markConflicts(pushed.conflicts);
      const summary = finishSummary(startedAt, {
        status: pushed.conflicts.length > 0 ? "conflict" : "synced",
        pushed: changes.length,
        pulled: 0,
        applied: pushed.applied.length,
        conflicts: pushed.conflicts.length,
        errors: []
      });
      cloudSyncSettingsService.markSyncResult({
        status: pushed.conflicts.length > 0 ? "conflict" : "synced",
        lastSyncAt: syncedAt,
        lastPushAt: syncedAt,
        summary
      });
      return summary;
    } catch (error) {
      const safeError = toSafeCloudError(error);
      const summary = finishSummary(startedAt, {
        status: "failed",
        pushed: 0,
        pulled: 0,
        applied: 0,
        conflicts: 0,
        errors: [safeError]
      });
      cloudSyncSettingsService.markSyncResult({ status: "error", safeError, summary });
      return summary;
    }
  },

  async downloadWorkspace(): Promise<CloudSyncSummary> {
    const startedAt = new Date().toISOString();
    try {
      const { workspaceId } = requireCloudReady();
      const pulled = await getClient().bootstrap(workspaceId);
      const applied = cloudSyncLocalStore.applyRemote(pulled.entities, pulled.serverTime);
      const summary = finishSummary(startedAt, {
        status: applied.conflicts > 0 ? "conflict" : "synced",
        pushed: 0,
        pulled: pulled.entities.length,
        applied: applied.applied,
        conflicts: applied.conflicts,
        errors: []
      });
      cloudSyncSettingsService.markSyncResult({
        status: applied.conflicts > 0 ? "conflict" : "synced",
        lastSyncAt: pulled.serverTime,
        lastPullAt: pulled.serverTime,
        summary
      });
      return summary;
    } catch (error) {
      const safeError = toSafeCloudError(error);
      const summary = finishSummary(startedAt, {
        status: "failed",
        pushed: 0,
        pulled: 0,
        applied: 0,
        conflicts: 0,
        errors: [safeError]
      });
      cloudSyncSettingsService.markSyncResult({ status: "error", safeError, summary });
      return summary;
    }
  },

  async syncNow(): Promise<CloudSyncSummary> {
    const startedAt = new Date().toISOString();
    try {
      const { settings, workspaceId } = requireCloudReady();
      const client = getClient();
      const changes = cloudSyncLocalStore.listChanges(false);
      const pushed = changes.length > 0 ? await client.push(workspaceId, changes) : null;
      if (pushed) {
        cloudSyncLocalStore.markPushed(pushed.applied, pushed.serverTime);
        cloudSyncLocalStore.markConflicts(pushed.conflicts);
      }
      const pulled = await client.pull(workspaceId, settings.lastPullAt);
      const applied = cloudSyncLocalStore.applyRemote(pulled.entities, pulled.serverTime);
      const conflictCount = (pushed?.conflicts.length ?? 0) + applied.conflicts;
      const summary = finishSummary(startedAt, {
        status: conflictCount > 0 ? "conflict" : "synced",
        pushed: changes.length,
        pulled: pulled.entities.length,
        applied: (pushed?.applied.length ?? 0) + applied.applied,
        conflicts: conflictCount,
        errors: []
      });
      cloudSyncSettingsService.markSyncResult({
        status: conflictCount > 0 ? "conflict" : "synced",
        lastSyncAt: pulled.serverTime,
        lastPullAt: pulled.serverTime,
        lastPushAt: pushed?.serverTime ?? null,
        summary
      });
      return summary;
    } catch (error) {
      const safeError = toSafeCloudError(error);
      const summary = finishSummary(startedAt, {
        status: "failed",
        pushed: 0,
        pulled: 0,
        applied: 0,
        conflicts: 0,
        errors: [safeError]
      });
      cloudSyncSettingsService.markSyncResult({ status: "error", safeError, summary });
      return summary;
    }
  },

  getLastSyncSummary(): CloudSyncSummary | null {
    return cloudSyncSettingsService.getLastSummary<CloudSyncSummary>();
  }
};
