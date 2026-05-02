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
    expect(appShell).toContain('className="page-transition h-full min-h-0 overflow-y-auto px-8 py-6"');
  });

  it("uses internal section tabs instead of HashRouter-breaking anchors", () => {
    const settingsPage = readSource("settings.tsx");

    expect(settingsPage).toContain('className="grid gap-6 pb-10 xl:grid-cols-2"');
    expect(settingsPage).toContain('useState<SettingsSectionId>("users")');
    expect(settingsPage).toContain("onClick={() => setActiveSettingsSection(section.id)}");
    expect(settingsPage).toContain("aria-pressed={isActive}");
    expect(settingsPage).not.toContain('href={`#${section.id}`}');
    expect(settingsPage).toContain('activeSettingsSection === "cloud"');
    expect(settingsPage).toContain('activeSettingsSection === "gamemarket"');
    expect(settingsPage).toContain('activeSettingsSection === "notifications"');
    expect(settingsPage).toContain("<CardTitle>Conta e Sincronização</CardTitle>");
    expect(settingsPage).toContain("<CardTitle>Webhook Server / Tempo Real</CardTitle>");
    expect(settingsPage).toContain("<CardTitle>Notificações Locais</CardTitle>");
    expect(settingsPage).toContain("Usuários do Workspace");
    expect(settingsPage).toContain("Editar membro do workspace");
    expect(settingsPage).toContain("Resetar senha cloud");
    expect(settingsPage).toContain("Troca de senha cloud obrigatória");
    expect(settingsPage).toContain("Remover este usuário do workspace?");
    expect(settingsPage).toContain("createPortal(");
    expect(settingsPage).toContain("document.body");
    expect(settingsPage).toContain("WorkspaceMemberModal");
    expect(settingsPage).toContain("data-autofocus");
    expect(settingsPage).toContain("z-[100]");
  });

  it("keeps GameMarket documentation as an informational warning, not an API-call blocker", () => {
    const settingsPage = readSource("settings.tsx");

    expect(settingsPage).toContain("const gameMarketCanCallApi = Boolean(");
    expect(settingsPage).toContain("gameMarketSettings?.hasToken && isHttpUrl(gameMarketSettings.apiBaseUrl)");
    expect(settingsPage).toContain("GameMarket API configurada; documentação local ausente apenas como aviso.");
    expect(settingsPage).not.toContain('documentation.status === "available" && Boolean(gameMarketSettings.hasToken)');
  });

  it("shows a friendly cloud sync message when there is nothing to exchange", () => {
    const settingsPage = readSource("settings.tsx");

    expect(settingsPage).toContain("Nenhuma alteração pendente. Sincronização concluída.");
  });
});
