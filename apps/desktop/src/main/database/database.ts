import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { app } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { runtimeMigrations } from "./migrations";
import * as schema from "./schema";
import { startupProfiler } from "../startup-profiler";

export interface DatabaseStatus {
  path: string;
  connected: boolean;
  appliedMigrations: string[];
}

let sqlite: Database.Database | undefined;
let orm: BetterSQLite3Database<typeof schema> | undefined;
let databasePath = "";

const getDatabasePath = (): string => {
  const dataDirectory = app.getPath("userData");
  mkdirSync(dataDirectory, { recursive: true });
  return join(dataDirectory, "hzdk-gamemarket-manager.sqlite");
};

const runMigrations = (connection: Database.Database): string[] => {
  startupProfiler.mark("migrations_start");
  connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = connection
    .prepare("SELECT id FROM schema_migrations")
    .all() as Array<{ id: string }>;
  const applied = new Set(appliedRows.map((row) => row.id));
  const newlyApplied: string[] = [];

  const applyMigration = connection.transaction((id: string, sql: string) => {
    connection.exec(sql);
    connection
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(id, new Date().toISOString());
  });

  for (const migration of runtimeMigrations) {
    if (!applied.has(migration.id)) {
      applyMigration(migration.id, migration.sql);
      newlyApplied.push(migration.id);
    }
  }

  const appliedMigrations = [...applied, ...newlyApplied];
  startupProfiler.mark("migrations_end", {
    total: appliedMigrations.length,
    newlyApplied: newlyApplied.length
  });
  return appliedMigrations;
};

export const initializeDatabase = (): DatabaseStatus => {
  startupProfiler.mark("database_init_start");
  if (sqlite && orm) {
    const status = {
      path: databasePath,
      connected: true,
      appliedMigrations: runMigrations(sqlite)
    };
    startupProfiler.mark("database_init_end", {
      connected: true,
      migrations: status.appliedMigrations.length
    });
    return status;
  }

  databasePath = getDatabasePath();
  sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const appliedMigrations = runMigrations(sqlite);
  orm = drizzle(sqlite, { schema });

  const status = {
    path: databasePath,
    connected: true,
    appliedMigrations
  };
  startupProfiler.mark("database_init_end", {
    connected: true,
    migrations: appliedMigrations.length
  });
  return status;
};

export const getDatabase = (): BetterSQLite3Database<typeof schema> => {
  if (!orm) {
    initializeDatabase();
  }

  if (!orm) {
    throw new Error("Database was not initialized.");
  }

  return orm;
};

export const getSqliteDatabase = (): Database.Database => {
  if (!sqlite) {
    initializeDatabase();
  }

  if (!sqlite) {
    throw new Error("SQLite was not initialized.");
  }

  return sqlite;
};

export const closeDatabase = (): void => {
  if (sqlite?.open) {
    sqlite.close();
  }

  sqlite = undefined;
  orm = undefined;
};

export const getDatabaseStatus = (): DatabaseStatus => {
  if (!sqlite) {
    return initializeDatabase();
  }

  return {
    path: databasePath,
    connected: true,
    appliedMigrations: runMigrations(sqlite)
  };
};
