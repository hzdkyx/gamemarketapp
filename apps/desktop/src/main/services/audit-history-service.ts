import type {
  AuditChange,
  AuditEntityType,
  AuditHistoryEntry,
  AuditSource,
  EventRecord,
  EventSource,
  EventType,
  ListAuditHistoryInput,
  ListAuditHistoryResult,
} from "../../shared/contracts";
import { getSqliteDatabase } from "../database/database";
import { eventService } from "./event-service";

type AuditValue = string | number | boolean | null;

interface AuditEventRow {
  id: string;
  event_code: string;
  source: EventSource;
  type: EventType;
  severity: EventRecord["severity"];
  title: string;
  message: string | null;
  order_id: string | null;
  product_id: string | null;
  inventory_item_id: string | null;
  actor_user_id: string | null;
  actor_user_name: string | null;
  raw_payload: string | null;
  created_at: string;
}

export interface AuditFieldDefinition<T> {
  field: string;
  label: string;
  read: (record: T) => unknown;
}

export interface AuditRecordInput {
  entityType: AuditEntityType;
  entityId: string;
  source: AuditSource;
  action: string;
  title: string;
  message?: string | null;
  changes: AuditChange[];
  actorUserId?: string | null;
  relatedProductId?: string | null;
  relatedVariantId?: string | null;
  relatedOrderId?: string | null;
  inventoryItemId?: string | null;
  eventType?: EventType;
  createdAt?: string;
}

const sourceLabels: Record<AuditSource, string> = {
  manual: "Manual",
  cloud_sync: "Cloud",
  gamemarket_api: "GameMarket",
  webhook: "Webhook",
  backup_restore: "Backup",
  system: "Sistema",
  migration: "Migração",
  local_auth: "Auth local",
  unknown: "Indisponível",
};

const auditEventTypeByEntity: Record<AuditEntityType, EventType> = {
  product: "audit.product_updated",
  variant: "audit.variant_updated",
  inventory: "audit.inventory_updated",
  order: "audit.order_updated",
};

const sensitiveKeyPattern =
  /(password|senha|token|secret|api.?key|webhook|app.?sync|database.?url|login|e-?mail|email|serial|credential|encrypted|payload|account)/i;
const sensitiveValuePattern =
  /(gm_[a-z0-9._:-]+|gm[k_][a-z0-9._:-]+|bearer\s+[a-z0-9._:-]+|app_sync_token[a-z0-9._:-]*|webhook_ingest_secret[a-z0-9._:-]*|database_url[a-z0-9._:-]*)/gi;

const nowIso = (): string => new Date().toISOString();

const normalizeAuditValue = (value: unknown): AuditValue => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value.replace(sensitiveValuePattern, "[mascarado]");
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return JSON.stringify(value).replace(sensitiveValuePattern, "[mascarado]");
};

const valuesEqual = (left: AuditValue, right: AuditValue): boolean => {
  if (typeof left === "number" && typeof right === "number") {
    return Math.abs(left - right) < 0.000001;
  }

  return left === right;
};

const rawValuesEqual = (left: unknown, right: unknown): boolean => {
  if (typeof left === "number" && typeof right === "number") {
    return Math.abs(left - right) < 0.000001;
  }

  if (
    (typeof left === "string" || typeof left === "boolean" || left === null || left === undefined) &&
    (typeof right === "string" || typeof right === "boolean" || right === null || right === undefined)
  ) {
    return left === right;
  }

  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
};

export const buildAuditChanges = <T>(
  before: T | null,
  after: T,
  fields: Array<AuditFieldDefinition<T>>,
): AuditChange[] =>
  fields.flatMap((definition) => {
    const sensitive = sensitiveKeyPattern.test(definition.field) || sensitiveKeyPattern.test(definition.label);
    const beforeRawValue = before ? definition.read(before) : null;
    const afterRawValue = definition.read(after);
    const beforeValue = normalizeAuditValue(beforeRawValue);
    const afterValue = normalizeAuditValue(afterRawValue);

    if (before && (sensitive ? rawValuesEqual(beforeRawValue, afterRawValue) : valuesEqual(beforeValue, afterValue))) {
      return [];
    }

    return [
      {
        field: definition.field,
        label: sensitive ? "Campo sensível alterado" : definition.label,
        before: sensitive ? null : beforeValue,
        after: sensitive ? null : afterValue,
        sensitive,
      },
    ];
  });

const safeChanges = (changes: AuditChange[]): AuditChange[] =>
  changes.map((change) => {
    const sensitive =
      change.sensitive || sensitiveKeyPattern.test(change.field) || sensitiveKeyPattern.test(change.label);

    return {
      field: change.field,
      label: sensitive ? "Campo sensível alterado" : change.label,
      before: sensitive ? null : normalizeAuditValue(change.before),
      after: sensitive ? null : normalizeAuditValue(change.after),
      sensitive,
    };
  });

const eventSourceForAudit = (source: AuditSource): EventSource => {
  if (source === "manual") {
    return "manual";
  }

  if (source === "gamemarket_api") {
    return "gamemarket_api";
  }

  if (source === "webhook") {
    return "webhook_server";
  }

  return "system";
};

const parsePayload = (payload: string | null): Record<string, unknown> | null => {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const readString = (payload: Record<string, unknown> | null, key: string): string | null => {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const readAuditSource = (event: Pick<AuditEventRow, "source" | "type">, payload: Record<string, unknown> | null): AuditSource => {
  const explicit = readString(payload, "source");
  if (explicit && explicit in sourceLabels) {
    return explicit as AuditSource;
  }

  if (event.source === "manual") return "manual";
  if (event.source === "gamemarket_api" || event.type.startsWith("integration.gamemarket.")) return "gamemarket_api";
  if (event.source === "webhook_server" || event.type.startsWith("integration.webhook_server.")) return "webhook";
  if (event.type.startsWith("cloud.")) return "cloud_sync";
  if (event.type.startsWith("auth.")) return "local_auth";
  if (event.type.startsWith("system.backup_") || event.type.startsWith("system.restore_")) return "backup_restore";
  if (event.source === "system") return "system";
  return "unknown";
};

const readAuditEntityType = (
  fallback: AuditEntityType,
  payload: Record<string, unknown> | null,
): AuditEntityType => {
  const value = readString(payload, "entityType");
  return value === "product" || value === "variant" || value === "order" || value === "inventory"
    ? value
    : fallback;
};

const readChanges = (payload: Record<string, unknown> | null): AuditChange[] => {
  const changes = payload?.changes;
  if (!Array.isArray(changes)) {
    return [];
  }

  return safeChanges(
    changes.flatMap((change): AuditChange[] => {
      if (!change || typeof change !== "object" || Array.isArray(change)) {
        return [];
      }
      const item = change as Record<string, unknown>;
      const field = typeof item.field === "string" ? item.field : "unknown";
      const label = typeof item.label === "string" ? item.label : field;
      return [
        {
          field,
          label,
          before: normalizeAuditValue(item.before),
          after: normalizeAuditValue(item.after),
          sensitive: item.sensitive === true,
        },
      ];
    }),
  );
};

const likeJsonString = (key: string, value: string): string => `%"${key}":%"${value}"%`;

const buildEntityWhere = (input: ListAuditHistoryInput): { sql: string; params: Record<string, unknown> } => {
  const where: string[] = [];
  const params: Record<string, unknown> = {
    entityId: input.entityId,
    rawEntityId: likeJsonString("entityId", input.entityId),
  };

  if (input.entityType === "product") {
    where.push("(events.product_id = @entityId OR events.raw_payload LIKE @rawEntityId OR events.raw_payload LIKE @rawRelatedProductId)");
    params.rawRelatedProductId = likeJsonString("relatedProductId", input.entityId);
  }

  if (input.entityType === "variant") {
    where.push("(events.raw_payload LIKE @rawEntityId OR events.raw_payload LIKE @rawRelatedVariantId)");
    params.rawRelatedVariantId = likeJsonString("relatedVariantId", input.entityId);
  }

  if (input.entityType === "order") {
    where.push("(events.order_id = @entityId OR events.raw_payload LIKE @rawEntityId OR events.raw_payload LIKE @rawRelatedOrderId)");
    params.rawRelatedOrderId = likeJsonString("relatedOrderId", input.entityId);
  }

  if (input.entityType === "inventory") {
    where.push("(events.inventory_item_id = @entityId OR events.raw_payload LIKE @rawEntityId)");
  }

  if (input.search) {
    where.push(`(
      LOWER(events.event_code) LIKE @search OR
      LOWER(events.type) LIKE @search OR
      LOWER(events.title) LIKE @search OR
      LOWER(COALESCE(events.message, '')) LIKE @search OR
      LOWER(COALESCE(users.name, '')) LIKE @search OR
      LOWER(COALESCE(events.raw_payload, '')) LIKE @search
    )`);
    params.search = `%${input.search.toLowerCase()}%`;
  }

  if (input.source !== "all") {
    where.push(`(
      events.raw_payload LIKE @rawSource OR
      (@source = 'manual' AND events.source = 'manual') OR
      (@source = 'gamemarket_api' AND (events.source = 'gamemarket_api' OR events.type LIKE 'integration.gamemarket.%')) OR
      (@source = 'webhook' AND (events.source = 'webhook_server' OR events.type LIKE 'integration.webhook_server.%')) OR
      (@source = 'cloud_sync' AND events.type LIKE 'cloud.%') OR
      (@source = 'local_auth' AND events.type LIKE 'auth.%') OR
      (@source = 'backup_restore' AND (events.type LIKE 'system.backup_%' OR events.type LIKE 'system.restore_%')) OR
      (@source = 'system' AND events.source = 'system')
    )`);
    params.source = input.source;
    params.rawSource = likeJsonString("source", input.source);
  }

  return {
    sql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
};

const mapRow = (row: AuditEventRow, fallbackEntityType: AuditEntityType, fallbackEntityId: string): AuditHistoryEntry => {
  const payload = parsePayload(row.raw_payload);
  const changes = readChanges(payload);
  const source = readAuditSource(row, payload);
  const entityType = readAuditEntityType(fallbackEntityType, payload);

  return {
    id: row.id,
    eventCode: row.event_code,
    eventType: row.type,
    title: row.title,
    message: row.message,
    source,
    sourceLabel: sourceLabels[source],
    entityType,
    entityId: readString(payload, "entityId") ?? fallbackEntityId,
    relatedProductId: readString(payload, "relatedProductId") ?? row.product_id,
    relatedVariantId: readString(payload, "relatedVariantId"),
    relatedOrderId: readString(payload, "relatedOrderId") ?? row.order_id,
    actorId: row.actor_user_id ?? readString(payload, "actorId"),
    actorName: row.actor_user_name ?? readString(payload, "actorName") ?? (source === "manual" ? "Indisponível" : sourceLabels[source]),
    createdAt: row.created_at,
    changes,
    detailUnavailable: changes.length === 0,
  };
};

export const auditHistoryService = {
  buildChanges: buildAuditChanges,

  record(input: AuditRecordInput): EventRecord | null {
    const changes = safeChanges(input.changes);
    if (changes.length === 0) {
      return null;
    }

    const eventType =
      input.eventType ??
      (input.entityType === "order" && input.action === "status_changed"
        ? "audit.order_status_changed"
        : auditEventTypeByEntity[input.entityType] ?? "audit.entity_history_recorded");

    return eventService.createInternal({
      source: eventSourceForAudit(input.source),
      type: eventType,
      severity: "info",
      title: input.title,
      message: input.message ?? null,
      orderId: input.relatedOrderId ?? (input.entityType === "order" ? input.entityId : null),
      productId: input.relatedProductId ?? (input.entityType === "product" ? input.entityId : null),
      inventoryItemId: input.inventoryItemId ?? (input.entityType === "inventory" ? input.entityId : null),
      actorUserId: input.actorUserId ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
      rawPayload: {
        audit: true,
        source: input.source,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        relatedProductId: input.relatedProductId ?? null,
        relatedVariantId: input.relatedVariantId ?? null,
        relatedOrderId: input.relatedOrderId ?? null,
        actorId: input.actorUserId ?? null,
        changes,
        timestamp: input.createdAt ?? nowIso(),
      },
    });
  },

  list(input: ListAuditHistoryInput): ListAuditHistoryResult {
    const db = getSqliteDatabase();
    const where = buildEntityWhere(input);
    const rows = db
      .prepare(
        `
          SELECT
            events.id,
            events.event_code,
            events.source,
            events.type,
            events.severity,
            events.title,
            events.message,
            events.order_id,
            events.product_id,
            events.inventory_item_id,
            events.actor_user_id,
            users.name AS actor_user_name,
            events.raw_payload,
            events.created_at
          FROM events
          LEFT JOIN users ON users.id = events.actor_user_id
          ${where.sql}
          ORDER BY events.created_at DESC, events.id DESC
          LIMIT @scanLimit
        `,
      )
      .all({ ...where.params, scanLimit: Math.max(500, input.limit + input.offset) }) as AuditEventRow[];

    const mapped = rows
      .map((row) => mapRow(row, input.entityType, input.entityId))
      .filter((entry) => input.source === "all" || entry.source === input.source);
    const items = mapped.slice(input.offset, input.offset + input.limit);

    return {
      items,
      total: mapped.length,
      limit: input.limit,
      offset: input.offset,
      nextOffset: input.offset + input.limit < mapped.length ? input.offset + input.limit : null,
      sources: Array.from(new Set(mapped.map((entry) => entry.source))),
    };
  },
};
