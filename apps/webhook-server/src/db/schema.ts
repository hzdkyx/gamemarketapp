export const webhookEventsTableName = "webhook_events";

export const postgresSchema = `
  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    external_event_id TEXT,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    raw_payload_masked JSONB NOT NULL,
    payload_hash TEXT NOT NULL,
    headers_masked JSONB NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    acked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    received_at TIMESTAMPTZ NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON webhook_events(received_at);
  CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
  CREATE INDEX IF NOT EXISTS idx_webhook_events_severity ON webhook_events(severity);
  CREATE INDEX IF NOT EXISTS idx_webhook_events_acked_at ON webhook_events(acked_at);
  CREATE INDEX IF NOT EXISTS idx_webhook_events_payload_hash ON webhook_events(payload_hash);
`;
