import type {
  CloudAuditLogView,
  CloudSyncBootstrapOwnerInput,
  CloudSyncChangePasswordInput,
  CloudSyncEntityType,
  CloudSyncInviteUserInput,
  CloudSyncLoginInput,
  CloudSyncMemberActionInput,
  CloudSyncRemoveMemberInput,
  CloudSyncResetMemberPasswordInput,
  CloudSyncSettingsUpdateInput,
  CloudSyncSettingsView,
  CloudSyncSummary,
  CloudSyncUpdateMemberInput,
  CloudWorkspaceMemberView
} from "../../../shared/contracts";
import { logger } from "../../logger";
import { CloudSyncClient, type CloudSyncStatusResponse } from "./cloud-sync-client";
import { cloudSyncLocalStore } from "./cloud-sync-local-store";
import { cloudSyncSettingsService } from "./cloud-sync-settings-service";

const toSafeCloudError = (error: unknown): string =>
  error instanceof Error
    ? error.message.match(/FOREIGN KEY constraint failed/i)
      ? "Falha ao baixar workspace: alguns dados dependem de produtos/variações ainda não encontrados. Nenhum dado sensível foi alterado. Tente novamente após atualização."
      : error.message.match(/entities|invalid_type|expected array|Zod/i)
      ? "Falha ao enviar dados locais: o pacote de sincronização estava vazio ou inválido. Nenhum dado foi alterado."
      : error.message.replace(/Bearer\s+[A-Za-z0-9._~-]+/g, "Bearer [masked]")
    : "Falha no cloud sync.";

const maskWorkspaceId = (workspaceId: string): string =>
  workspaceId.length <= 8 ? "[masked]" : `${workspaceId.slice(0, 4)}...${workspaceId.slice(-4)}`;

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

const getWorkspaceStatusOrNull = async (
  client: CloudSyncClient,
  workspaceId: string,
  since: string | null
): Promise<CloudSyncStatusResponse | null> => {
  try {
    return await client.status(workspaceId, since);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Cloud sync HTTP 404") || message.includes("Cloud sync HTTP 405")) {
      return null;
    }

    throw error;
  }
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
    if (saved.workspaceId && !result.user.mustChangePassword) {
      await this.downloadWorkspace();
    }
    return cloudSyncSettingsService.getSettings();
  },

  async changePassword(input: CloudSyncChangePasswordInput): Promise<CloudSyncSettingsView> {
    const result = await getClient().changePassword(input);
    cloudSyncSettingsService.refreshSessionView(result.user, result.workspaces);
    cloudSyncSettingsService.markStatus("connected", null);
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

  async disableWorkspaceMember(input: CloudSyncMemberActionInput): Promise<CloudWorkspaceMemberView> {
    const { workspaceId } = requireCloudReady();
    return getClient().disableMember(workspaceId, input);
  },

  async enableWorkspaceMember(input: CloudSyncMemberActionInput): Promise<CloudWorkspaceMemberView> {
    const { workspaceId } = requireCloudReady();
    return getClient().enableMember(workspaceId, input);
  },

  async removeWorkspaceMember(input: CloudSyncRemoveMemberInput): Promise<CloudWorkspaceMemberView> {
    const { workspaceId } = requireCloudReady();
    return getClient().removeMember(workspaceId, input);
  },

  async resetWorkspaceMemberPassword(input: CloudSyncResetMemberPasswordInput): Promise<CloudWorkspaceMemberView> {
    const { workspaceId } = requireCloudReady();
    return getClient().resetMemberPassword(workspaceId, input);
  },

  async listWorkspaceMemberAudit(input: CloudSyncMemberActionInput): Promise<CloudAuditLogView[]> {
    const { workspaceId } = requireCloudReady();
    return getClient().listMemberAudit(workspaceId, input.userId);
  },

  async publishLocalData(): Promise<CloudSyncSummary> {
    const startedAt = new Date().toISOString();
    let workspaceIdForLog: string | null = null;
    let collected = 0;
    let ignored = 0;
    let entityTypes: CloudSyncEntityType[] = [];
    try {
      const { workspaceId } = requireCloudReady();
      workspaceIdForLog = workspaceId;
      cloudSyncSettingsService.markStatus("syncing", null);
      const collection = cloudSyncLocalStore.collectChanges(true);
      const changes = collection.changes;
      collected = changes.length;
      ignored = collection.ignored;
      entityTypes = collection.entityTypes;
      logger.info(
        {
          workspaceId: maskWorkspaceId(workspaceId),
          entityCount: changes.length,
          entityTypes,
          ignoredFields: ignored
        },
        "cloudSync publishLocalData started"
      );
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
        collected,
        ignored,
        skipped: 0,
        entityTypes,
        errors: []
      });
      cloudSyncSettingsService.markSyncResult({
        status: pushed.conflicts.length > 0 ? "conflict" : "synced",
        lastSyncAt: syncedAt,
        lastPushAt: syncedAt,
        summary
      });
      logger.info(
        {
          workspaceId: maskWorkspaceId(workspaceId),
          entityCount: changes.length,
          entityTypes,
          ignoredFields: ignored,
          durationMs: summary.durationMs,
          status: summary.status
        },
        "cloudSync publishLocalData finished"
      );
      return summary;
    } catch (error) {
      const safeError = toSafeCloudError(error);
      const summary = finishSummary(startedAt, {
        status: "failed",
        pushed: 0,
        pulled: 0,
        applied: 0,
        conflicts: 0,
        collected,
        ignored,
        skipped: 0,
        entityTypes,
        errors: [safeError]
      });
      cloudSyncSettingsService.markSyncResult({ status: "error", safeError, summary });
      logger.warn(
        {
          workspaceId: workspaceIdForLog ? maskWorkspaceId(workspaceIdForLog) : null,
          entityCount: collected,
          entityTypes,
          ignoredFields: ignored,
          durationMs: summary.durationMs,
          status: summary.status
        },
        "cloudSync publishLocalData failed"
      );
      return summary;
    }
  },

  async downloadWorkspace(): Promise<CloudSyncSummary> {
    const startedAt = new Date().toISOString();
    try {
      const { workspaceId } = requireCloudReady();
      cloudSyncSettingsService.markStatus("syncing", null);
      const pulled = await getClient().bootstrap(workspaceId);
      const applied = cloudSyncLocalStore.applyRemote(pulled.entities, pulled.serverTime);
      const conflictCount = applied.conflicts;
      const summary = finishSummary(startedAt, {
        status: conflictCount > 0 ? "conflict" : "synced",
        pushed: 0,
        pulled: pulled.entities.length,
        applied: applied.applied,
        conflicts: conflictCount,
        collected: 0,
        ignored: applied.ignored,
        skipped: applied.skipped,
        entityTypes: [...new Set(pulled.entities.map((entity) => entity.entityType))],
        errors: []
      });
      cloudSyncSettingsService.markSyncResult({
        status: conflictCount > 0 ? "conflict" : "synced",
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
        collected: 0,
        ignored: 0,
        skipped: 0,
        entityTypes: [],
        errors: [safeError]
      });
      cloudSyncSettingsService.markSyncResult({ status: "error", safeError, summary });
      return summary;
    }
  },

  async syncNow(): Promise<CloudSyncSummary> {
    const startedAt = new Date().toISOString();
    let workspaceIdForLog: string | null = null;
    let collected = 0;
    let ignored = 0;
    let entityTypes: CloudSyncEntityType[] = [];
    try {
      const { settings, workspaceId } = requireCloudReady();
      workspaceIdForLog = workspaceId;
      const client = getClient();
      cloudSyncSettingsService.markStatus("syncing", null);
      const collection = cloudSyncLocalStore.collectChanges(false);
      const changes = collection.changes;
      collected = changes.length;
      ignored = collection.ignored;
      entityTypes = collection.entityTypes;
      logger.info(
        {
          workspaceId: maskWorkspaceId(workspaceId),
          entityCount: changes.length,
          entityTypes,
          ignoredFields: ignored
        },
        "cloudSync syncNow started"
      );
      const workspaceStatus = await getWorkspaceStatusOrNull(client, workspaceId, settings.lastPullAt);
      const pushed = changes.length > 0 ? await client.push(workspaceId, changes) : null;
      if (pushed) {
        cloudSyncLocalStore.markPushed(pushed.applied, pushed.serverTime);
        cloudSyncLocalStore.markConflicts(pushed.conflicts);
      }
      const shouldPull = !workspaceStatus || workspaceStatus.pendingServerChanges > 0;
      const pulled = shouldPull ? await client.pull(workspaceId, settings.lastPullAt) : null;
      const applied = pulled
        ? cloudSyncLocalStore.applyRemote(pulled.entities, pulled.serverTime)
        : { applied: 0, conflicts: 0, ignored: 0, skipped: 0 };
      const conflictCount = (pushed?.conflicts.length ?? 0) + applied.conflicts;
      const syncServerTime = pulled?.serverTime ?? pushed?.serverTime ?? workspaceStatus?.serverTime ?? new Date().toISOString();
      const summary = finishSummary(startedAt, {
        status: conflictCount > 0 ? "conflict" : "synced",
        pushed: changes.length,
        pulled: pulled?.entities.length ?? 0,
        applied: (pushed?.applied.length ?? 0) + applied.applied,
        conflicts: conflictCount,
        collected,
        ignored: ignored + applied.ignored,
        skipped: applied.skipped,
        entityTypes,
        errors: []
      });
      cloudSyncSettingsService.markSyncResult({
        status: conflictCount > 0 ? "conflict" : "synced",
        lastSyncAt: syncServerTime,
        lastPullAt: pulled?.serverTime ?? workspaceStatus?.serverTime ?? null,
        lastPushAt: pushed?.serverTime ?? null,
        summary
      });
      logger.info(
        {
          workspaceId: maskWorkspaceId(workspaceId),
          entityCount: changes.length,
          entityTypes,
          ignoredFields: ignored,
          durationMs: summary.durationMs,
          status: summary.status
        },
        "cloudSync syncNow finished"
      );
      return summary;
    } catch (error) {
      const safeError = toSafeCloudError(error);
      const summary = finishSummary(startedAt, {
        status: "failed",
        pushed: 0,
        pulled: 0,
        applied: 0,
        conflicts: 0,
        collected,
        ignored,
        skipped: 0,
        entityTypes,
        errors: [safeError]
      });
      cloudSyncSettingsService.markSyncResult({ status: "error", safeError, summary });
      logger.warn(
        {
          workspaceId: workspaceIdForLog ? maskWorkspaceId(workspaceIdForLog) : null,
          entityCount: collected,
          entityTypes,
          ignoredFields: ignored,
          durationMs: summary.durationMs,
          status: summary.status
        },
        "cloudSync syncNow failed"
      );
      return summary;
    }
  },

  getLastSyncSummary(): CloudSyncSummary | null {
    return cloudSyncSettingsService.getLastSummary<CloudSyncSummary>();
  }
};
