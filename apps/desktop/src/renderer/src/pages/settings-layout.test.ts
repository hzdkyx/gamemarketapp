import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(resolve(currentDir, relativePath), "utf8");

describe("settings page scroll layout", () => {
  it("keeps the authenticated content area constrained and scrollable", () => {
    const appShell = readSource("../components/layout/app-shell.tsx");

    expect(appShell).toContain('className="flex min-h-0 min-w-0 flex-col"');
    expect(appShell).toContain('className="min-h-0 flex-1 overflow-hidden"');
    expect(appShell).toContain('className="h-full min-h-0 overflow-y-auto px-8 py-6"');
  });

  it("keeps the lower settings sections inside the scrollable content", () => {
    const settingsPage = readSource("settings.tsx");

    expect(settingsPage).toContain('className="grid gap-6 pb-10 xl:grid-cols-2"');
    expect(settingsPage).toContain("<CardTitle>Conta e Sincronização</CardTitle>");
    expect(settingsPage).toContain("<CardTitle>Webhook Server / Tempo Real</CardTitle>");
    expect(settingsPage).toContain("<CardTitle>Notificações Locais</CardTitle>");
  });
});
