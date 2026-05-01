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
