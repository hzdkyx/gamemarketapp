import { BrowserWindow } from "electron";

export interface SplashWindowController {
  window: BrowserWindow;
  ready: Promise<void>;
  setMessage(message: string): void;
  waitForMinimumVisible(minimumMs: number): Promise<void>;
  close(): void;
}

const splashHtml = `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        width: 100vw;
        height: 100vh;
        display: grid;
        place-items: center;
        overflow: hidden;
        background:
          radial-gradient(circle at 30% 18%, rgba(56, 189, 248, 0.2), transparent 34%),
          linear-gradient(135deg, #07080d 0%, #0b1020 52%, #05060a 100%);
        color: #f8fafc;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .shell {
        width: 100%;
        height: 100%;
        border: 1px solid rgba(148, 163, 184, 0.18);
        display: grid;
        place-items: center;
        position: relative;
      }
      .brand {
        display: grid;
        justify-items: center;
        gap: 12px;
      }
      .mark {
        width: 62px;
        height: 62px;
        display: grid;
        place-items: center;
        border-radius: 18px;
        background: linear-gradient(135deg, rgba(34, 211, 238, 0.95), rgba(168, 85, 247, 0.88));
        box-shadow: 0 22px 60px rgba(34, 211, 238, 0.22);
        font-weight: 900;
        letter-spacing: 0;
        color: #031018;
        animation: pulse 1.8s ease-in-out infinite;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: #94a3b8;
        font-size: 13px;
      }
      .status {
        position: absolute;
        left: 34px;
        right: 34px;
        bottom: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        color: #cbd5e1;
        font-size: 12px;
      }
      .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(148, 163, 184, 0.25);
        border-top-color: #22d3ee;
        border-radius: 999px;
        animation: spin 0.9s linear infinite;
      }
      .closing {
        opacity: 0;
        transform: scale(0.985);
        transition: opacity 180ms ease, transform 180ms ease;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes pulse {
        0%, 100% { transform: translateY(0); filter: brightness(1); }
        50% { transform: translateY(-2px); filter: brightness(1.12); }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="brand">
        <div class="mark">Hz</div>
        <h1>HzdKyx</h1>
        <p>GameMarket Manager</p>
      </section>
      <div class="status">
        <span class="spinner" aria-hidden="true"></span>
        <span id="status">Inicializando aplicativo...</span>
      </div>
    </main>
    <script>
      window.setSplashStatus = (message) => {
        document.getElementById("status").textContent = message;
      };
      window.closeSplash = () => {
        document.body.classList.add("closing");
      };
    </script>
  </body>
</html>`;

export const createSplashWindow = (): SplashWindowController => {
  let ready = false;
  let lastMessage = "Inicializando aplicativo...";
  let visibleSince = Date.now();
  let resolveReady: () => void = () => undefined;
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const window = new BrowserWindow({
    width: 440,
    height: 300,
    center: true,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    focusable: true,
    show: false,
    skipTaskbar: true,
    backgroundColor: "#07080d",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.once("did-finish-load", () => {
    ready = true;
    void window.webContents
      .executeJavaScript(`window.setSplashStatus(${JSON.stringify(lastMessage)})`)
      .catch(() => undefined);
    if (!window.isDestroyed()) {
      window.center();
      window.setAlwaysOnTop(true, "floating");
      window.show();
      window.focus();
      window.moveTop();
      visibleSince = Date.now();
    }
    resolveReady();
  });
  window.webContents.once("did-fail-load", () => {
    resolveReady();
  });
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);

  return {
    window,
    ready: readyPromise,
    setMessage(message: string): void {
      lastMessage = message;
      if (!window.isDestroyed() && ready) {
        void window.webContents
          .executeJavaScript(`window.setSplashStatus(${JSON.stringify(message)})`)
          .catch(() => undefined);
      }
    },
    async waitForMinimumVisible(minimumMs: number): Promise<void> {
      const elapsed = Date.now() - visibleSince;
      if (elapsed >= minimumMs) {
        return;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, minimumMs - elapsed);
      });
    },
    close(): void {
      if (window.isDestroyed()) {
        return;
      }
      void window.webContents.executeJavaScript("window.closeSplash()").catch(() => undefined);
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.close();
        }
      }, 190);
    },
  };
};
