import type {
  CloudRole,
  CloudSyncConflictDetail,
  CloudSyncConflictFieldDiff,
  CloudSyncConflictListInput,
  CloudSyncConflictListItem,
  CloudSyncConflictListResult,
  CloudSyncConflictResolutionResult,
  CloudSyncConflictResolutionType,
  CloudSyncConflictSeverity,
  CloudSyncConflictSource,
  CloudSyncConflictStatus,
  CloudSyncEntityType,
  CloudSyncEntityView,
} from "../../../shared/contracts";
import { getSqliteDatabase } from "../../database/database";
import { logger } from "../../logger";
import { eventService } from "../../services/event-service";
import { cloudSyncLocalStore } from "./cloud-sync-local-store";
import {
  buildConflictDiff,
  parseConflictPayload,
  sanitizeConflictPayload,
  summarizeChangedFields,
} from "./cloud-sync-conflict-utils";
import { cloudSyncSettingsService } from "./cloud-sync-settings-service";
import { isSensitiveSettingKey, isSensitiveSyncKey, sanitizeSyncPayloadObjectWithStats } from "./sync-sanitizer";

interface ConflictRow {
  id: string;
  workspace_id: string;
  entity_type: CloudSyncEntityType;
  local_id: string;
  cloud_id: string;
  remote_version: number;
  incoming_base_version: number;
  local_payload_json: string;
  remote_payload_json: string;
  created_at: string;
  resolved_at: string | null;
  status?: CloudSyncConflictStatus | null;
  resolved_by_local_user_id?: string | null;
  resolution_type?: CloudSyncConflictResolutionType | null;
  resolution_note?: string | null;
  diff_json?: string | null;
  severity?: CloudSyncConflictSeverity | null;
  source?: CloudSyncConflictSource | null;
  last_error?: string | null;
  updated_at?: string | null;
}

const defaultFilters: CloudSyncConflictListInput = {
  status: "pending",
  entityType: "all",
  severity: "all",
  source: "all",
  search: "",
  dateFrom: null,
  dateTo: null,
  limit: 100,
};

const entityLabels: Record<CloudSyncEntityType, string> = {
  products: "Produto",
  product_variants: "Variação",
  inventory_items: "Estoque operacional",
  orders: "Pedido",
  events: "Evento",
  app_notifications: "Notificação",
  settings: "Configuração",
};

const highRiskFields = new Set([
  "status",
  "external_status",
  "sale_price_cents",
  "unit_cost_cents",
  "purchase_cost_cents",
  "net_value_cents",
  "estimated_profit_cents",
  "profit_cents",
  "margin_percent",
  "stock_current",
  "stock_min",
  "value_json",
]);

const lockedManualFields = new Set([
  "id",
  "key",
  "created_at",
  "cloud_id",
  "workspace_id",
  "sync_status",
  "last_cloud_synced_at",
  "sync_revision",
  "updated_by_cloud_user_id",
  "deleted_at",
]);

const normalizeStatus = (row: ConflictRow): CloudSyncConflictStatus =>
  row.status ?? (row.resolved_at ? "resolved_manual" : "pending");

const normalizeSeverity = (row: ConflictRow, changedFields: string[]): CloudSyncConflictSeverity => {
  if (row.severity) {
    return row.severity;
  }
  if (changedFields.some((field) => isSensitiveSyncKey(field))) {
    return "critical";
  }
  if (row.entity_type === "settings" || row.entity_type === "orders" || row.entity_type === "inventory_items") {
    return "high";
  }
  if (changedFields.some((field) => highRiskFields.has(field))) {
    return "high";
  }
  if (row.entity_type === "events" || row.entity_type === "app_notifications") {
    return "low";
  }
  return "medium";
};

const normalizeSource = (row: ConflictRow): CloudSyncConflictSource =>
  row.source ?? (extractReason(parseConflictPayload(row.local_payload_json), parseConflictPayload(row.remote_payload_json)) ? "remote_dependency" : "local_pull");

const readRows = (): ConflictRow[] =>
  getSqliteDatabase().prepare("SELECT * FROM cloud_sync_conflicts").all() as ConflictRow[];

const readRow = (id: string): ConflictRow => {
  const row = readRows().find((item) => item.id === id);
  if (!row) {
    throw new Error("Conflito de sincronização não encontrado.");
  }
  return row;
};

const parseDiffJson = (value: string | null | undefined): string[] => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

const extractRemotePayload = (payload: Record<string, unknown>): Record<string, unknown> =>
  payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload)
    ? (payload.payload as Record<string, unknown>)
    : payload;

const extractReason = (
  localPayload: Record<string, unknown>,
  remotePayload: Record<string, unknown>,
): string | null => {
  const reason = localPayload.reason ?? remotePayload.reason;
  return typeof reason === "string" && reason.trim().length > 0 ? reason : null;
};

const readString = (payload: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
};

const getEntityLabel = (
  entityType: CloudSyncEntityType,
  localPayload: Record<string, unknown>,
  remotePayload: Record<string, unknown>,
  fallbackId: string,
): string => {
  const payload = { ...remotePayload, ...localPayload };
  const label = readString(payload, [
    "name",
    "variant_code",
    "inventory_code",
    "order_code",
    "event_code",
    "title",
    "key",
    "product_name_snapshot",
  ]);
  return label ? `${entityLabels[entityType]}: ${label}` : `${entityLabels[entityType]} ${fallbackId}`;
};

const getActor = (payload: Record<string, unknown>): string | null =>
  readString(payload, ["updated_by_user_id", "created_by_user_id", "actor_user_id", "updatedByUserId"]);

const getUpdatedAt = (payload: Record<string, unknown>): string | null =>
  readString(payload, ["updated_at", "updatedAt", "created_at", "createdAt"]);

const isOpenStatus = (status: CloudSyncConflictStatus): boolean => status === "pending" || status === "failed";

const canRoleResolve = (role: CloudRole | null): boolean => role === "owner" || role === "admin" || role === "manager";

const canResolveCurrentWorkspace = (): boolean => {
  const settings = cloudSyncSettingsService.getSettings();
  return Boolean(
    settings.mode === "cloud" &&
      settings.hasSession &&
      settings.workspaceId &&
      !settings.currentUser?.mustChangePassword &&
      canRoleResolve(settings.workspaceRole),
  );
};

const requireResolutionPermission = (): void => {
  const settings = cloudSyncSettingsService.getSettings();
  if (settings.mode !== "cloud" || !settings.hasSession || !settings.workspaceId) {
    throw new Error("Faça login na conta cloud e selecione um workspace para resolver conflitos.");
  }
  if (settings.currentUser?.mustChangePassword) {
    throw new Error("Troque a senha cloud temporária antes de resolver conflitos.");
  }
  if (!canRoleResolve(settings.workspaceRole)) {
    throw new Error("Apenas owner, admin ou manager podem resolver conflitos de sincronização.");
  }
};

const toListItem = (row: ConflictRow): CloudSyncConflictListItem => {
  const rawLocalPayload = parseConflictPayload(row.local_payload_json);
  const rawRemotePayload = parseConflictPayload(row.remote_payload_json);
  const localPayload = rawLocalPayload;
  const remotePayload = extractRemotePayload(rawRemotePayload);
  const sanitizedLocal = sanitizeConflictPayload(localPayload);
  const sanitizedRemote = sanitizeConflictPayload(remotePayload);
  const omittedSensitiveFields = [...new Set([...sanitizedLocal.omittedFields, ...sanitizedRemote.omittedFields])];
  const diffFields =
    parseDiffJson(row.diff_json).length > 0
      ? parseDiffJson(row.diff_json)
      : summarizeChangedFields(sanitizedLocal.payload, sanitizedRemote.payload, omittedSensitiveFields);

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    entityType: row.entity_type,
    entityLabel: getEntityLabel(row.entity_type, sanitizedLocal.payload, sanitizedRemote.payload, row.local_id),
    localId: row.local_id,
    cloudId: row.cloud_id,
    status: normalizeStatus(row),
    severity: normalizeSeverity(row, diffFields),
    source: normalizeSource(row),
    remoteVersion: Number(row.remote_version),
    incomingBaseVersion: Number(row.incoming_base_version),
    localVersion: Number.isFinite(Number(row.incoming_base_version)) ? Number(row.incoming_base_version) : null,
    affectedFields: diffFields,
    reason: row.last_error ?? extractReason(rawLocalPayload, rawRemotePayload),
    lastError: row.last_error ?? null,
    localActorUserId: getActor(sanitizedLocal.payload),
    remoteActorUserId: getActor(sanitizedRemote.payload),
    localUpdatedAt: getUpdatedAt(sanitizedLocal.payload),
    remoteUpdatedAt: getUpdatedAt(sanitizedRemote.payload),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.resolved_at ?? row.created_at,
    resolvedAt: row.resolved_at,
    resolutionType: row.resolution_type ?? null,
    resolutionNote: row.resolution_note ?? null,
  };
};

const toDetail = (row: ConflictRow): CloudSyncConflictDetail => {
  const item = toListItem(row);
  const rawLocalPayload = parseConflictPayload(row.local_payload_json);
  const rawRemotePayload = extractRemotePayload(parseConflictPayload(row.remote_payload_json));
  const sanitizedLocal = sanitizeConflictPayload(rawLocalPayload);
  const sanitizedRemote = sanitizeConflictPayload(rawRemotePayload);
  const omittedSensitiveFields = [...new Set([...sanitizedLocal.omittedFields, ...sanitizedRemote.omittedFields])];
  const diff = buildConflictDiff(sanitizedLocal.payload, sanitizedRemote.payload, omittedSensitiveFields);
  const editableFields = diff
    .filter((field) => field.changed && !field.sensitive && !lockedManualFields.has(field.field))
    .map((field) => field.field);

  return {
    ...item,
    localPayload: sanitizedLocal.payload,
    remotePayload: sanitizedRemote.payload,
    diff,
    editableFields,
    omittedSensitiveFields,
    sensitiveFieldsOmitted: omittedSensitiveFields.length > 0,
    canResolve: canResolveCurrentWorkspace() && isOpenStatus(item.status),
    safeMessage:
      omittedSensitiveFields.length > 0
        ? "Campos sensíveis foram omitidos e não serão aplicados por esta tela."
        : null,
  };
};

const filterRows = (rows: ConflictRow[], filters: CloudSyncConflictListInput): ConflictRow[] => {
  const search = filters.search.trim().toLowerCase();
  const fromTime = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
  const toTime = filters.dateTo ? new Date(filters.dateTo).getTime() : null;

  return rows.filter((row) => {
    const item = toListItem(row);
    const createdTime = new Date(item.createdAt).getTime();
    if (filters.status !== "all" && item.status !== filters.status) {
      return false;
    }
    if (filters.entityType !== "all" && item.entityType !== filters.entityType) {
      return false;
    }
    if (filters.severity !== "all" && item.severity !== filters.severity) {
      return false;
    }
    if (filters.source !== "all" && item.source !== filters.source) {
      return false;
    }
    if (fromTime !== null && createdTime < fromTime) {
      return false;
    }
    if (toTime !== null && createdTime > toTime) {
      return false;
    }
    if (!search) {
      return true;
    }

    return [
      item.entityType,
      item.entityLabel,
      item.localId,
      item.cloudId,
      item.status,
      item.severity,
      item.source,
      item.reason,
      ...item.affectedFields,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
};

const markConflict = (
  row: ConflictRow,
  status: CloudSyncConflictStatus,
  resolutionType: CloudSyncConflictResolutionType | null,
  actorUserId: string | null,
  note: string | null,
  lastError: string | null,
): void => {
  const now = new Date().toISOString();
  getSqliteDatabase()
    .prepare(
      `
        UPDATE cloud_sync_conflicts
        SET
          status = @status,
          resolved_at = @resolvedAt,
          resolved_by_local_user_id = @actorUserId,
          resolution_type = @resolutionType,
          resolution_note = @note,
          last_error = @lastError,
          updated_at = @updatedAt
        WHERE id = @id
      `,
    )
    .run({
      id: row.id,
      status,
      resolvedAt: status === "failed" ? row.resolved_at : now,
      actorUserId,
      resolutionType,
      note,
      lastError,
      updatedAt: now,
    });
};

const audit = (
  action: "cloud.conflict_resolved_local" | "cloud.conflict_resolved_remote" | "cloud.conflict_resolved_manual" | "cloud.conflict_ignored" | "cloud.conflict_resolution_failed",
  detail: CloudSyncConflictDetail,
  actorUserId: string | null,
  resolutionType: CloudSyncConflictResolutionType,
): void => {
  try {
    eventService.createInternal({
      source: "system",
      type: action,
      severity: action === "cloud.conflict_resolution_failed" ? "warning" : "info",
      title: "Conflito de sincronização atualizado",
      message: `${entityLabels[detail.entityType]} ${detail.localId}: ${resolutionType}.`,
      actorUserId,
      rawPayload: {
        conflictId: detail.id,
        entityType: detail.entityType,
        entityId: detail.localId,
        resolutionType,
        changedFields: detail.affectedFields,
        actorUserId,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.warn({ error }, "cloudSync conflict audit failed");
  }
};

const toEntityView = (
  row: ConflictRow,
  payload: Record<string, unknown>,
  actorUserId: string,
  now: string,
): CloudSyncEntityView => ({
  cloudId: row.cloud_id,
  workspaceId: row.workspace_id,
  entityType: row.entity_type,
  localId: row.local_id,
  payload: sanitizeSyncPayloadObjectWithStats(payload).payload,
  version: Number(row.remote_version),
  updatedByUserId: actorUserId,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
});

const safeRemotePayload = (row: ConflictRow): Record<string, unknown> =>
  sanitizeSyncPayloadObjectWithStats(extractRemotePayload(parseConflictPayload(row.remote_payload_json))).payload;

const safeLocalPayload = (row: ConflictRow): Record<string, unknown> =>
  sanitizeSyncPayloadObjectWithStats(parseConflictPayload(row.local_payload_json)).payload;

const assertManualPayloadSafe = (detail: CloudSyncConflictDetail, payload: Record<string, unknown>): Record<string, unknown> => {
  const allowedFields = new Set(detail.editableFields);
  const safeEntries = Object.entries(payload).filter(([key]) => allowedFields.has(key) && !isSensitiveSyncKey(key));
  if (safeEntries.length === 0) {
    throw new Error("Informe pelo menos um campo permitido para resolver manualmente.");
  }
  return Object.fromEntries(safeEntries);
};

export const cloudSyncConflictService = {
  list(input: Partial<CloudSyncConflictListInput> = {}): CloudSyncConflictListResult {
    const filters: CloudSyncConflictListInput = { ...defaultFilters, ...input };
    const rows = readRows();
    const filteredRows = filterRows(rows, filters).sort((left, right) => right.created_at.localeCompare(left.created_at));
    const items = filteredRows.slice(0, filters.limit).map(toListItem);

    return {
      items,
      total: filteredRows.length,
      pending: rows.map(toListItem).filter((item) => isOpenStatus(item.status)).length,
      filters,
    };
  },

  getDetail(id: string): CloudSyncConflictDetail {
    return toDetail(readRow(id));
  },

  resolve(
    input: {
      id: string;
      resolutionType: CloudSyncConflictResolutionType;
      manualPayload?: Record<string, unknown> | undefined;
      note?: string | undefined;
      confirm?: boolean | undefined;
    },
    actorUserId: string,
  ): CloudSyncConflictResolutionResult {
    requireResolutionPermission();
    const row = readRow(input.id);
    const detail = toDetail(row);
    if (!isOpenStatus(detail.status)) {
      throw new Error("Este conflito já foi resolvido ou arquivado.");
    }
    if (input.resolutionType === "ignore" && input.confirm !== true) {
      throw new Error("Confirme a ação para ignorar o conflito.");
    }
    if (row.entity_type === "settings" && isSensitiveSettingKey(safeRemotePayload(row).key ?? row.local_id)) {
      throw new Error("Configuração sensível não pode ser aplicada pela resolução de conflitos.");
    }

    try {
      const now = new Date().toISOString();
      if (input.resolutionType === "keep_local") {
        cloudSyncLocalStore.markResolutionPending(row.entity_type, row.local_id, Number(row.remote_version));
        markConflict(row, "resolved_local", "keep_local", actorUserId, input.note ?? null, null);
        const resolved = this.getDetail(row.id);
        audit("cloud.conflict_resolved_local", resolved, actorUserId, "keep_local");
        return {
          conflict: resolved,
          status: "resolved_local",
          pushScheduled: true,
          safeMessage: "Versão local mantida. O próximo cloud sync enviará a versão local segura.",
        };
      }

      if (input.resolutionType === "use_remote") {
        const result = cloudSyncLocalStore.applyResolvedRemoteEntity(
          toEntityView(row, safeRemotePayload(row), actorUserId, now),
          now,
        );
        if (result.applied === 0) {
          throw new Error(result.reason ?? "Versão da nuvem não pôde ser aplicada com segurança.");
        }
        markConflict(row, "resolved_remote", "use_remote", actorUserId, input.note ?? null, result.reason);
        const resolved = this.getDetail(row.id);
        audit("cloud.conflict_resolved_remote", resolved, actorUserId, "use_remote");
        return {
          conflict: resolved,
          status: "resolved_remote",
          pushScheduled: false,
          safeMessage: result.reason ?? "Versão da nuvem aplicada no banco local.",
        };
      }

      if (input.resolutionType === "manual") {
        const manualPayload = assertManualPayloadSafe(detail, input.manualPayload ?? {});
        const basePayload = safeLocalPayload(row);
        const mergedPayload = {
          ...basePayload,
          ...manualPayload,
        };
        if ("updated_at" in mergedPayload) {
          mergedPayload.updated_at = now;
        }
        const result = cloudSyncLocalStore.applyManualResolutionEntity(toEntityView(row, mergedPayload, actorUserId, now), actorUserId, now);
        if (result.applied === 0) {
          throw new Error(result.reason ?? "Resolução manual não pôde ser aplicada com segurança.");
        }
        markConflict(row, "resolved_manual", "manual", actorUserId, input.note ?? null, result.reason);
        const resolved = this.getDetail(row.id);
        audit("cloud.conflict_resolved_manual", resolved, actorUserId, "manual");
        return {
          conflict: resolved,
          status: "resolved_manual",
          pushScheduled: true,
          safeMessage: result.reason ?? "Resolução manual salva localmente e agendada para envio.",
        };
      }

      markConflict(row, "ignored", "ignore", actorUserId, input.note ?? null, null);
      const resolved = this.getDetail(row.id);
      audit("cloud.conflict_ignored", resolved, actorUserId, "ignore");
      return {
        conflict: resolved,
        status: "ignored",
        pushScheduled: false,
        safeMessage: "Conflito arquivado sem alterar dados locais.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao resolver conflito.";
      markConflict(row, "failed", input.resolutionType, actorUserId, input.note ?? null, message);
      audit("cloud.conflict_resolution_failed", detail, actorUserId, input.resolutionType);
      throw new Error(message.replace(/Bearer\s+[A-Za-z0-9._~-]+/g, "Bearer [masked]"));
    }
  },

  buildDiff(localPayload: Record<string, unknown>, remotePayload: Record<string, unknown>): CloudSyncConflictFieldDiff[] {
    const sanitizedLocal = sanitizeConflictPayload(localPayload);
    const sanitizedRemote = sanitizeConflictPayload(remotePayload);
    return buildConflictDiff(sanitizedLocal.payload, sanitizedRemote.payload, [
      ...sanitizedLocal.omittedFields,
      ...sanitizedRemote.omittedFields,
    ]);
  },
};
