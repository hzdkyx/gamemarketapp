import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));

const readSource = (relativePath: string): string =>
  readFileSync(resolve(currentDir, relativePath), "utf8");

describe("pre-login HzdKyx experience", () => {
  it("uses the local MP4 intro asset through a single branding contract", () => {
    const branding = readSource("../lib/branding.ts");
    const authPage = readSource("auth.tsx");

    expect(branding).toContain(
      'introVideo: "./branding/motion/hzdkyx-intro.mp4"',
    );
    expect(branding).toContain('introVideoType: "video/mp4"');
    expect(authPage).toContain("BRAND_ASSETS.introVideo");
    expect(authPage).toContain("BRAND_ASSETS.introVideoType");
    expect(authPage).not.toContain("E:\\\\PROJETOS");
  });

  it("shows an interactive intro before the local login form", () => {
    const authPage = readSource("auth.tsx");

    expect(authPage).toContain("const IntroWelcome");
    expect(authPage).toContain("INICIAR");
    expect(authPage).toContain("showIntro");
    expect(authPage).toContain("<IntroWelcome onStart={() => setIntroComplete(true)} />");
    expect(authPage).toContain('title="Entrar na operação"');
  });

  it("keeps video restricted to auth surfaces and supports fallback/reduced motion", () => {
    const authPage = readSource("auth.tsx");
    const appShell = readSource("../components/layout/app-shell.tsx");
    const styles = readSource("../styles.css");

    expect(authPage).toContain("usePrefersReducedMotion");
    expect(authPage).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(authPage).toContain("onError={() => setVideoFailed(true)}");
    expect(styles).toContain(".auth-motion-video");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(appShell).not.toContain("introVideo");
    expect(appShell).not.toContain("<video");
  });

  it("keeps local password recovery in a body portal with keyboard close", () => {
    const authPage = readSource("auth.tsx");

    expect(authPage).toContain("createPortal(");
    expect(authPage).toContain("document.body");
    expect(authPage).toContain('event.key === "Escape"');
    expect(authPage).toContain("data-autofocus");
    expect(authPage).toContain('aria-modal="true"');
  });
});
