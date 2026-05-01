import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

describe("startup window order", () => {
  it("creates the native splash before the main BrowserWindow is created", () => {
    const source = readFileSync(join(currentDir, "index.ts"), "utf8");

    expect(source.indexOf("createSplashWindow()")).toBeGreaterThanOrEqual(0);
    expect(source.indexOf("await splashWindow.ready")).toBeLessThan(source.indexOf("initializeDatabase()"));
    expect(source.indexOf("createSplashWindow()")).toBeLessThan(source.indexOf("createWindow();"));
  });

  it("ships splash markup inline so packaged portable builds do not depend on missing files", () => {
    const indexSource = readFileSync(join(currentDir, "index.ts"), "utf8");
    const splashSource = readFileSync(join(currentDir, "splash-window.ts"), "utf8");
    const rendererHtml = readFileSync(join(currentDir, "../renderer/index.html"), "utf8");

    expect(splashSource).toContain("data:text/html");
    expect(splashSource).toContain("HzdKyx");
    expect(splashSource).toContain("GameMarket Manager");
    expect(rendererHtml).toContain('id="boot-splash"');
    expect(rendererHtml).toContain("Inicializando aplicativo...");
    expect(indexSource).toContain("Splash carregando...");
    expect(splashSource).toContain("show: false");
    expect(splashSource).toContain("window.show()");
  });

  it("keeps the main window hidden until ready-to-show and enforces the packaged splash minimum", () => {
    const source = readFileSync(join(currentDir, "index.ts"), "utf8");

    expect(source).toContain("show: false");
    expect(source).toContain("minimumProductionSplashMs = 1200");
    expect(source).toContain('mainWindow.once("ready-to-show"');
    expect(source).toContain("await splashWindow.waitForMinimumVisible(minimumProductionSplashMs)");
    expect(source.indexOf("mainWindow?.show()")).toBeGreaterThan(source.indexOf('mainWindow.once("ready-to-show"'));
  });

  it("records startup timings through splash, main readiness and renderer login", () => {
    const indexSource = readFileSync(join(currentDir, "index.ts"), "utf8");
    const profilerSource = readFileSync(join(currentDir, "startup-profiler.ts"), "utf8");
    const appSource = readFileSync(join(currentDir, "../renderer/src/App.tsx"), "utf8");

    expect(profilerSource).toContain('startupProfiler.mark("process_start")');
    expect(indexSource).toContain('startupProfiler.mark("splash_shown")');
    expect(indexSource).toContain('startupProfiler.mark("splash_content_loaded")');
    expect(indexSource).toContain('startupProfiler.mark("main_created")');
    expect(indexSource).toContain('startupProfiler.mark("main_ready_to_show")');
    expect(appSource).toContain('markStartupReady("login_rendered")');
  });

  it("starts network polling services only after the main window is shown", () => {
    const source = readFileSync(join(currentDir, "index.ts"), "utf8");

    expect(source.indexOf("mainWindow?.show()")).toBeLessThan(source.indexOf("startBackgroundServices();"));
  });

  it("keeps production packaging on Electron GUI targets without script launchers", () => {
    const packageJson = JSON.parse(readFileSync(join(currentDir, "../../package.json"), "utf8")) as {
      build?: { win?: { target?: Array<string | { target: string }> }; files?: string[] };
    };
    const targets = packageJson.build?.win?.target ?? [];

    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ target: "nsis" }),
        expect.objectContaining({ target: "portable" })
      ])
    );
    expect(packageJson.build?.files ?? []).toContain("out/**/*");
    expect(JSON.stringify(packageJson.build)).not.toMatch(/\.bat|\.cmd|start-production/i);
  });
});
