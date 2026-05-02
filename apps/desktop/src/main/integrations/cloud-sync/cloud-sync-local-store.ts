import { randomUUID } from "node:crypto";
import type { AuditEntityType, EventType, CloudSyncEntityType, CloudSyncEntityView } from "../../../shared/contracts";
import { getSqliteDatabase } from "../../database/database";
import { logger } from "../../logger";
import type { CloudSyncChange } from "./cloud-sync-client";
import { summarizeChangedFields } from "./cloud-sync-conflict-utils";
import { isSensitiveSettingKey, isSensitiveSyncKey, sanitizeSyncPayloadObjectWithStats } from "./sync-sanitizer";

const syncMetaColumns = new Set([
  "cloud_id",
  "workspace_id",
  "sync_status",
  "last_cloud_synced_at",
  "sync_revision",
  "updated_by_cloud_user_id",
  "deleted_at"
]);

const protectedColumns = new Set([
  "account_login_encrypted",
  "account_password_encrypted",
  "account_email_encrypted",
  "account_email_password_encrypted",
  "access_notes_encrypted",
  "metadata_json",
  "raw_payload"
]);

interface SyncTableConfig {
  entityType: CloudSyncEntityType;
  table: string;
  localIdColumn: string;
  updatedAtColumn: string;
  columns: string[];
  where?: string;
}

const tableConfigs: SyncTableConfig[] = [
  {
    entityType: "settings",
    table: "settings",
    localIdColumn: "key",
    updatedAtColumn: "updated_at",
    columns: ["key", "value_json", "is_secret", "updated_at"],
    where:
      "is_secret = 0 AND key NOT LIKE 'cloud_sync_%' AND key NOT LIKE 'webhook_server_%' AND key NOT LIKE 'gamemarket_%'"
  },
  {
    entityType: "products",
    table: "products",
    localIdColumn: "id",
    updatedAtColumn: "updated_at",
    columns: [
      "id",
      "internal_code",
      "external_id",
      "name",
      "category",
      "game",
      "platform",
      "listing_url",
      "sale_price_cents",
      "unit_cost_cents",
      "fee_percent",
      "net_value_cents",
      "estimated_profit_cents",
      "margin_percent",
      "stock_current",
      "stock_min",
      "status",
      "delivery_type",
      "supplier_id",
      "notes",
      "external_marketplace",
      "external_product_id",
      "external_status",
      "external_payload_hash",
      "last_synced_at",
      "created_by_user_id",
      "updated_by_user_id",
      "created_at",
      "updated_at"
    ]
  },
  {
    entityType: "product_variants",
    table: "product_variants",
    localIdColumn: "id",
    updatedAtColumn: "updated_at",
    columns: [
      "id",
      "product_id",
      "variant_code",
      "name",
      "description",
      "sale_price_cents",
      "unit_cost_cents",
      "fee_percent",
      "net_value_cents",
      "estimated_profit_cents",
      "margin_percent",
      "stock_current",
      "stock_min",
      "supplier_name",
      "supplier_url",
      "delivery_type",
      "status",
      "notes",
      "source",
      "needs_review",
      "manually_edited_at",
      "created_at",
      "updated_at"
    ]
  },
  {
    entityType: "inventory_items",
    table: "inventory_items",
    localIdColumn: "id",
    updatedAtColumn: "updated_at",
    columns: [
      "id",
      "inventory_code",
      "product_id",
      "product_variant_id",
      "supplier_id",
      "purchase_cost_cents",
      "status",
      "public_notes",
      "bought_at",
      "sold_at",
      "delivered_at",
      "order_id",
      "created_by_user_id",
      "updated_by_user_id",
      "created_at",
      "updated_at"
    ]
  },
  {
    entityType: "orders",
    table: "orders",
    localIdColumn: "id",
    updatedAtColumn: "updated_at",
    columns: [
      "id",
      "order_code",
      "external_order_id",
      "marketplace",
      "external_marketplace",
      "external_status",
      "external_payload_hash",
      "last_synced_at",
      "product_id",
      "product_variant_id",
      "inventory_item_id",
      "buyer_name",
      "buyer_contact",
      "product_name_snapshot",
      "category_snapshot",
      "sale_price_cents",
      "unit_cost_cents",
      "fee_percent",
      "net_value_cents",
      "profit_cents",
      "margin_percent",
      "status",
      "action_required",
      "marketplace_url",
      "notes",
      "created_by_user_id",
      "updated_by_user_id",
      "created_at",
      "updated_at",
      "confirmed_at",
      "delivered_at",
      "completed_at",
      "cancelled_at",
      "refunded_at"
    ]
  },
  {
    entityType: "events",
    table: "events",
    localIdColumn: "id",
    updatedAtColumn: "created_at",
    columns: [
      "id",
      "event_code",
      "source",
      "type",
      "severity",
      "title",
      "message",
      "order_id",
      "product_id",
      "inventory_item_id",
      "actor_user_id",
      "read_at",
      "created_at"
    ]
  },
  {
    entityType: "app_notifications",
    table: "app_notifications",
    localIdColumn: "id",
    updatedAtColumn: "created_at",
    columns: [
      "id",
      "type",
      "severity",
      "title",
      "message",
      "order_id",
      "external_order_id",
      "event_id",
      "dedupe_key",
      "read_at",
      "created_at"
    ]
  }
];

const configByEntityType = new Map(tableConfigs.map((config) => [config.entityType, config]));
const entityOrder = new Map(tableConfigs.map((config, index) => [config.entityType, index]));

type Row = Record<string, unknown>;

interface ForeignKeyRule {
  column: string;
  targetTable: string;
  targetColumn?: string;
  onMissing: "nullify" | "skip";
  reason: string;
}

interface DeferredForeignKey {
  table: string;
  localIdColumn: string;
  localId: string;
  column: string;
  value: string;
  targetTable: string;
  targetColumn: string;
}

interface BuiltPayload {
  payload: Record<string, unknown>;
  ignoredFields: number;
}

export interface CloudSyncLocalCollection {
  changes: CloudSyncChange[];
  ignored: number;
  entityTypes: CloudSyncEntityType[];
}

export interface CloudSyncApplyRemoteResult {
  applied: number;
  conflicts: number;
  ignored: number;
  skipped: number;
}

export interface CloudSyncApplyResolvedEntityResult {
  applied: number;
  ignored: number;
  skipped: number;
  reason: string | null;
}

const dependencyRulesByEntityType: Partial<Record<CloudSyncEntityType, ForeignKeyRule[]>> = {
  products: [
    {
      column: "created_by_user_id",
      targetTable: "users",
      onMissing: "nullify",
      reason: "Usuário local criador não existe neste desktop."
    },
    {
      column: "updated_by_user_id",
      targetTable: "users",
      onMissing: "nullify",
      reason: "Usuário local atualizador não existe neste desktop."
    }
  ],
  product_variants: [
    {
      column: "product_id",
      targetTable: "products",
      onMissing: "skip",
      reason: "Produto pai da variação não existe neste desktop."
    }
  ],
  inventory_items: [
    {
      column: "product_id",
      targetTable: "products",
      onMissing: "nullify",
      reason: "Produto do item de estoque não existe neste desktop."
    },
    {
      column: "product_variant_id",
      targetTable: "product_variants",
      onMissing: "nullify",
      reason: "Variação do item de estoque não existe neste desktop."
    },
    {
      column: "order_id",
      targetTable: "orders",
      onMissing: "nullify",
      reason: "Pedido do item de estoque não existe neste desktop."
    },
    {
      column: "created_by_user_id",
      targetTable: "users",
      onMissing: "nullify",
      reason: "Usuário local criador não existe neste desktop."
    },
    {
      column: "updated_by_user_id",
      targetTable: "users",
      onMissing: "nullify",
      reason: "Usuário local atualizador não existe neste desktop."
    }
  ],
  orders: [
    {
      column: "product_id",
      targetTable: "products",
      onMissing: "skip",
      reason: "Produto do pedido não existe neste desktop."
    },
    {
      column: "product_variant_id",
      targetTable: "product_variants",
      onMissing: "nullify",
      reason: "Variação do pedido não existe neste desktop."
    },
    {
      column: "inventory_item_id",
      targetTable: "inventory_items",
      onMissing: "nullify",
      reason: "Item de estoque do pedido não existe neste desktop."
    },
    {
      column: "created_by_user_id",
      targetTable: "users",
      onMissing: "nullify",
      reason: "Usuário local criador não existe neste desktop."
    },
    {
      column: "updated_by_user_id",
      targetTable: "users",
      onMissing: "nullify",
      reason: "Usuário local atualizador não existe neste desktop."
    }
  ],
  events: [
    {
      column: "order_id",
      targetTable: "orders",
      onMissing: "nullify",
      reason: "Pedido do evento não existe neste desktop."
    },
    {
      column: "product_id",
      targetTable: "products",
      onMissing: "nullify",
      reason: "Produto do evento não existe neste desktop."
    },
    {
      column: "inventory_item_id",
      targetTable: "inventory_items",
      onMissing: "nullify",
      reason: "Item de estoque do evento não existe neste desktop."
    },
    {
      column: "actor_user_id",
      targetTable: "users",
      onMissing: "nullify",
      reason: "Usuário local do evento não existe neste desktop."
    }
  ],
  app_notifications: [
    {
      column: "order_id",
      targetTable: "orders",
      onMissing: "nullify",
      reason: "Pedido da notificação não existe neste desktop."
    },
    {
      column: "event_id",
      targetTable: "events",
      onMissing: "nullify",
      reason: "Evento da notificação não existe neste desktop."
    }
  ]
};

const countProtectedRowFields = (row: Row, columns: string[]): number => {
  const payloadColumns = new Set(columns);
  return Object.keys(row).filter(
    (column) =>
      !syncMetaColumns.has(column) &&
      (!payloadColumns.has(column) || protectedColumns.has(column) || isSensitiveSyncKey(column)) &&
      (protectedColumns.has(column) || isSensitiveSyncKey(column))
  ).length;
};

const toPayload = (row: Row, columns: string[]): BuiltPayload => {
  const rawPayload = Object.fromEntries(
    columns
      .filter((column) => !syncMetaColumns.has(column) && !protectedColumns.has(column) && !isSensitiveSyncKey(column))
      .map((column) => [column, row[column]])
  );
  const sanitized = sanitizeSyncPayloadObjectWithStats(rawPayload);

  return {
    payload: sanitized.payload,
    ignoredFields: sanitized.ignoredFields + countProtectedRowFields(row, columns)
  };
};

const isDirtyRow = (row: Row, updatedAtColumn: string): boolean => {
  const syncStatus = String(row.sync_status ?? "pending");
  const lastSyncedAt = typeof row.last_cloud_synced_at === "string" ? row.last_cloud_synced_at : null;
  const updatedAt = typeof row[updatedAtColumn] === "string" ? row[updatedAtColumn] : null;
  return syncStatus !== "synced" || !lastSyncedAt || Boolean(updatedAt && updatedAt > lastSyncedAt);
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
  "value_json"
]);

const auditEntityTypeByCloudType: Partial<Record<CloudSyncEntityType, AuditEntityType>> = {
  products: "product",
  product_variants: "variant",
  inventory_items: "inventory",
  orders: "order"
};

const auditEventTypeByCloudType: Partial<Record<CloudSyncEntityType, EventType>> = {
  products: "audit.product_updated",
  product_variants: "audit.variant_updated",
  inventory_items: "audit.inventory_updated",
  orders: "audit.order_updated"
};

const auditFieldLabels: Record<string, string> = {
  name: "Nome",
  category: "Categoria",
  game: "Jogo",
  platform: "Plataforma",
  listing_url: "URL do anúncio",
  sale_price_cents: "Preço de venda",
  unit_cost_cents: "Custo unitário",
  fee_percent: "Taxa GameMarket %",
  stock_current: "Estoque atual",
  stock_min: "Estoque mínimo",
  status: "Status",
  external_status: "Status externo GameMarket",
  delivery_type: "Tipo de entrega",
  supplier_id: "Fornecedor",
  supplier_name: "Fornecedor",
  supplier_url: "URL do fornecedor",
  notes: "Observações",
  variant_code: "Código/SKU",
  description: "Descrição",
  needs_review: "Precisa revisar",
  purchase_cost_cents: "Custo de compra",
  public_notes: "Observações públicas",
  order_code: "Código do pedido",
  action_required: "Ação pendente",
  net_value_cents: "Valor líquido",
  estimated_profit_cents: "Lucro estimado",
  profit_cents: "Lucro snapshot",
  buyer_name: "Comprador",
  product_id: "Produto vinculado",
  product_variant_id: "Variação vinculada",
  inventory_item_id: "Item de estoque",
  completed_at: "Concluído em",
  delivered_at: "Entregue em"
};

const sensitiveValuePattern =
  /(gm_[a-z0-9._:-]+|gm[k_][a-z0-9._:-]+|bearer\s+[a-z0-9._:-]+|app_sync_token[a-z0-9._:-]*|webhook_ingest_secret[a-z0-9._:-]*|database_url[a-z0-9._:-]*)/gi;

const normalizeAuditValue = (value: unknown): string | number | boolean | null => {
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

const valuesEqual = (left: unknown, right: unknown): boolean =>
  normalizeAuditValue(left) === normalizeAuditValue(right);

const getConflictSeverity = (entityType: CloudSyncEntityType, changedFields: string[]): "low" | "medium" | "high" | "critical" => {
  if (changedFields.some((field) => isSensitiveSyncKey(field))) {
    return "critical";
  }
  if (entityType === "settings") {
    return "high";
  }
  if (entityType === "orders" || entityType === "inventory_items") {
    return "high";
  }
  if (changedFields.some((field) => highRiskFields.has(field))) {
    return "high";
  }
  if (entityType === "events" || entityType === "app_notifications") {
    return "low";
  }
  return "medium";
};

const getRecordedConflictStatus = (
  entity: CloudSyncEntityView
): { status: string; resolved_at: string | null } | null => {
  const row = getSqliteDatabase()
    .prepare(
      `
        SELECT status, resolved_at
        FROM cloud_sync_conflicts
        WHERE workspace_id = ?
          AND entity_type = ?
          AND local_id = ?
          AND cloud_id = ?
          AND remote_version = ?
        ORDER BY created_at DESC
        LIMIT 1
      `
    )
    .get(entity.workspaceId, entity.entityType, entity.localId, entity.cloudId, entity.version) as
    | { status?: string; resolved_at: string | null }
    | undefined;

  return row ? { status: row.status ?? (row.resolved_at ? "resolved_manual" : "pending"), resolved_at: row.resolved_at } : null;
};

const isOpenConflictStatus = (status: string): boolean => status === "pending" || status === "failed";

const selectRows = (config: SyncTableConfig, includeAll: boolean): Row[] => {
  const where = [config.where].filter(Boolean);
  const rows = getSqliteDatabase()
    .prepare(`SELECT * FROM ${config.table} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`)
    .all() as Row[];

  return includeAll ? rows : rows.filter((row) => isDirtyRow(row, config.updatedAtColumn));
};

const isCloudAppliedAuditEvent = (row: Row): boolean => {
  if (typeof row.raw_payload !== "string" || !String(row.type ?? "").startsWith("audit.")) {
    return false;
  }

  try {
    const payload = JSON.parse(row.raw_payload) as unknown;
    return (
      Boolean(payload) &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      (payload as Record<string, unknown>).source === "cloud_sync"
    );
  } catch {
    return false;
  }
};

const shouldSkipLocalRow = (config: SyncTableConfig, row: Row): boolean => {
  if (config.entityType === "settings" && isSensitiveSettingKey(row.key)) {
    return true;
  }

  return config.entityType === "events" && isCloudAppliedAuditEvent(row);
};

const getExistingRow = (config: SyncTableConfig, entity: CloudSyncEntityView): Row | null => {
  const db = getSqliteDatabase();
  const byCloud = db
    .prepare(`SELECT * FROM ${config.table} WHERE cloud_id = ? LIMIT 1`)
    .get(entity.cloudId) as Row | undefined;
  if (byCloud) {
    return byCloud;
  }

  return (db
    .prepare(`SELECT * FROM ${config.table} WHERE ${config.localIdColumn} = ? LIMIT 1`)
    .get(entity.localId) as Row | undefined) ?? null;
};

const toNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const rowExists = (table: string, column: string, value: string): boolean =>
  Boolean(getSqliteDatabase().prepare(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`).get(value));

const readString = (payload: Record<string, unknown>, key: string): string | null => {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const recordConflictDetected = (
  config: SyncTableConfig,
  input: {
    conflictId: string;
    entity: CloudSyncEntityView;
    changedFields: string[];
    reason: string | null;
    payload: Record<string, unknown>;
  }
): void => {
  try {
    const now = new Date().toISOString();
    getSqliteDatabase()
      .prepare(
        `
          INSERT INTO events (
            id,
            event_code,
            source,
            type,
            severity,
            title,
            message,
            order_id,
            product_id,
            inventory_item_id,
            actor_user_id,
            read_at,
            raw_payload,
            created_at
          )
          VALUES (
            @id,
            @eventCode,
            'system',
            'cloud.conflict_detected',
            @severity,
            @title,
            @message,
            @orderId,
            @productId,
            @inventoryItemId,
            NULL,
            NULL,
            @rawPayload,
            @createdAt
          )
        `
      )
      .run({
        id: randomUUID(),
        eventCode: `EVT-CLOUD-CONFLICT-DETECTED-${randomUUID().slice(0, 8).toUpperCase()}`,
        severity: config.entityType === "orders" || config.entityType === "inventory_items" ? "warning" : "info",
        title: "Conflito de sincronização detectado",
        message: `${config.entityType} ${input.entity.localId}: ${input.reason ?? "versões divergentes."}`,
        orderId:
          config.entityType === "orders"
            ? input.entity.localId
            : readString(input.payload, "order_id"),
        productId:
          config.entityType === "products"
            ? input.entity.localId
            : readString(input.payload, "product_id"),
        inventoryItemId:
          config.entityType === "inventory_items"
            ? input.entity.localId
            : readString(input.payload, "inventory_item_id"),
        rawPayload: JSON.stringify({
          conflictId: input.conflictId,
          entityType: config.entityType,
          entityId: input.entity.localId,
          changedFields: input.changedFields,
          timestamp: now
        }),
        createdAt: now
      });
  } catch (error) {
    logger.warn({ error }, "cloudSync conflict detected audit failed");
  }
};

const insertConflict = (
  config: SyncTableConfig,
  localRow: Row,
  entity: CloudSyncEntityView,
  source: "local_pull" | "cloud_push" | "manual" = "local_pull"
): void => {
  const localPayload = toPayload(localRow, config.columns).payload;
  const remotePayload = sanitizeSyncPayloadObjectWithStats(entity.payload).payload;
  const changedFields = summarizeChangedFields(localPayload, remotePayload);
  const now = new Date().toISOString();
  const conflictId = randomUUID();

  getSqliteDatabase()
    .prepare(
      `
        INSERT INTO cloud_sync_conflicts (
          id,
          workspace_id,
          entity_type,
          local_id,
          cloud_id,
          remote_version,
          incoming_base_version,
          local_payload_json,
          remote_payload_json,
          created_at,
          resolved_at,
          status,
          diff_json,
          severity,
          source,
          updated_at
        )
        VALUES (
          @id,
          @workspaceId,
          @entityType,
          @localId,
          @cloudId,
          @remoteVersion,
          @incomingBaseVersion,
          @localPayloadJson,
          @remotePayloadJson,
          @createdAt,
          NULL,
          'pending',
          @diffJson,
          @severity,
          @source,
          @updatedAt
        )
      `
    )
    .run({
      id: conflictId,
      workspaceId: entity.workspaceId,
      entityType: entity.entityType,
      localId: entity.localId,
      cloudId: entity.cloudId,
      remoteVersion: entity.version,
      incomingBaseVersion: Number(localRow.sync_revision ?? 0),
      localPayloadJson: JSON.stringify(localPayload),
      remotePayloadJson: JSON.stringify(remotePayload),
      createdAt: now,
      diffJson: JSON.stringify(changedFields),
      severity: getConflictSeverity(config.entityType, changedFields),
      source,
      updatedAt: now
    });
  recordConflictDetected(config, {
    conflictId,
    entity,
    changedFields,
    reason: null,
    payload: remotePayload
  });
};

const insertRemoteDependencyConflict = (config: SyncTableConfig, entity: CloudSyncEntityView, reason: string): void => {
  const remotePayload = sanitizeSyncPayloadObjectWithStats(entity.payload).payload;
  const changedFields = ["dependency", ...summarizeChangedFields({}, remotePayload)];
  const now = new Date().toISOString();
  const conflictId = randomUUID();

  getSqliteDatabase()
    .prepare(
      `
        INSERT INTO cloud_sync_conflicts (
          id,
          workspace_id,
          entity_type,
          local_id,
          cloud_id,
          remote_version,
          incoming_base_version,
          local_payload_json,
          remote_payload_json,
          created_at,
          resolved_at,
          status,
          diff_json,
          severity,
          source,
          last_error,
          updated_at
        )
        VALUES (
          @id,
          @workspaceId,
          @entityType,
          @localId,
          @cloudId,
          @remoteVersion,
          @incomingBaseVersion,
          @localPayloadJson,
          @remotePayloadJson,
          @createdAt,
          NULL,
          'pending',
          @diffJson,
          @severity,
          'remote_dependency',
          @lastError,
          @updatedAt
        )
      `
    )
    .run({
      id: conflictId,
      workspaceId: entity.workspaceId,
      entityType: entity.entityType,
      localId: entity.localId,
      cloudId: entity.cloudId,
      remoteVersion: entity.version,
      incomingBaseVersion: 0,
      localPayloadJson: JSON.stringify({ reason }),
      remotePayloadJson: JSON.stringify({ reason, payload: remotePayload }),
      createdAt: now,
      diffJson: JSON.stringify(changedFields),
      severity: "high",
      lastError: reason,
      updatedAt: now
    });
  recordConflictDetected(config, {
    conflictId,
    entity,
    changedFields,
    reason,
    payload: remotePayload
  });
};

const isTruthySecretFlag = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || (typeof value === "string" && value.toLowerCase() === "true");

const normalizeRemoteEntity = (
  config: SyncTableConfig,
  entity: CloudSyncEntityView
): { entity: CloudSyncEntityView | null; ignored: number; skipped: boolean; reason?: string; deferred: DeferredForeignKey[] } => {
  if (config.entityType !== "settings") {
    const payload = { ...entity.payload };
    const deferred: DeferredForeignKey[] = [];
    const ignored = 0;

    for (const rule of dependencyRulesByEntityType[config.entityType] ?? []) {
      const value = toNonEmptyString(payload[rule.column]);
      if (!value) {
        payload[rule.column] = null;
        continue;
      }

      const targetColumn = rule.targetColumn ?? "id";
      if (rowExists(rule.targetTable, targetColumn, value)) {
        continue;
      }

      if (rule.onMissing === "skip") {
        return { entity: null, ignored, skipped: true, reason: rule.reason, deferred };
      }

      payload[rule.column] = null;
      deferred.push({
        table: config.table,
        localIdColumn: config.localIdColumn,
        localId: entity.localId,
        column: rule.column,
        value,
        targetTable: rule.targetTable,
        targetColumn
      });
    }

    return {
      entity: {
        ...entity,
        payload
      },
      ignored,
      skipped: false,
      deferred
    };
  }

  const settingKey = typeof entity.payload.key === "string" ? entity.payload.key : entity.localId;
  const remoteIsSecret = isTruthySecretFlag(entity.payload.is_secret) || isTruthySecretFlag(entity.payload.isSecret);
  if (!settingKey.trim() || remoteIsSecret || isSensitiveSettingKey(settingKey)) {
    return { entity: null, ignored: 1, skipped: false, deferred: [] };
  }

  const valueJson = entity.payload.value_json ?? entity.payload.valueJson;
  if (typeof valueJson !== "string") {
    return { entity: null, ignored: 1, skipped: false, deferred: [] };
  }

  const updatedAt =
    typeof entity.payload.updated_at === "string"
      ? entity.payload.updated_at
      : typeof entity.payload.updatedAt === "string"
        ? entity.payload.updatedAt
        : entity.updatedAt;

  return {
    entity: {
      ...entity,
      localId: settingKey,
      payload: {
        ...entity.payload,
        key: settingKey,
        value_json: valueJson,
        is_secret: 0,
        updated_at: updatedAt
      }
    },
    ignored: 0,
    skipped: false,
    deferred: []
  };
};

const applyDeferredForeignKeys = (items: DeferredForeignKey[]): { restored: number; ignored: number } => {
  const db = getSqliteDatabase();
  let restored = 0;
  let ignored = 0;

  for (const item of items) {
    if (!rowExists(item.targetTable, item.targetColumn, item.value)) {
      ignored += 1;
      continue;
    }

    const result = db
      .prepare(`UPDATE ${item.table} SET ${item.column} = @value WHERE ${item.localIdColumn} = @localId`)
      .run({
        value: item.value,
        localId: item.localId
      });
    if (result.changes > 0) {
      restored += 1;
    }
  }

  return { restored, ignored };
};

const isSqliteConstraintFailure = (error: unknown): boolean =>
  error instanceof Error && /FOREIGN KEY constraint failed|constraint failed|NOT NULL constraint failed/i.test(error.message);

const upsertEntity = (config: SyncTableConfig, entity: CloudSyncEntityView, syncedAt: string): void => {
  const db = getSqliteDatabase();
  const values = {
    ...Object.fromEntries(config.columns.map((column) => [column, entity.payload[column] ?? null])),
    [config.localIdColumn]: entity.localId,
    cloud_id: entity.cloudId,
    workspace_id: entity.workspaceId,
    sync_status: "synced",
    last_cloud_synced_at: syncedAt,
    sync_revision: entity.version,
    updated_by_cloud_user_id: entity.updatedByUserId,
    deleted_at: entity.deletedAt
  };
  const columns = [
    ...config.columns,
    "cloud_id",
    "workspace_id",
    "sync_status",
    "last_cloud_synced_at",
    "sync_revision",
    "updated_by_cloud_user_id",
    "deleted_at"
  ];
  const assignments = columns
    .filter((column) => column !== config.localIdColumn)
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  db.prepare(
    `
      INSERT INTO ${config.table} (${columns.join(", ")})
      VALUES (${columns.map((column) => `@${column}`).join(", ")})
      ON CONFLICT(${config.localIdColumn}) DO UPDATE SET ${assignments}
    `
  ).run(values);
};

const recordCloudAuditApplied = (
  config: SyncTableConfig,
  before: Row | null,
  entity: CloudSyncEntityView,
  syncedAt: string
): void => {
  const auditEntityType = auditEntityTypeByCloudType[config.entityType];
  const eventType = auditEventTypeByCloudType[config.entityType];
  if (!auditEntityType || !eventType || !before) {
    return;
  }

  const changes = config.columns
    .filter((column) => !protectedColumns.has(column) && !isSensitiveSyncKey(column))
    .filter((column) => !valuesEqual(before[column], entity.payload[column] ?? null))
    .map((column) => ({
      field: column,
      label: auditFieldLabels[column] ?? column,
      before: normalizeAuditValue(before[column]),
      after: normalizeAuditValue(entity.payload[column] ?? null),
      sensitive: false
    }));

  if (changes.length === 0) {
    return;
  }

  const productId =
    config.entityType === "products"
      ? entity.localId
      : typeof entity.payload.product_id === "string"
        ? entity.payload.product_id
        : null;
  const orderId = config.entityType === "orders" ? entity.localId : null;
  const inventoryItemId = config.entityType === "inventory_items" ? entity.localId : null;

  getSqliteDatabase()
    .prepare(
      `
        INSERT INTO events (
          id,
          event_code,
          source,
          type,
          severity,
          title,
          message,
          order_id,
          product_id,
          inventory_item_id,
          actor_user_id,
          read_at,
          raw_payload,
          created_at,
          cloud_id,
          workspace_id,
          sync_status,
          last_cloud_synced_at,
          sync_revision,
          updated_by_cloud_user_id,
          deleted_at
        )
        VALUES (
          @id,
          @eventCode,
          'system',
          @type,
          'info',
          @title,
          @message,
          @orderId,
          @productId,
          @inventoryItemId,
          NULL,
          NULL,
          @rawPayload,
          @createdAt,
          NULL,
          @workspaceId,
          'synced',
          @lastCloudSyncedAt,
          0,
          @updatedByCloudUserId,
          NULL
        )
      `
    )
    .run({
      id: randomUUID(),
      eventCode: `EVT-CLOUD-AUDIT-${randomUUID().slice(0, 8).toUpperCase()}`,
      type: eventType,
      title: "Alteração aplicada pela nuvem",
      message: `${config.entityType} ${entity.localId} recebeu alteração do workspace.`,
      orderId,
      productId,
      inventoryItemId,
      rawPayload: JSON.stringify({
        audit: true,
        source: "cloud_sync",
        action: "updated",
        entityType: auditEntityType,
        entityId: entity.localId,
        relatedProductId: productId,
        relatedVariantId: config.entityType === "product_variants" ? entity.localId : entity.payload.product_variant_id ?? null,
        relatedOrderId: orderId,
        actorName: entity.updatedByUserId ? "Cloud workspace" : "Cloud",
        cloudUserId: entity.updatedByUserId,
        changes,
        timestamp: syncedAt
      }),
      createdAt: syncedAt,
      workspaceId: entity.workspaceId,
      lastCloudSyncedAt: syncedAt,
      updatedByCloudUserId: entity.updatedByUserId
    });
};

export const cloudSyncLocalStore = {
  collectChanges(includeAll = false): CloudSyncLocalCollection {
    let ignored = 0;
    const changes: CloudSyncChange[] = [];

    for (const config of tableConfigs) {
      for (const row of selectRows(config, includeAll)) {
        if (shouldSkipLocalRow(config, row)) {
          ignored += 1;
          continue;
        }

        const builtPayload = toPayload(row, config.columns);
        ignored += builtPayload.ignoredFields;

        changes.push({
          entityType: config.entityType,
          localId: String(row[config.localIdColumn]),
          ...(typeof row.cloud_id === "string" ? { cloudId: row.cloud_id } : {}),
          baseVersion: Number(row.sync_revision ?? 0),
          updatedAt:
            typeof row[config.updatedAtColumn] === "string"
              ? (row[config.updatedAtColumn] as string)
              : new Date().toISOString(),
          deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
          payload: builtPayload.payload
        });
      }
    }

    return {
      changes,
      ignored,
      entityTypes: [...new Set(changes.map((change) => change.entityType))]
    };
  },

  listChanges(includeAll = false): CloudSyncChange[] {
    return this.collectChanges(includeAll).changes;
  },

  markPushed(entities: CloudSyncEntityView[], syncedAt: string): void {
    const db = getSqliteDatabase();
    const transaction = db.transaction((items: CloudSyncEntityView[]) => {
      for (const entity of items) {
        const config = configByEntityType.get(entity.entityType);
        if (!config) {
          continue;
        }
        db.prepare(
          `
            UPDATE ${config.table}
            SET
              cloud_id = @cloudId,
              workspace_id = @workspaceId,
              sync_status = 'synced',
              last_cloud_synced_at = @syncedAt,
              sync_revision = @syncRevision,
              updated_by_cloud_user_id = @updatedByCloudUserId,
              deleted_at = @deletedAt
            WHERE ${config.localIdColumn} = @localId
          `
        ).run({
          cloudId: entity.cloudId,
          workspaceId: entity.workspaceId,
          syncedAt,
          syncRevision: entity.version,
          updatedByCloudUserId: entity.updatedByUserId,
          deletedAt: entity.deletedAt,
          localId: entity.localId
        });
      }
    });
    transaction(entities);
  },

  markConflicts(conflicts: Array<{ entityType: string; localId: string }>): void {
    const db = getSqliteDatabase();
    for (const conflict of conflicts) {
      const config = configByEntityType.get(conflict.entityType as CloudSyncEntityType);
      if (!config) {
        continue;
      }
      db.prepare(`UPDATE ${config.table} SET sync_status = 'conflict' WHERE ${config.localIdColumn} = ?`).run(
        conflict.localId
      );
    }
  },

  markResolutionPending(entityType: CloudSyncEntityType, localId: string, baseVersion?: number): void {
    const config = configByEntityType.get(entityType);
    if (!config) {
      throw new Error("Tipo de entidade não suportado para resolução de conflito.");
    }

    const result = getSqliteDatabase()
      .prepare(
        `
          UPDATE ${config.table}
          SET
            sync_status = 'pending',
            sync_revision = CASE WHEN @baseVersion IS NULL THEN sync_revision ELSE @baseVersion END
          WHERE ${config.localIdColumn} = @localId
        `
      )
      .run({ localId, baseVersion: baseVersion ?? null });
    if (result.changes === 0) {
      throw new Error("Registro local do conflito não foi encontrado.");
    }
  },

  applyResolvedRemoteEntity(entity: CloudSyncEntityView, syncedAt: string): CloudSyncApplyResolvedEntityResult {
    const config = configByEntityType.get(entity.entityType);
    if (!config) {
      return { applied: 0, ignored: 1, skipped: 0, reason: "Tipo de entidade não suportado." };
    }

    const normalized = normalizeRemoteEntity(config, entity);
    if (normalized.skipped) {
      return {
        applied: 0,
        ignored: normalized.ignored,
        skipped: 1,
        reason: normalized.reason ?? "Dependência obrigatória ausente."
      };
    }
    if (!normalized.entity) {
      return {
        applied: 0,
        ignored: Math.max(1, normalized.ignored),
        skipped: 0,
        reason: "Payload remoto foi ignorado por conter configuração sensível ou inválida."
      };
    }

    try {
      const localRow = getExistingRow(config, normalized.entity);
      upsertEntity(config, normalized.entity, syncedAt);
      recordCloudAuditApplied(config, localRow, normalized.entity, syncedAt);
      const deferred = applyDeferredForeignKeys(normalized.deferred);
      return {
        applied: 1,
        ignored: normalized.ignored + deferred.ignored,
        skipped: 0,
        reason: deferred.ignored > 0 ? "Algumas referências locais ausentes foram preservadas sem quebrar o banco." : null
      };
    } catch (error) {
      if (!isSqliteConstraintFailure(error)) {
        throw error;
      }

      return {
        applied: 0,
        ignored: normalized.ignored,
        skipped: 1,
        reason: "Versão remota não pôde ser aplicada por violar uma restrição local."
      };
    }
  },

  applyManualResolutionEntity(entity: CloudSyncEntityView, actorUserId: string, syncedAt: string): CloudSyncApplyResolvedEntityResult {
    const result = this.applyResolvedRemoteEntity(
      {
        ...entity,
        updatedByUserId: actorUserId,
        updatedAt: syncedAt
      },
      syncedAt
    );
    if (result.applied === 0) {
      return result;
    }

    this.markResolutionPending(entity.entityType, entity.localId, entity.version);
    return result;
  },

  applyRemote(entities: CloudSyncEntityView[], syncedAt: string): CloudSyncApplyRemoteResult {
    const ordered = [...entities].sort(
      (left, right) =>
        (entityOrder.get(left.entityType) ?? 100) - (entityOrder.get(right.entityType) ?? 100) ||
        left.updatedAt.localeCompare(right.updatedAt)
    );
    let applied = 0;
    let conflicts = 0;
    let ignored = 0;
    let skipped = 0;
    const deferredForeignKeys: DeferredForeignKey[] = [];
    const db = getSqliteDatabase();
    const transaction = db.transaction((items: CloudSyncEntityView[]) => {
      for (const entity of items) {
        const config = configByEntityType.get(entity.entityType);
        if (!config) {
          continue;
        }
        const normalized = normalizeRemoteEntity(config, entity);
        ignored += normalized.ignored;
        if (normalized.skipped) {
          skipped += 1;
          const recorded = getRecordedConflictStatus(entity);
          if (!recorded) {
            conflicts += 1;
            insertRemoteDependencyConflict(config, entity, normalized.reason ?? "Dependência obrigatória ausente.");
          } else if (isOpenConflictStatus(recorded.status)) {
            conflicts += 1;
          } else {
            ignored += 1;
          }
          continue;
        }
        if (!normalized.entity) {
          continue;
        }

        const localRow = getExistingRow(config, normalized.entity);
        if (localRow && isDirtyRow(localRow, config.updatedAtColumn)) {
          if (Number(localRow.sync_revision ?? 0) < normalized.entity.version) {
            const recorded = getRecordedConflictStatus(normalized.entity);
            if (!recorded) {
              insertConflict(config, localRow, normalized.entity);
              conflicts += 1;
            } else if (isOpenConflictStatus(recorded.status)) {
              conflicts += 1;
            } else {
              ignored += 1;
            }
          } else {
            ignored += 1;
          }
          continue;
        }
        try {
          upsertEntity(config, normalized.entity, syncedAt);
          recordCloudAuditApplied(config, localRow, normalized.entity, syncedAt);
          deferredForeignKeys.push(...normalized.deferred);
          applied += 1;
        } catch (error) {
          if (!isSqliteConstraintFailure(error)) {
            throw error;
          }

          skipped += 1;
          const recorded = getRecordedConflictStatus(normalized.entity);
          if (!recorded) {
            conflicts += 1;
            insertRemoteDependencyConflict(
              config,
              normalized.entity,
              "Registro remoto não pôde ser aplicado por violar uma restrição local."
            );
          } else if (isOpenConflictStatus(recorded.status)) {
            conflicts += 1;
          } else {
            ignored += 1;
          }
        }
      }

      ignored += applyDeferredForeignKeys(deferredForeignKeys).ignored;
    });
    transaction(ordered);
    return { applied, conflicts, ignored, skipped };
  }
};
