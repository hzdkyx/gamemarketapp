import type { Pool } from "pg";
import { postgresSchema } from "./schema.js";

export const runPostgresMigrations = async (pool: Pool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL
    );
  `);

  const applied = await pool.query("SELECT 1 FROM schema_migrations WHERE id = $1", ["0001_webhook_events"]);
  if ((applied.rowCount ?? 0) > 0) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(postgresSchema);
    await client.query("INSERT INTO schema_migrations (id, applied_at) VALUES ($1, $2)", [
      "0001_webhook_events",
      new Date().toISOString(),
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};
