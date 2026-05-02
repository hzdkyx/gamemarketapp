import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { runtimeMigrations } from "./migrations";

describe("runtime migrations", () => {
  it("defines the product variants migration with inventory and order links", () => {
    const migration = runtimeMigrations.find(
      (item) => item.id === "0006_product_variants",
    );

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain(
      "CREATE TABLE IF NOT EXISTS product_variants",
    );
    expect(migration?.sql).toContain("variant_code TEXT NOT NULL UNIQUE");
    expect(migration?.sql).toContain("needs_review INTEGER NOT NULL DEFAULT 0");
    expect(migration?.sql).toContain(
      "ALTER TABLE inventory_items ADD COLUMN product_variant_id",
    );
    expect(migration?.sql).toContain(
      "ALTER TABLE orders ADD COLUMN product_variant_id",
    );
    expect(migration?.sql).toContain("idx_product_variants_product");
  });

  it("defines the GameMarket release status hotfix migration", () => {
    const migration = runtimeMigrations.find(
      (item) => item.id === "0007_gamemarket_release_status_hotfix",
    );

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain("order.status_corrected");
    expect(migration?.sql).toContain("external_marketplace = 'gamemarket'");
    expect(migration?.sql).toContain("external_status, '')) = 'processing'");
    expect(migration?.sql).toContain("completed_at = NULL");
  });

  it("defines the local app notifications migration with dedupe indexes", () => {
    const migration = runtimeMigrations.find(
      (item) => item.id === "0008_phase6_local_notifications_polling",
    );

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain(
      "CREATE TABLE IF NOT EXISTS app_notifications",
    );
    expect(migration?.sql).toContain("dedupe_key TEXT");
    expect(migration?.sql).toContain("metadata_json TEXT");
    expect(migration?.sql).toContain("idx_app_notifications_dedupe");
    expect(migration?.sql).toContain("WHERE dedupe_key IS NOT NULL");
  });

  it("defines the cloud workspace sync migration without removing local mode tables", () => {
    const migration = runtimeMigrations.find(
      (item) => item.id === "0009_phase7_cloud_workspace_sync",
    );

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain(
      "ALTER TABLE products ADD COLUMN cloud_id",
    );
    expect(migration?.sql).toContain(
      "ALTER TABLE product_variants ADD COLUMN workspace_id",
    );
    expect(migration?.sql).toContain(
      "ALTER TABLE inventory_items ADD COLUMN sync_status",
    );
    expect(migration?.sql).toContain(
      "ALTER TABLE orders ADD COLUMN sync_revision",
    );
    expect(migration?.sql).toContain(
      "ALTER TABLE events ADD COLUMN deleted_at",
    );
    expect(migration?.sql).toContain(
      "CREATE TABLE IF NOT EXISTS cloud_sync_conflicts",
    );
    expect(migration?.sql).toContain("idx_cloud_sync_conflicts_workspace");
  });

  it("defines the local password recovery migration without touching cloud workspace tables", () => {
    const migration = runtimeMigrations.find(
      (item) => item.id === "0010_local_password_recovery",
    );

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain(
      "ALTER TABLE users ADD COLUMN password_hint TEXT",
    );
    expect(migration?.sql).toContain("auth.local_password_reset");
    expect(migration?.sql).toContain("cloud_id TEXT");
    expect(migration?.sql).toContain("workspace_id TEXT");
    expect(migration?.sql).not.toContain("cloud_sessions");
    expect(migration?.sql).not.toContain("cloud_workspaces");
  });

  it("defines backup and restore audit event migration", () => {
    const migration = runtimeMigrations.find(
      (item) => item.id === "0011_backup_restore_audit_events",
    );

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain("system.backup_created");
    expect(migration?.sql).toContain("system.backup_failed");
    expect(migration?.sql).toContain("system.restore_completed");
    expect(migration?.sql).toContain("system.restore_safety_backup_created");
    expect(migration?.sql).toContain("CREATE TABLE events_new");
  });

  it("defines cloud sync conflict resolution metadata migration", () => {
    const migration = runtimeMigrations.find(
      (item) => item.id === "0012_cloud_sync_conflict_resolution",
    );

    expect(migration).toBeTruthy();
    expect(migration?.sql).toContain("ALTER TABLE cloud_sync_conflicts ADD COLUMN status");
    expect(migration?.sql).toContain("resolution_type");
    expect(migration?.sql).toContain("cloud.conflict_resolved_manual");
    expect(migration?.sql).toContain("idx_cloud_sync_conflicts_status");
  });

  it("applies the local password recovery migration to an existing SQLite database", () => {
    const migration = runtimeMigrations.find((item) => item.id === "0010_local_password_recovery");
    const db = new DatabaseSync(":memory:");

    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT NOT NULL,
        last_login_at TEXT,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        allow_reveal_secrets INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE products (id TEXT PRIMARY KEY);
      CREATE TABLE orders (id TEXT PRIMARY KEY);
      CREATE TABLE inventory_items (id TEXT PRIMARY KEY);
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        event_code TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('order.created', 'system.notification_test')),
        severity TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL,
        message TEXT,
        order_id TEXT,
        product_id TEXT,
        inventory_item_id TEXT,
        actor_user_id TEXT,
        read_at TEXT,
        raw_payload TEXT,
        created_at TEXT NOT NULL,
        cloud_id TEXT,
        workspace_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_cloud_synced_at TEXT,
        sync_revision INTEGER NOT NULL DEFAULT 0,
        updated_by_cloud_user_id TEXT,
        deleted_at TEXT
      );
    `);

    expect(() => db.exec(migration?.sql ?? "")).not.toThrow();

    const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
    expect(userColumns.map((column) => column.name)).toContain("password_hint");
    expect(() =>
      db
        .prepare(
          `
            INSERT INTO events (
              id,
              event_code,
              source,
              type,
              severity,
              title,
              created_at
            )
            VALUES ('evt-1', 'EVT-AUTH-LOCAL-PASSWORD-RESET-1', 'system', 'auth.local_password_reset', 'warning', 'Senha local resetada', '2026-05-01T00:00:00.000Z')
          `
        )
        .run()
    ).not.toThrow();

    db.close();
  });

  it("applies the backup audit migration to an existing SQLite database", () => {
    const migration = runtimeMigrations.find((item) => item.id === "0011_backup_restore_audit_events");
    const db = new DatabaseSync(":memory:");

    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE products (id TEXT PRIMARY KEY);
      CREATE TABLE orders (id TEXT PRIMARY KEY);
      CREATE TABLE inventory_items (id TEXT PRIMARY KEY);
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        event_code TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('system.notification_test')),
        severity TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL,
        message TEXT,
        order_id TEXT,
        product_id TEXT,
        inventory_item_id TEXT,
        actor_user_id TEXT,
        read_at TEXT,
        raw_payload TEXT,
        created_at TEXT NOT NULL,
        cloud_id TEXT,
        workspace_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_cloud_synced_at TEXT,
        sync_revision INTEGER NOT NULL DEFAULT 0,
        updated_by_cloud_user_id TEXT,
        deleted_at TEXT
      );
    `);

    expect(() => db.exec(migration?.sql ?? "")).not.toThrow();
    expect(() =>
      db
        .prepare(
          `
            INSERT INTO events (
              id,
              event_code,
              source,
              type,
              severity,
              title,
              created_at
            )
            VALUES ('evt-backup-1', 'EVT-SYSTEM-BACKUP-CREATED-1', 'system', 'system.backup_created', 'success', 'Backup local criado', '2026-05-02T00:00:00.000Z')
          `,
        )
        .run(),
    ).not.toThrow();

    db.close();
  });

  it("applies the cloud conflict resolution migration to an existing SQLite database", () => {
    const migration = runtimeMigrations.find((item) => item.id === "0012_cloud_sync_conflict_resolution");
    const db = new DatabaseSync(":memory:");

    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY);
      CREATE TABLE products (id TEXT PRIMARY KEY);
      CREATE TABLE orders (id TEXT PRIMARY KEY);
      CREATE TABLE inventory_items (id TEXT PRIMARY KEY);
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        event_code TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('system.notification_test')),
        severity TEXT NOT NULL DEFAULT 'info',
        title TEXT NOT NULL,
        message TEXT,
        order_id TEXT,
        product_id TEXT,
        inventory_item_id TEXT,
        actor_user_id TEXT,
        read_at TEXT,
        raw_payload TEXT,
        created_at TEXT NOT NULL,
        cloud_id TEXT,
        workspace_id TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        last_cloud_synced_at TEXT,
        sync_revision INTEGER NOT NULL DEFAULT 0,
        updated_by_cloud_user_id TEXT,
        deleted_at TEXT
      );
      CREATE TABLE cloud_sync_conflicts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        local_id TEXT NOT NULL,
        cloud_id TEXT NOT NULL,
        remote_version INTEGER NOT NULL,
        incoming_base_version INTEGER NOT NULL,
        local_payload_json TEXT NOT NULL,
        remote_payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );
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
      VALUES (
        'conflict-1',
        'workspace-1',
        'products',
        'product-1',
        'cloud-1',
        2,
        1,
        '{}',
        '{}',
        '2026-05-01T00:00:00.000Z',
        NULL
      );
    `);

    expect(() => db.exec(migration?.sql ?? "")).not.toThrow();

    const columns = db.prepare("PRAGMA table_info(cloud_sync_conflicts)").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(["status", "resolution_type", "diff_json"]));
    expect(() =>
      db
        .prepare(
          `
            INSERT INTO events (
              id,
              event_code,
              source,
              type,
              severity,
              title,
              created_at
            )
            VALUES ('evt-cloud-1', 'EVT-CLOUD-CONFLICT-1', 'system', 'cloud.conflict_resolved_local', 'info', 'Conflito resolvido', '2026-05-01T00:00:00.000Z')
          `,
        )
        .run()
    ).not.toThrow();

    const conflict = db.prepare("SELECT status, updated_at FROM cloud_sync_conflicts WHERE id = 'conflict-1'").get() as {
      status: string;
      updated_at: string;
    };
    expect(conflict.status).toBe("pending");
    expect(conflict.updated_at).toBe("2026-05-01T00:00:00.000Z");

    db.close();
  });
});
