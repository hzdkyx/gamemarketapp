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

export const cloudPostgresSchema = `
  CREATE TABLE IF NOT EXISTS cloud_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    email_normalized TEXT UNIQUE,
    username TEXT,
    username_normalized TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'operator', 'viewer')),
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cloud_workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cloud_workspace_members (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'operator', 'viewer')),
    status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    removed_at TIMESTAMPTZ,
    UNIQUE (workspace_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS cloud_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS cloud_sync_entities (
    cloud_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL CHECK (entity_type IN (
      'products',
      'product_variants',
      'inventory_items',
      'orders',
      'events',
      'app_notifications',
      'settings'
    )),
    local_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    payload_hash TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_by_user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    UNIQUE (workspace_id, entity_type, local_id)
  );

  CREATE TABLE IF NOT EXISTS cloud_sync_conflicts (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES cloud_workspaces(id) ON DELETE CASCADE,
    cloud_id TEXT NOT NULL REFERENCES cloud_sync_entities(cloud_id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    local_id TEXT NOT NULL,
    remote_version INTEGER NOT NULL,
    incoming_base_version INTEGER NOT NULL,
    remote_payload JSONB NOT NULL,
    incoming_payload JSONB NOT NULL,
    created_by_user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ
  );

  CREATE TABLE IF NOT EXISTS cloud_audit_logs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT REFERENCES cloud_workspaces(id) ON DELETE CASCADE,
    actor_user_id TEXT REFERENCES cloud_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cloud_workspace_members_user ON cloud_workspace_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_cloud_sessions_user ON cloud_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_cloud_sessions_expires ON cloud_sessions(expires_at);
  CREATE INDEX IF NOT EXISTS idx_cloud_sync_entities_workspace_updated
    ON cloud_sync_entities(workspace_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_cloud_sync_entities_workspace_type
    ON cloud_sync_entities(workspace_id, entity_type);
  CREATE INDEX IF NOT EXISTS idx_cloud_sync_entities_updated_by
    ON cloud_sync_entities(workspace_id, updated_by_user_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_cloud_sync_conflicts_workspace
    ON cloud_sync_conflicts(workspace_id, resolved_at);
  CREATE INDEX IF NOT EXISTS idx_cloud_audit_logs_workspace_created
    ON cloud_audit_logs(workspace_id, created_at);
`;
