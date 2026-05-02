import Database from "better-sqlite3";
import { app } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import {
  backupSettingsSchema,
  type BackupFrequency,
  type BackupOrigin,
  type BackupRecord,
  type BackupRestoreInput,
  type BackupRestoreResult,
  type BackupSettings,
  type BackupSettingsUpdateInput,
  type BackupStatus,
  type BackupValidationResult,
} from "../../shared/contracts";
import {
  closeDatabase,
  getDatabaseStatus,
  getSqliteDatabase,
  initializeDatabase,
} from "../database/database";
import { eventService } from "./event-service";

interface BackupServiceDependencies {
  getUserDataPath: () => string;
  getAppVersion: () => string;
  getDatabasePath: () => string;
  getSqliteDatabase: () => Database.Database;
  closeDatabase: () => void;
  initializeDatabase: () => void;
  now: () => Date;
  randomId: () => string;
  beforeRestore: () => Promise<{ cloudSyncPaused: boolean }> | { cloudSyncPaused: boolean };
  audit: (input: {
    type:
      | "system.backup_created"
      | "system.backup_failed"
      | "system.backup_deleted"
      | "system.restore_started"
      | "system.restore_completed"
      | "system.restore_failed"
      | "system.restore_safety_backup_created";
    severity?: "info" | "success" | "warning" | "critical";
    title: string;
    message?: string;
    payload?: Record<string, unknown>;
  }) => void;
}

const backupSettingsKey = "local_backup_settings";
const backupFilenamePrefix = "hzdk-gamemarket-backup";
const expectedTables = ["schema_migrations", "settings", "products", "orders", "events"] as const;

const defaultBackupSettings: BackupSettings = {
  automaticEnabled: true,
  frequency: "daily",
  retentionCount: 10,
  lastAutomaticBackupAt: null,
};

const pad = (value: number): string => String(value).padStart(2, "0");

const toBackupTimestamp = (date: Date): string =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(
    date.getMinutes(),
  )}${pad(date.getSeconds())}`;

const metadataPathFor = (backupPath: string): string => `${backupPath}.json`;

const makeDefaultDependencies = (): BackupServiceDependencies => ({
  getUserDataPath: () => app.getPath("userData"),
  getAppVersion: () => app.getVersion(),
  getDatabasePath: () => getDatabaseStatus().path,
  getSqliteDatabase,
  closeDatabase,
  initializeDatabase: () => {
    initializeDatabase();
  },
  now: () => new Date(),
  randomId: () => randomUUID(),
  beforeRestore: async () => {
    const [
      { cloudSyncPollingService },
      { gameMarketPollingService },
      { webhookServerPollingService },
    ] = await Promise.all([
      import("../integrations/cloud-sync/cloud-sync-polling-service"),
      import("../integrations/gamemarket/gamemarket-polling-service"),
      import("../integrations/webhook-server/webhook-server-polling-service"),
    ]);

    cloudSyncPollingService.pause();
    gameMarketPollingService.stop();
    webhookServerPollingService.stop();
    return { cloudSyncPaused: true };
  },
  audit: (input) => {
    eventService.createInternal({
      source: "system",
      type: input.type,
      severity: input.severity ?? "info",
      title: input.title,
      message: input.message ?? null,
      rawPayload: input.payload ?? null,
    });
  },
});

const calculateSha256 = (filePath: string): Promise<string> =>
  new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });

const safeAuditPayload = (backup: BackupRecord): Record<string, unknown> => ({
  filename: backup.filename,
  sizeBytes: backup.sizeBytes,
  createdAt: backup.createdAt,
  type: backup.type,
  dbSchemaVersion: backup.dbSchemaVersion,
  checksumSha256: backup.checksumSha256,
});

const getSchemaVersionFromConnection = (db: Database.Database): string | null => {
  try {
    const row = db
      .prepare("SELECT id FROM schema_migrations ORDER BY applied_at DESC, id DESC LIMIT 1")
      .get() as { id: string } | undefined;
    return row?.id ?? null;
  } catch {
    return null;
  }
};

const safeParseBackupSettings = (value: string | null | undefined): BackupSettings => {
  if (!value) {
    return defaultBackupSettings;
  }

  try {
    return backupSettingsSchema.parse({
      ...defaultBackupSettings,
      ...(JSON.parse(value) as Partial<BackupSettings>),
    });
  } catch {
    return defaultBackupSettings;
  }
};

const frequencyWindowMs = (frequency: BackupFrequency): number => {
  if (frequency === "weekly") {
    return 7 * 24 * 60 * 60 * 1000;
  }

  if (frequency === "startup") {
    return 10 * 60 * 1000;
  }

  return 24 * 60 * 60 * 1000;
};

const removeIfExists = async (filePath: string): Promise<void> => {
  await rm(filePath, { force: true });
};

const moveIfExists = async (source: string, target: string): Promise<boolean> => {
  try {
    await stat(source);
  } catch {
    return false;
  }

  await rename(source, target);
  return true;
};

export const createBackupService = (dependencies: BackupServiceDependencies = makeDefaultDependencies()) => {
  const getBackupsDirectory = (): string => join(dependencies.getUserDataPath(), "backups");

  const emitAudit = (input: Parameters<BackupServiceDependencies["audit"]>[0]): void => {
    try {
      dependencies.audit(input);
    } catch {
      // Backup operations must not fail just because audit insertion failed.
    }
  };

  const ensureBackupsDirectory = async (): Promise<string> => {
    const backupsDirectory = getBackupsDirectory();
    await mkdir(backupsDirectory, { recursive: true });
    return backupsDirectory;
  };

  const resolveBackupPath = async (filename: string): Promise<string> => {
    if (basename(filename) !== filename || extname(filename) !== ".sqlite") {
      throw new Error("Backup inválido.");
    }

    const backupsDirectory = await ensureBackupsDirectory();
    const resolved = resolve(backupsDirectory, filename);
    const diff = relative(backupsDirectory, resolved);
    if (!diff || diff.startsWith("..") || resolve(diff) === diff) {
      throw new Error("Backup inválido.");
    }

    return resolved;
  };

  const buildBackupFilename = async (createdAt: Date): Promise<string> => {
    const backupsDirectory = await ensureBackupsDirectory();
    const base = `${backupFilenamePrefix}-${toBackupTimestamp(createdAt)}`;
    let filename = `${base}.sqlite`;
    let counter = 2;

    while (true) {
      try {
        await stat(join(backupsDirectory, filename));
        filename = `${base}-${counter}.sqlite`;
        counter += 1;
      } catch {
        return filename;
      }
    }
  };

  const readSettings = (): BackupSettings => {
    try {
      const row = dependencies
        .getSqliteDatabase()
        .prepare("SELECT value_json FROM settings WHERE key = ?")
        .get(backupSettingsKey) as { value_json: string } | undefined;
      return safeParseBackupSettings(row?.value_json);
    } catch {
      return defaultBackupSettings;
    }
  };

  const writeSettings = (settings: BackupSettings): BackupSettings => {
    const updated = backupSettingsSchema.parse(settings);
    dependencies
      .getSqliteDatabase()
      .prepare(
        `
          INSERT INTO settings (key, value_json, is_secret, updated_at)
          VALUES (@key, @valueJson, 1, @updatedAt)
          ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            is_secret = excluded.is_secret,
            updated_at = excluded.updated_at
        `,
      )
      .run({
        key: backupSettingsKey,
        valueJson: JSON.stringify(updated),
        updatedAt: dependencies.now().toISOString(),
      });

    return updated;
  };

  const readMetadata = async (backupPath: string): Promise<Partial<BackupRecord> | null> => {
    try {
      return JSON.parse(await readFile(metadataPathFor(backupPath), "utf8")) as Partial<BackupRecord>;
    } catch {
      return null;
    }
  };

  const toBackupRecord = async (backupPath: string): Promise<BackupRecord> => {
    const fileStat = await stat(backupPath);
    const metadata = await readMetadata(backupPath);
    const filename = basename(backupPath);
    const checksumSha256 =
      typeof metadata?.checksumSha256 === "string" && metadata.checksumSha256.length > 0
        ? metadata.checksumSha256
        : await calculateSha256(backupPath);

    return {
      id: typeof metadata?.id === "string" ? metadata.id : filename,
      filename,
      path: backupPath,
      createdAt:
        typeof metadata?.createdAt === "string" ? metadata.createdAt : fileStat.birthtime.toISOString(),
      sizeBytes: fileStat.size,
      type:
        metadata?.type === "automatic" || metadata?.type === "safety" || metadata?.type === "manual"
          ? metadata.type
          : "manual",
      appVersion: typeof metadata?.appVersion === "string" ? metadata.appVersion : dependencies.getAppVersion(),
      dbSchemaVersion:
        typeof metadata?.dbSchemaVersion === "string" || metadata?.dbSchemaVersion === null
          ? metadata.dbSchemaVersion
          : null,
      checksumSha256,
    };
  };

  const listBackups = async (): Promise<BackupRecord[]> => {
    const backupsDirectory = await ensureBackupsDirectory();
    const filenames = await readdir(backupsDirectory);
    const records: BackupRecord[] = [];

    for (const filename of filenames) {
      if (!filename.startsWith(backupFilenamePrefix) || !filename.endsWith(".sqlite")) {
        continue;
      }

      try {
        records.push(await toBackupRecord(join(backupsDirectory, filename)));
      } catch {
        // Ignore incomplete files in the list; validation will still reject them if selected by name.
      }
    }

    return records.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  };

  const deleteBackupByRecord = async (backup: BackupRecord): Promise<void> => {
    const backupPath = await resolveBackupPath(backup.filename);
    if (resolve(backupPath) === resolve(dependencies.getDatabasePath())) {
      throw new Error("Não é possível excluir o banco em uso.");
    }
    await removeIfExists(backupPath);
    await removeIfExists(metadataPathFor(backupPath));
  };

  const applyRetention = async (keep: number, protectedFilename: string): Promise<void> => {
    const backups = await listBackups();
    const removable = backups
      .filter((backup) => backup.filename !== protectedFilename)
      .slice(Math.max(0, keep - 1));

    for (const backup of removable) {
      await deleteBackupByRecord(backup);
    }
  };

  const createBackup = async (type: BackupOrigin = "manual"): Promise<BackupRecord> => {
    const createdAtDate = dependencies.now();
    const createdAt = createdAtDate.toISOString();
    const backupsDirectory = await ensureBackupsDirectory();
    const filename = await buildBackupFilename(createdAtDate);
    const destinationPath = join(backupsDirectory, filename);

    try {
      const db = dependencies.getSqliteDatabase();
      db.pragma("wal_checkpoint(FULL)");
      await db.backup(destinationPath);

      const fileStat = await stat(destinationPath);
      const checksumSha256 = await calculateSha256(destinationPath);
      const record: BackupRecord = {
        id: dependencies.randomId(),
        filename,
        path: destinationPath,
        createdAt,
        sizeBytes: fileStat.size,
        type,
        appVersion: dependencies.getAppVersion(),
        dbSchemaVersion: getSchemaVersionFromConnection(db),
        checksumSha256,
      };
      await writeFile(metadataPathFor(destinationPath), JSON.stringify(record, null, 2), "utf8");

      if (type === "automatic") {
        writeSettings({
          ...readSettings(),
          lastAutomaticBackupAt: createdAt,
        });
      }

      await applyRetention(readSettings().retentionCount, filename);

      emitAudit({
        type: type === "safety" ? "system.restore_safety_backup_created" : "system.backup_created",
        severity: "success",
        title: type === "safety" ? "Backup de segurança criado" : "Backup local criado",
        message: "Backup SQLite criado com sucesso.",
        payload: safeAuditPayload(record),
      });

      return record;
    } catch (error) {
      emitAudit({
        type: "system.backup_failed",
        severity: "warning",
        title: "Backup local falhou",
        message: "Não foi possível criar o backup local.",
        payload: {
          filename,
          type,
          reason: error instanceof Error ? error.message : "unknown",
        },
      });
      throw new Error("Não foi possível criar o backup. Tente novamente.");
    }
  };

  const validateBackup = async (filename: string): Promise<BackupValidationResult> => {
    try {
      const backupPath = await resolveBackupPath(filename);
      const fileStat = await stat(backupPath);
      if (fileStat.size <= 0) {
        return {
          valid: false,
          safeMessage: "Backup inválido ou corrompido. Nenhum dado foi alterado.",
          dbSchemaVersion: null,
        };
      }
      const header = await readFile(backupPath);
      if (header.subarray(0, 15).toString("utf8") !== "SQLite format 3") {
        return {
          valid: false,
          safeMessage: "Backup inválido ou corrompido. Nenhum dado foi alterado.",
          dbSchemaVersion: null,
        };
      }

      const metadata = await readMetadata(backupPath);
      if (typeof metadata?.checksumSha256 === "string") {
        const currentChecksum = await calculateSha256(backupPath);
        if (metadata.checksumSha256 !== currentChecksum) {
          return {
            valid: false,
            safeMessage: "Backup inválido ou corrompido. Nenhum dado foi alterado.",
            dbSchemaVersion: null,
          };
        }
      }

      const readonlyDb = new Database(backupPath, { readonly: true, fileMustExist: true });
      try {
        const integrity = readonlyDb.pragma("integrity_check") as Array<{ integrity_check: string }>;
        if (integrity[0]?.integrity_check !== "ok") {
          return {
            valid: false,
            safeMessage: "Backup inválido ou corrompido. Nenhum dado foi alterado.",
            dbSchemaVersion: null,
          };
        }

        const rows = readonlyDb
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>;
        const tableNames = new Set(rows.map((row) => row.name));
        if (!expectedTables.every((table) => tableNames.has(table))) {
          return {
            valid: false,
            safeMessage: "Backup inválido ou corrompido. Nenhum dado foi alterado.",
            dbSchemaVersion: null,
          };
        }

        return {
          valid: true,
          safeMessage: "Backup validado com sucesso.",
          dbSchemaVersion: getSchemaVersionFromConnection(readonlyDb),
        };
      } finally {
        readonlyDb.close();
      }
    } catch {
      return {
        valid: false,
        safeMessage: "Backup inválido ou corrompido. Nenhum dado foi alterado.",
        dbSchemaVersion: null,
      };
    }
  };

  const updateSettings = (input: BackupSettingsUpdateInput): BackupSettings => {
    const current = readSettings();
    return writeSettings({
      ...current,
      automaticEnabled: input.automaticEnabled ?? current.automaticEnabled,
      frequency: input.frequency ?? current.frequency,
      retentionCount: input.retentionCount ?? current.retentionCount,
    });
  };

  const getStatus = async (): Promise<BackupStatus> => {
    const backups = await listBackups();
    return {
      databasePath: dependencies.getDatabasePath(),
      backupsPath: await ensureBackupsDirectory(),
      settings: readSettings(),
      lastBackup: backups[0] ?? null,
      backups,
      cloudSyncPausedAfterRestore: false,
    };
  };

  const restoreBackup = async (input: BackupRestoreInput): Promise<BackupRestoreResult> => {
    if (input.confirmation !== "RESTAURAR") {
      throw new Error("Digite RESTAURAR para confirmar a restauração.");
    }

    const selectedPath = await resolveBackupPath(input.filename);
    const validation = await validateBackup(input.filename);
    if (!validation.valid) {
      emitAudit({
        type: "system.restore_failed",
        severity: "warning",
        title: "Restauração bloqueada",
        message: validation.safeMessage,
        payload: { filename: input.filename },
      });
      throw new Error(validation.safeMessage);
    }

    const selectedBackup = await toBackupRecord(selectedPath);
    emitAudit({
      type: "system.restore_started",
      severity: "warning",
      title: "Restauração iniciada",
      message: "Substituição do banco local iniciada.",
      payload: safeAuditPayload(selectedBackup),
    });

    let safetyBackup: BackupRecord | null = null;
    try {
      safetyBackup = await createBackup("safety");
      const pauseResult = await dependencies.beforeRestore();
      const databasePath = dependencies.getDatabasePath();
      const restoreTempPath = join(dirname(databasePath), `restore-${dependencies.randomId()}.sqlite`);
      const oldPath = `${databasePath}.before-restore-${toBackupTimestamp(dependencies.now())}`;
      const oldWalPath = `${oldPath}-wal`;
      const oldShmPath = `${oldPath}-shm`;
      let movedDatabase = false;
      let movedWal = false;
      let movedShm = false;

      await copyFile(selectedPath, restoreTempPath);
      dependencies.closeDatabase();

      try {
        movedDatabase = await moveIfExists(databasePath, oldPath);
        movedWal = await moveIfExists(`${databasePath}-wal`, oldWalPath);
        movedShm = await moveIfExists(`${databasePath}-shm`, oldShmPath);
        await rename(restoreTempPath, databasePath);
      } catch (error) {
        await removeIfExists(databasePath);
        if (movedDatabase) {
          await rename(oldPath, databasePath);
        }
        if (movedWal) {
          await rename(oldWalPath, `${databasePath}-wal`);
        }
        if (movedShm) {
          await rename(oldShmPath, `${databasePath}-shm`);
        }
        throw error;
      } finally {
        await removeIfExists(restoreTempPath);
      }

      dependencies.initializeDatabase();
      emitAudit({
        type: "system.restore_completed",
        severity: "success",
        title: "Backup restaurado",
        message: "Backup restaurado. Revise os dados antes de reativar a sincronização.",
        payload: {
          restoredFilename: selectedBackup.filename,
          safetyFilename: safetyBackup.filename,
          cloudSyncPaused: pauseResult.cloudSyncPaused,
        },
      });

      return {
        restored: true,
        requiresRestart: true,
        restoredBackup: selectedBackup,
        safetyBackup,
        cloudSyncPaused: pauseResult.cloudSyncPaused,
        safeMessage: "Backup restaurado. Revise os dados antes de reativar a sincronização.",
      };
    } catch (error) {
      dependencies.initializeDatabase();
      emitAudit({
        type: "system.restore_failed",
        severity: "critical",
        title: "Restauração falhou",
        message: "Backup inválido ou corrompido. Nenhum dado foi alterado.",
        payload: {
          filename: input.filename,
          safetyFilename: safetyBackup?.filename ?? null,
          reason: error instanceof Error ? error.message : "unknown",
        },
      });
      throw new Error("Backup inválido ou corrompido. Nenhum dado foi alterado.");
    }
  };

  const deleteBackup = async (filename: string): Promise<{ deleted: true }> => {
    const backupPath = await resolveBackupPath(filename);
    const backup = await toBackupRecord(backupPath);
    await deleteBackupByRecord(backup);
    emitAudit({
      type: "system.backup_deleted",
      severity: "warning",
      title: "Backup local excluído",
      message: "Backup local removido deste computador.",
      payload: safeAuditPayload(backup),
    });
    return { deleted: true };
  };

  const runAutomaticBackupIfDue = async (): Promise<BackupRecord | null> => {
    const settings = readSettings();
    if (!settings.automaticEnabled) {
      return null;
    }

    const lastAutomaticBackupAt = settings.lastAutomaticBackupAt
      ? new Date(settings.lastAutomaticBackupAt).getTime()
      : 0;
    const elapsedMs = dependencies.now().getTime() - lastAutomaticBackupAt;
    if (elapsedMs >= 0 && elapsedMs < frequencyWindowMs(settings.frequency)) {
      return null;
    }

    return createBackup("automatic");
  };

  return {
    getBackupsDirectory,
    listBackups,
    createBackup,
    validateBackup,
    restoreBackup,
    deleteBackup,
    getStatus,
    getSettings: readSettings,
    updateSettings,
    runAutomaticBackupIfDue,
    resolveBackupPath,
  };
};

export const backupService = createBackupService();
