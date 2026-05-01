import { randomUUID } from "node:crypto";
import type { CloudSyncEntityType, CloudSyncEntityView } from "../../../shared/contracts";
import { getSqliteDatabase } from "../../database/database";
import type { CloudSyncChange } from "./cloud-sync-client";
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
  },
  {
    entityType: "settings",
    table: "settings",
    localIdColumn: "key",
    updatedAtColumn: "updated_at",
    columns: ["key", "value_json", "is_secret", "updated_at"],
    where:
      "is_secret = 0 AND key NOT LIKE 'cloud_sync_%' AND key NOT LIKE 'webhook_server_%' AND key NOT LIKE 'gamemarket_%'"
  }
];

const configByEntityType = new Map(tableConfigs.map((config) => [config.entityType, config]));
const entityOrder = new Map(tableConfigs.map((config, index) => [config.entityType, index]));

type Row = Record<string, unknown>;

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
}

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

const selectRows = (config: SyncTableConfig, includeAll: boolean): Row[] => {
  const where = [config.where].filter(Boolean);
  const rows = getSqliteDatabase()
    .prepare(`SELECT * FROM ${config.table} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`)
    .all() as Row[];

  return includeAll ? rows : rows.filter((row) => isDirtyRow(row, config.updatedAtColumn));
};

const shouldSkipLocalRow = (config: SyncTableConfig, row: Row): boolean =>
  config.entityType === "settings" && isSensitiveSettingKey(row.key);

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

const insertConflict = (config: SyncTableConfig, localRow: Row, entity: CloudSyncEntityView): void => {
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
          resolved_at
        )
        VALUES (@id, @workspaceId, @entityType, @localId, @cloudId, @remoteVersion, @incomingBaseVersion, @localPayloadJson, @remotePayloadJson, @createdAt, NULL)
      `
    )
    .run({
      id: randomUUID(),
      workspaceId: entity.workspaceId,
      entityType: entity.entityType,
      localId: entity.localId,
      cloudId: entity.cloudId,
      remoteVersion: entity.version,
      incomingBaseVersion: Number(localRow.sync_revision ?? 0),
      localPayloadJson: JSON.stringify(toPayload(localRow, config.columns).payload),
      remotePayloadJson: JSON.stringify(entity.payload),
      createdAt: new Date().toISOString()
    });
};

const isTruthySecretFlag = (value: unknown): boolean =>
  value === true || value === 1 || value === "1" || (typeof value === "string" && value.toLowerCase() === "true");

const normalizeRemoteEntity = (
  config: SyncTableConfig,
  entity: CloudSyncEntityView
): { entity: CloudSyncEntityView | null; ignored: number } => {
  if (config.entityType !== "settings") {
    return { entity, ignored: 0 };
  }

  const settingKey = typeof entity.payload.key === "string" ? entity.payload.key : entity.localId;
  const remoteIsSecret = isTruthySecretFlag(entity.payload.is_secret) || isTruthySecretFlag(entity.payload.isSecret);
  if (!settingKey.trim() || remoteIsSecret || isSensitiveSettingKey(settingKey)) {
    return { entity: null, ignored: 1 };
  }

  const valueJson = entity.payload.value_json ?? entity.payload.valueJson;
  if (typeof valueJson !== "string") {
    return { entity: null, ignored: 1 };
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
    ignored: 0
  };
};

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

  applyRemote(entities: CloudSyncEntityView[], syncedAt: string): CloudSyncApplyRemoteResult {
    const ordered = [...entities].sort(
      (left, right) =>
        (entityOrder.get(left.entityType) ?? 100) - (entityOrder.get(right.entityType) ?? 100) ||
        left.updatedAt.localeCompare(right.updatedAt)
    );
    let applied = 0;
    let conflicts = 0;
    let ignored = 0;
    const db = getSqliteDatabase();
    const transaction = db.transaction((items: CloudSyncEntityView[]) => {
      for (const entity of items) {
        const config = configByEntityType.get(entity.entityType);
        if (!config) {
          continue;
        }
        const normalized = normalizeRemoteEntity(config, entity);
        ignored += normalized.ignored;
        if (!normalized.entity) {
          continue;
        }

        const localRow = getExistingRow(config, normalized.entity);
        if (
          localRow &&
          isDirtyRow(localRow, config.updatedAtColumn) &&
          Number(localRow.sync_revision ?? 0) < normalized.entity.version
        ) {
          insertConflict(config, localRow, normalized.entity);
          conflicts += 1;
        }
        upsertEntity(config, normalized.entity, syncedAt);
        applied += 1;
      }
    });
    transaction(ordered);
    return { applied, conflicts, ignored };
  }
};
