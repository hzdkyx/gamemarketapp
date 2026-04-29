import { getSqliteDatabase } from "../database/database";
import type {
  EventListInput,
  EventRecord,
  EventSeverity,
  EventSource,
  EventSummary,
  EventType
} from "../../shared/contracts";

interface EventRow {
  id: string;
  event_code: string;
  source: EventSource;
  type: EventType;
  severity: EventSeverity;
  title: string;
  message: string | null;
  order_id: string | null;
  order_code: string | null;
  product_id: string | null;
  product_name: string | null;
  inventory_item_id: string | null;
  inventory_code: string | null;
  actor_user_id: string | null;
  actor_user_name: string | null;
  read_at: string | null;
  raw_payload: string | null;
  created_at: string;
}

export interface EventWriteRecord {
  id: string;
  eventCode: string;
  source: EventSource;
  type: EventType;
  severity: EventSeverity;
  title: string;
  message: string | null;
  orderId: string | null;
  productId: string | null;
  inventoryItemId: string | null;
  actorUserId: string | null;
  readAt: string | null;
  rawPayload: string | null;
  createdAt: string;
}

const mapEventRow = (row: EventRow): EventRecord => ({
  id: row.id,
  eventCode: row.event_code,
  source: row.source,
  type: row.type,
  severity: row.severity,
  title: row.title,
  message: row.message,
  orderId: row.order_id,
  orderCode: row.order_code,
  productId: row.product_id,
  productName: row.product_name,
  inventoryItemId: row.inventory_item_id,
  inventoryCode: row.inventory_code,
  actorUserId: row.actor_user_id,
  actorUserName: row.actor_user_name,
  readAt: row.read_at,
  rawPayload: row.raw_payload,
  createdAt: row.created_at
});

const eventSelect = `
  SELECT
    events.id,
    events.event_code,
    events.source,
    events.type,
    events.severity,
    events.title,
    events.message,
    events.order_id,
    orders.order_code,
    events.product_id,
    products.name AS product_name,
    events.inventory_item_id,
    inventory_items.inventory_code,
    events.actor_user_id,
    users.name AS actor_user_name,
    events.read_at,
    events.raw_payload,
    events.created_at
  FROM events
  LEFT JOIN orders ON orders.id = events.order_id
  LEFT JOIN products ON products.id = events.product_id
  LEFT JOIN inventory_items ON inventory_items.id = events.inventory_item_id
  LEFT JOIN users ON users.id = events.actor_user_id
`;

const buildEventWhere = (filters: EventListInput): { sql: string; params: Record<string, unknown> } => {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.search) {
    where.push(`(
      LOWER(events.event_code) LIKE @search OR
      LOWER(events.type) LIKE @search OR
      LOWER(events.title) LIKE @search OR
      LOWER(COALESCE(events.message, '')) LIKE @search OR
      LOWER(COALESCE(orders.order_code, '')) LIKE @search OR
      LOWER(COALESCE(products.name, '')) LIKE @search OR
      LOWER(COALESCE(inventory_items.inventory_code, '')) LIKE @search
    )`);
    params.search = `%${filters.search.toLowerCase()}%`;
  }

  if (filters.type !== "all") {
    where.push("events.type = @type");
    params.type = filters.type;
  }

  if (filters.severity !== "all") {
    where.push("events.severity = @severity");
    params.severity = filters.severity;
  }

  if (filters.orderId) {
    where.push("events.order_id = @orderId");
    params.orderId = filters.orderId;
  }

  if (filters.productId) {
    where.push("events.product_id = @productId");
    params.productId = filters.productId;
  }

  if (filters.read === "read") {
    where.push("events.read_at IS NOT NULL");
  }

  if (filters.read === "unread") {
    where.push("events.read_at IS NULL");
  }

  if (filters.dateFrom) {
    where.push("events.created_at >= @dateFrom");
    params.dateFrom = filters.dateFrom;
  }

  if (filters.dateTo) {
    where.push("events.created_at <= @dateTo");
    params.dateTo = filters.dateTo;
  }

  return {
    sql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
};

export const eventRepository = {
  list(filters: EventListInput): EventRecord[] {
    const db = getSqliteDatabase();
    const where = buildEventWhere(filters);
    const rows = db
      .prepare(`${eventSelect} ${where.sql} ORDER BY events.created_at DESC, events.id DESC`)
      .all(where.params) as EventRow[];

    return rows.map(mapEventRow);
  },

  listLatest(limit: number): EventRecord[] {
    const db = getSqliteDatabase();
    const rows = db
      .prepare(`${eventSelect} ORDER BY events.created_at DESC, events.id DESC LIMIT ?`)
      .all(limit) as EventRow[];

    return rows.map(mapEventRow);
  },

  listByOrderId(orderId: string): EventRecord[] {
    const db = getSqliteDatabase();
    const rows = db
      .prepare(`${eventSelect} WHERE events.order_id = ? ORDER BY events.created_at ASC, events.id ASC`)
      .all(orderId) as EventRow[];

    return rows.map(mapEventRow);
  },

  getById(id: string): EventRecord | null {
    const db = getSqliteDatabase();
    const row = db.prepare(`${eventSelect} WHERE events.id = ?`).get(id) as EventRow | undefined;
    return row ? mapEventRow(row) : null;
  },

  insert(event: EventWriteRecord): EventRecord {
    const db = getSqliteDatabase();
    db.prepare(
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
          @source,
          @type,
          @severity,
          @title,
          @message,
          @orderId,
          @productId,
          @inventoryItemId,
          @actorUserId,
          @readAt,
          @rawPayload,
          @createdAt
        )
      `
    ).run(event);

    const created = this.getById(event.id);
    if (!created) {
      throw new Error("Evento não foi criado.");
    }

    return created;
  },

  markRead(id: string, readAt: string): EventRecord {
    const db = getSqliteDatabase();
    const result = db.prepare("UPDATE events SET read_at = COALESCE(read_at, ?) WHERE id = ?").run(readAt, id);

    if (result.changes === 0) {
      throw new Error("Evento não encontrado.");
    }

    const updated = this.getById(id);
    if (!updated) {
      throw new Error("Evento não encontrado.");
    }

    return updated;
  },

  markAllRead(readAt: string): number {
    const db = getSqliteDatabase();
    const result = db.prepare("UPDATE events SET read_at = ? WHERE read_at IS NULL").run(readAt);
    return result.changes;
  },

  getSummary(): EventSummary {
    const db = getSqliteDatabase();
    const row = db
      .prepare(
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread,
            SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical,
            SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS warnings
          FROM events
        `
      )
      .get() as {
      total: number;
      unread: number | null;
      critical: number | null;
      warnings: number | null;
    };

    return {
      total: row.total ?? 0,
      unread: row.unread ?? 0,
      critical: row.critical ?? 0,
      warnings: row.warnings ?? 0
    };
  }
};
