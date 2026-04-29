import { mkdirSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type {
  EventCreateInput,
  EventListFilters,
  EventListItem,
  StoredWebhookEvent,
} from "../contracts/event-contracts.js";
import { runPostgresMigrations } from "../db/migrations.js";

const { Pool } = pg;

export interface EventStorageService {
  initialize(): Promise<void>;
  createEvent(input: EventCreateInput): Promise<StoredWebhookEvent>;
  listEvents(filters: EventListFilters): Promise<EventListItem[]>;
  getEvent(id: string): Promise<StoredWebhookEvent | null>;
  ackEvent(id: string, ackedAt: string): Promise<StoredWebhookEvent | null>;
  close(): Promise<void>;
}

interface EventRow {
  id: string;
  external_event_id: string | null;
  event_type: StoredWebhookEvent["eventType"];
  source: StoredWebhookEvent["source"];
  severity: StoredWebhookEvent["severity"];
  title: string;
  message: string;
  raw_payload_masked: unknown;
  payload_hash: string;
  headers_masked: unknown;
  ip_address: string | null;
  user_agent: string | null;
  acked_at: string | null;
  created_at: string;
  received_at: string;
}

const parseJson = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const rowToStoredEvent = (row: EventRow): StoredWebhookEvent => ({
  id: row.id,
  externalEventId: row.external_event_id,
  eventType: row.event_type,
  source: row.source,
  severity: row.severity,
  title: row.title,
  message: row.message,
  rawPayloadMasked: parseJson(row.raw_payload_masked),
  payloadHash: row.payload_hash,
  headersMasked: (parseJson(row.headers_masked) ?? {}) as Record<string, unknown>,
  ipAddress: row.ip_address,
  userAgent: row.user_agent,
  ackedAt: row.acked_at,
  createdAt: new Date(row.created_at).toISOString(),
  receivedAt: new Date(row.received_at).toISOString(),
});

const toListItem = (event: StoredWebhookEvent): EventListItem => {
  return {
    id: event.id,
    externalEventId: event.externalEventId,
    eventType: event.eventType,
    source: event.source,
    severity: event.severity,
    title: event.title,
    message: event.message,
    payloadHash: event.payloadHash,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    ackedAt: event.ackedAt,
    createdAt: event.createdAt,
    receivedAt: event.receivedAt,
    hasRawPayload: true,
  };
};

export class LocalFileEventStorage implements EventStorageService {
  private events: StoredWebhookEvent[] = [];

  constructor(private readonly storagePath: string) {}

  async initialize(): Promise<void> {
    if (this.storagePath === ":memory:") {
      this.events = [];
      return;
    }

    mkdirSync(dirname(this.storagePath), { recursive: true });
    try {
      const raw = await readFile(this.storagePath, "utf8");
      const parsed = JSON.parse(raw) as StoredWebhookEvent[];
      this.events = Array.isArray(parsed) ? parsed : [];
    } catch {
      this.events = [];
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    if (this.storagePath === ":memory:") {
      return;
    }

    const temporaryPath = `${this.storagePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(this.events, null, 2), "utf8");
    await rename(temporaryPath, this.storagePath);
  }

  async createEvent(input: EventCreateInput): Promise<StoredWebhookEvent> {
    const event: StoredWebhookEvent = {
      id: randomUUID(),
      externalEventId: input.externalEventId,
      eventType: input.eventType,
      source: input.source,
      severity: input.severity,
      title: input.title,
      message: input.message,
      rawPayloadMasked: input.rawPayloadMasked,
      payloadHash: input.payloadHash,
      headersMasked: input.headersMasked,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      ackedAt: null,
      createdAt: input.createdAt,
      receivedAt: input.receivedAt,
    };
    this.events.push(event);
    await this.persist();
    return event;
  }

  async listEvents(filters: EventListFilters): Promise<EventListItem[]> {
    return this.events
      .filter((event) => !filters.since || event.receivedAt > filters.since)
      .filter((event) => !filters.unreadOnly || !event.ackedAt)
      .filter((event) => !filters.type || event.eventType === filters.type)
      .filter((event) => !filters.severity || event.severity === filters.severity)
      .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt) || left.id.localeCompare(right.id))
      .slice(0, filters.limit)
      .map(toListItem);
  }

  async getEvent(id: string): Promise<StoredWebhookEvent | null> {
    return this.events.find((event) => event.id === id) ?? null;
  }

  async ackEvent(id: string, ackedAt: string): Promise<StoredWebhookEvent | null> {
    const event = this.events.find((item) => item.id === id);
    if (!event) {
      return null;
    }

    event.ackedAt = event.ackedAt ?? ackedAt;
    await this.persist();
    return event;
  }

  async close(): Promise<void> {
    await this.persist();
  }
}

export class PostgresEventStorage implements EventStorageService {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
    });
  }

  async initialize(): Promise<void> {
    await runPostgresMigrations(this.pool);
  }

  async createEvent(input: EventCreateInput): Promise<StoredWebhookEvent> {
    const id = randomUUID();
    await this.pool.query(
      `
        INSERT INTO webhook_events (
          id,
          external_event_id,
          event_type,
          source,
          severity,
          title,
          message,
          raw_payload_masked,
          payload_hash,
          headers_masked,
          ip_address,
          user_agent,
          acked_at,
          created_at,
          received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12, NULL, $13, $14)
      `,
      [
        id,
        input.externalEventId,
        input.eventType,
        input.source,
        input.severity,
        input.title,
        input.message,
        JSON.stringify(input.rawPayloadMasked),
        input.payloadHash,
        JSON.stringify(input.headersMasked),
        input.ipAddress,
        input.userAgent,
        input.createdAt,
        input.receivedAt,
      ],
    );

    const created = await this.getEvent(id);
    if (!created) {
      throw new Error("Webhook event was not persisted.");
    }
    return created;
  }

  async listEvents(filters: EventListFilters): Promise<EventListItem[]> {
    const where: string[] = [];
    const params: Array<string | number | boolean> = [];
    const addParam = (value: string | number | boolean): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (filters.since) {
      where.push(`received_at > ${addParam(filters.since)}`);
    }
    if (filters.unreadOnly) {
      where.push("acked_at IS NULL");
    }
    if (filters.type) {
      where.push(`event_type = ${addParam(filters.type)}`);
    }
    if (filters.severity) {
      where.push(`severity = ${addParam(filters.severity)}`);
    }

    params.push(filters.limit);
    const limitParam = `$${params.length}`;
    const result = await this.pool.query<EventRow>(
      `
        SELECT *
        FROM webhook_events
        ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY received_at ASC, id ASC
        LIMIT ${limitParam}
      `,
      params,
    );

    return result.rows.map(rowToStoredEvent).map(toListItem);
  }

  async getEvent(id: string): Promise<StoredWebhookEvent | null> {
    const result = await this.pool.query<EventRow>("SELECT * FROM webhook_events WHERE id = $1", [id]);
    return result.rows[0] ? rowToStoredEvent(result.rows[0]) : null;
  }

  async ackEvent(id: string, ackedAt: string): Promise<StoredWebhookEvent | null> {
    await this.pool.query("UPDATE webhook_events SET acked_at = COALESCE(acked_at, $1) WHERE id = $2", [
      ackedAt,
      id,
    ]);
    return this.getEvent(id);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
