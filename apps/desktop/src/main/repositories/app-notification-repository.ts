import type {
  AppNotificationListInput,
  AppNotificationListResult,
  AppNotificationRecord,
  AppNotificationSummary,
  AppNotificationType,
  EventSeverity,
} from "../../shared/contracts";
import { getSqliteDatabase } from "../database/database";

interface AppNotificationRow {
  id: string;
  type: AppNotificationType;
  severity: EventSeverity;
  title: string;
  message: string;
  order_id: string | null;
  external_order_id: string | null;
  event_id: string | null;
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
  metadata_json: string | null;
}

export interface AppNotificationWriteRecord {
  id: string;
  type: AppNotificationType;
  severity: EventSeverity;
  title: string;
  message: string;
  orderId: string | null;
  externalOrderId: string | null;
  eventId: string | null;
  dedupeKey: string | null;
  readAt: string | null;
  createdAt: string;
  metadataJson: string | null;
}

const mapNotificationRow = (row: AppNotificationRow): AppNotificationRecord => ({
  id: row.id,
  type: row.type,
  severity: row.severity,
  title: row.title,
  message: row.message,
  orderId: row.order_id,
  externalOrderId: row.external_order_id,
  eventId: row.event_id,
  dedupeKey: row.dedupe_key,
  readAt: row.read_at,
  createdAt: row.created_at,
  metadataJson: row.metadata_json,
});

const selectNotifications = `
  SELECT
    id,
    type,
    severity,
    title,
    message,
    order_id,
    external_order_id,
    event_id,
    dedupe_key,
    read_at,
    created_at,
    metadata_json
  FROM app_notifications
`;

export const appNotificationRepository = {
  getById(id: string): AppNotificationRecord | null {
    const row = getSqliteDatabase()
      .prepare(`${selectNotifications} WHERE id = ?`)
      .get(id) as AppNotificationRow | undefined;

    return row ? mapNotificationRow(row) : null;
  },

  getByDedupeKey(dedupeKey: string): AppNotificationRecord | null {
    const row = getSqliteDatabase()
      .prepare(`${selectNotifications} WHERE dedupe_key = ?`)
      .get(dedupeKey) as AppNotificationRow | undefined;

    return row ? mapNotificationRow(row) : null;
  },

  insert(notification: AppNotificationWriteRecord): AppNotificationRecord {
    getSqliteDatabase()
      .prepare(
        `
          INSERT INTO app_notifications (
            id,
            type,
            severity,
            title,
            message,
            order_id,
            external_order_id,
            event_id,
            dedupe_key,
            read_at,
            created_at,
            metadata_json
          )
          VALUES (
            @id,
            @type,
            @severity,
            @title,
            @message,
            @orderId,
            @externalOrderId,
            @eventId,
            @dedupeKey,
            @readAt,
            @createdAt,
            @metadataJson
          )
        `,
      )
      .run(notification);

    const created = this.getById(notification.id);
    if (!created) {
      throw new Error("Notificação local não foi criada.");
    }

    return created;
  },

  list(input: AppNotificationListInput): AppNotificationListResult {
    const where = input.unreadOnly ? "WHERE read_at IS NULL" : "";
    const rows = getSqliteDatabase()
      .prepare(
        `${selectNotifications} ${where} ORDER BY created_at DESC, id DESC LIMIT @limit`,
      )
      .all({ limit: input.limit }) as AppNotificationRow[];

    return {
      items: rows.map(mapNotificationRow),
      summary: this.getSummary(),
    };
  },

  markRead(id: string, readAt: string): AppNotificationRecord {
    const result = getSqliteDatabase()
      .prepare("UPDATE app_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?")
      .run(readAt, id);

    if (result.changes === 0) {
      throw new Error("Notificação local não encontrada.");
    }

    const notification = this.getById(id);
    if (!notification) {
      throw new Error("Notificação local não encontrada.");
    }

    return notification;
  },

  markAllRead(readAt: string): { updated: number } {
    const result = getSqliteDatabase()
      .prepare("UPDATE app_notifications SET read_at = ? WHERE read_at IS NULL")
      .run(readAt);

    return { updated: result.changes };
  },

  getSummary(): AppNotificationSummary {
    const row = getSqliteDatabase()
      .prepare(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread,
            SUM(CASE WHEN read_at IS NULL AND type = 'new_sale' THEN 1 ELSE 0 END) AS unread_new_sales,
            SUM(CASE WHEN read_at IS NULL AND severity = 'critical' THEN 1 ELSE 0 END) AS critical_unread
          FROM app_notifications
        `,
      )
      .get() as {
      total: number;
      unread: number | null;
      unread_new_sales: number | null;
      critical_unread: number | null;
    };

    return {
      total: row.total ?? 0,
      unread: row.unread ?? 0,
      unreadNewSales: row.unread_new_sales ?? 0,
      criticalUnread: row.critical_unread ?? 0,
    };
  },
};
