import type { Pool } from "pg";
import { cloudPostgresSchema, postgresSchema } from "./schema.js";

const migrations = [
  {
    id: "0001_webhook_events",
    sql: postgresSchema,
  },
  {
    id: "0002_cloud_workspace_sync",
    sql: cloudPostgresSchema,
  },
  {
    id: "0003_cloud_user_admin",
    sql: `
      ALTER TABLE cloud_users
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

      ALTER TABLE cloud_users
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_cloud_sync_entities_updated_by
        ON cloud_sync_entities(workspace_id, updated_by_user_id, updated_at);
    `,
  },
  {
    id: "0004_workspace_member_removed_at",
    sql: `
      ALTER TABLE cloud_workspace_members
        ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ;

      CREATE INDEX IF NOT EXISTS idx_cloud_workspace_members_active
        ON cloud_workspace_members(workspace_id, user_id)
        WHERE removed_at IS NULL;
    `,
  },
];

export const runPostgresMigrations = async (pool: Pool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL
    );
  `);

  const appliedRows = await pool.query<{ id: string }>("SELECT id FROM schema_migrations");
  const applied = new Set(appliedRows.rows.map((row) => row.id));

  const client = await pool.connect();
  try {
    for (const migration of migrations) {
      if (applied.has(migration.id)) {
        continue;
      }

      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)", [
        migration.id,
        new Date().toISOString(),
      ]);
      await client.query("COMMIT");
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
