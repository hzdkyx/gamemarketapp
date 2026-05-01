import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const rendererSrc = resolve(currentDir, "..");

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return [".ts", ".tsx"].includes(extname(entry)) &&
      entry !== "renderer-security.test.ts"
      ? [fullPath]
      : [];
  });

describe("renderer security boundaries", () => {
  it("does not call GameMarket directly or read secret environment values", () => {
    const source = collectSourceFiles(rendererSrc)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(source).not.toMatch(/headers\s*:\s*{[^}]*["']x-api-key["']/i);
    expect(source).not.toMatch(/["']x-api-key["']\s*:/i);
    expect(source).not.toMatch(/GAMEMARKET_API_KEY|APP_SYNC_TOKEN|WEBHOOK_INGEST_SECRET|DATABASE_URL/);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/fetch\([^)]*gamemarket/i);
  });

  it("does not expose raw cloud sync session tokens through the renderer API", () => {
    const desktopApiSource = readFileSync(join(rendererSrc, "lib", "desktop-api.ts"), "utf8");
    const cloudSyncApi = desktopApiSource.match(/cloudSync:\s*{[\s\S]*?getLastSyncSummary[\s\S]*?},/)?.[0] ?? "";

    expect(cloudSyncApi).not.toMatch(/revealToken|sessionToken|tokenMasked|tokenHash/);
    expect(cloudSyncApi).not.toMatch(/passwordHash/);
  });
});
