import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackupRestoreInput } from "../../shared/contracts";

const state = vi.hoisted(() => ({
  schemaVersion: "0011_backup_restore_audit_events",
}));

vi.mock("better-sqlite3", () => {
  class FakeReadonlyDatabase {
    private readonly filePath: string;

    constructor(filePath: string) {
      this.filePath = filePath;
    }

    pragma() {
      return [{ integrity_check: "ok" }];
    }

    prepare(sql: string) {
      return {
        all: () => {
          if (sql.includes("sqlite_master")) {
            return ["schema_migrations", "settings", "products", "orders", "events"].map((name) => ({ name }));
          }
          return [];
        },
        get: () => ({ id: state.schemaVersion }),
        run: () => ({ changes: 1 }),
      };
    }

    close() {
      return undefined;
    }
  }

  return { default: FakeReadonlyDatabase };
});

const { createBackupService } = await import("./backup-service");

const makeTempDir = async (): Promise<string> => {
  const directory = join(tmpdir(), `hzdk-backup-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(directory, { recursive: true });
  return directory;
};

const pad = (value: number): string => String(value).padStart(2, "0");

const expectedLocalTimestamp = (date: Date): string =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;

const makeFakeDb = (databasePath: string, settingsStore: Map<string, string>) => ({
  pragma: vi.fn(),
  backup: vi.fn(async (destination: string) => {
    await writeFile(destination, await readFile(databasePath));
  }),
  prepare: (sql: string) => ({
    get: (key?: string) => {
      if (sql.includes("SELECT value_json FROM settings")) {
        const value = settingsStore.get(String(key));
        return value ? { value_json: value } : undefined;
      }
      if (sql.includes("schema_migrations")) {
        return { id: state.schemaVersion };
      }
      return undefined;
    },
    run: (payload: { key?: string; valueJson?: string }) => {
      if (payload.key && payload.valueJson) {
        settingsStore.set(payload.key, payload.valueJson);
      }
      return { changes: 1 };
    },
    all: () => [],
  }),
});

const makeService = async () => {
  const userData = await makeTempDir();
  const databasePath = join(userData, "hzdk-gamemarket-manager.sqlite");
  await writeFile(databasePath, "SQLite format 3 test database");
  const settingsStore = new Map<string, string>();
  const audit = vi.fn();
  const beforeRestore = vi.fn(() => ({ cloudSyncPaused: true }));
  const db = makeFakeDb(databasePath, settingsStore);
  const initializeDatabase = vi.fn();
  const closeDatabase = vi.fn();
  let nowMs = Date.UTC(2026, 0, 2, 3, 4, 5);

  const service = createBackupService({
    getUserDataPath: () => userData,
    getAppVersion: () => "0.1.0",
    getDatabasePath: () => databasePath,
    getSqliteDatabase: () => db as never,
    closeDatabase,
    initializeDatabase,
    now: () => new Date(nowMs),
    randomId: () => `id-${nowMs++}`,
    beforeRestore,
    audit,
  });

  return {
    service,
    userData,
    databasePath,
    settingsStore,
    audit,
    beforeRestore,
    closeDatabase,
    initializeDatabase,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
};

describe("backup service", () => {
  let cleanup: string | null = null;

  beforeEach(async () => {
    if (cleanup) {
      await rm(cleanup, { recursive: true, force: true });
      cleanup = null;
    }
  });

  it("lists an empty backup folder", async () => {
    const { service, userData } = await makeService();
    cleanup = userData;

    await expect(service.listBackups()).resolves.toEqual([]);
  });

  it("creates a manual backup with expected filename, size and checksum", async () => {
    const { service, userData } = await makeService();
    cleanup = userData;

    const backup = await service.createBackup("manual");
    const expectedTimestamp = expectedLocalTimestamp(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)));

    expect(backup.filename).toBe(`hzdk-gamemarket-backup-${expectedTimestamp}.sqlite`);
    expect(backup.sizeBytes).toBeGreaterThan(0);
    expect(backup.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(stat(backup.path)).resolves.toBeTruthy();
  });

  it("detects missing, empty and corrupt backups before restore", async () => {
    const { service, userData } = await makeService();
    cleanup = userData;
    await mkdir(join(userData, "backups"), { recursive: true });
    await writeFile(join(userData, "backups", "hzdk-gamemarket-backup-empty.sqlite"), "");
    await writeFile(join(userData, "backups", "hzdk-gamemarket-backup-corrupt.sqlite"), "not sqlite");

    await expect(service.validateBackup("missing.sqlite")).resolves.toMatchObject({ valid: false });
    await expect(service.validateBackup("hzdk-gamemarket-backup-empty.sqlite")).resolves.toMatchObject({
      valid: false,
    });
    await expect(service.validateBackup("hzdk-gamemarket-backup-corrupt.sqlite")).resolves.toMatchObject({
      valid: false,
    });
  });

  it("requires RESTAURAR and rejects paths outside the backups folder", async () => {
    const { service, userData } = await makeService();
    cleanup = userData;
    const backup = await service.createBackup("manual");

    await expect(
      service.restoreBackup({ filename: backup.filename, confirmation: "ERRADO" } as unknown as BackupRestoreInput),
    ).rejects.toThrow("Digite RESTAURAR");
    await expect(service.resolveBackupPath("..\\outside.sqlite")).rejects.toThrow("Backup inválido");
  });

  it("creates a safety backup, pauses sync hooks and restores the selected file", async () => {
    const { service, userData, databasePath, beforeRestore, closeDatabase, initializeDatabase } = await makeService();
    cleanup = userData;
    const backup = await service.createBackup("manual");
    await writeFile(databasePath, "current database content");

    const result = await service.restoreBackup({ filename: backup.filename, confirmation: "RESTAURAR" });

    expect(result.restored).toBe(true);
    expect(result.safetyBackup.type).toBe("safety");
    expect(result.cloudSyncPaused).toBe(true);
    expect(beforeRestore).toHaveBeenCalled();
    expect(closeDatabase).toHaveBeenCalled();
    expect(initializeDatabase).toHaveBeenCalled();
    await expect(readFile(databasePath, "utf8")).resolves.toContain("SQLite format 3 test database");
  });

  it("deletes only the selected backup file and metadata", async () => {
    const { service, userData } = await makeService();
    cleanup = userData;
    const first = await service.createBackup("manual");
    const second = await service.createBackup("manual");

    await service.deleteBackup(first.filename);

    await expect(stat(first.path)).rejects.toThrow();
    await expect(stat(second.path)).resolves.toBeTruthy();
  });

  it("applies retention to remove older backups", async () => {
    const { service, userData, advance } = await makeService();
    cleanup = userData;
    service.updateSettings({ retentionCount: 2 });

    await service.createBackup("manual");
    advance(1000);
    await service.createBackup("manual");
    advance(1000);
    const newest = await service.createBackup("manual");
    const backups = await service.listBackups();

    expect(backups).toHaveLength(2);
    expect(backups[0]?.filename).toBe(newest.filename);
  });

  it("saves automatic settings and does not duplicate recent automatic backups", async () => {
    const { service, userData, advance } = await makeService();
    cleanup = userData;

    expect(service.updateSettings({ automaticEnabled: true, frequency: "daily", retentionCount: 10 })).toMatchObject({
      automaticEnabled: true,
      frequency: "daily",
      retentionCount: 10,
    });
    const first = await service.runAutomaticBackupIfDue();
    const duplicate = await service.runAutomaticBackupIfDue();
    advance(24 * 60 * 60 * 1000 + 1);
    const next = await service.runAutomaticBackupIfDue();

    expect(first?.type).toBe("automatic");
    expect(duplicate).toBeNull();
    expect(next?.type).toBe("automatic");
  });

  it("records audit events without sensitive raw values", async () => {
    const { service, userData, audit } = await makeService();
    cleanup = userData;

    await service.createBackup("manual");

    const serialized = JSON.stringify(audit.mock.calls);
    expect(serialized).toContain("system.backup_created");
    expect(serialized).toContain("checksumSha256");
    expect(serialized).not.toContain("APP_SYNC_TOKEN");
    expect(serialized).not.toContain("WEBHOOK_INGEST_SECRET");
  });
});
