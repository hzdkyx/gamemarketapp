import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { backupFileInputSchema, backupRestoreInputSchema } from "../../shared/contracts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath: string): string =>
  readFileSync(resolve(currentDir, relativePath), "utf8");

describe("backup IPC contract", () => {
  it("registers backup handlers through main-process validation and permissions", () => {
    const source = readSource("backup-ipc.ts");

    expect(source).toContain('ipcMain.handle("backup:getStatus"');
    expect(source).toContain('ipcMain.handle("backup:create"');
    expect(source).toContain('ipcMain.handle("backup:restore"');
    expect(source).toContain('ipcMain.handle("backup:delete"');
    expect(source).toContain('ipcMain.handle("backup:openFolder"');
    expect(source).toContain('ipcMain.handle("backup:openLocation"');
    expect(source).toContain("requirePermission(\"canManageSettings\")");
    expect(source).toContain("backupRestoreInputSchema.parse(payload)");
    expect(source).toContain("backupFileInputSchema.parse(payload)");
  });

  it("rejects path traversal and requires strong restore confirmation", () => {
    expect(() => backupFileInputSchema.parse({ filename: "..\\outside.sqlite" })).toThrow();
    expect(() => backupFileInputSchema.parse({ filename: "C:\\temp\\backup.sqlite" })).toThrow();
    expect(() =>
      backupRestoreInputSchema.parse({
        filename: "hzdk-gamemarket-backup-20260102-030405.sqlite",
        confirmation: "restaurar",
      }),
    ).toThrow();
    expect(
      backupRestoreInputSchema.parse({
        filename: "hzdk-gamemarket-backup-20260102-030405.sqlite",
        confirmation: "RESTAURAR",
      }),
    ).toMatchObject({ confirmation: "RESTAURAR" });
  });
});
