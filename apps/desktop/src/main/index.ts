import { BrowserWindow, Menu, app, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { initializeDatabase, getDatabaseStatus } from "./database/database";
import { registerAppNotificationsIpc } from "./ipc/app-notifications-ipc";
import { registerAuthIpc } from "./ipc/auth-ipc";
import { registerCloudSyncIpc } from "./ipc/cloud-sync-ipc";
import { registerDashboardIpc } from "./ipc/dashboard-ipc";
import { registerEventsIpc } from "./ipc/events-ipc";
import { registerGameMarketIpc } from "./ipc/gamemarket-ipc";
import { registerInventoryIpc } from "./ipc/inventory-ipc";
import { registerOrdersIpc } from "./ipc/orders-ipc";
import { registerProfitIpc } from "./ipc/profit-ipc";
import { registerProductsIpc } from "./ipc/products-ipc";
import { registerSettingsIpc } from "./ipc/settings-ipc";
import { registerWebhookServerIpc } from "./ipc/webhook-server-ipc";
import { cloudSyncPollingService } from "./integrations/cloud-sync/cloud-sync-polling-service";
import { webhookServerPollingService } from "./integrations/webhook-server/webhook-server-polling-service";
import { gameMarketPollingService } from "./integrations/gamemarket/gamemarket-polling-service";
import { logger } from "./logger";
import {
  configureNotificationWindow,
  notificationService,
} from "./services/notification-service";
import { createSplashWindow, type SplashWindowController } from "./splash-window";
import { startupProfiler } from "./startup-profiler";

let mainWindow: BrowserWindow | undefined;
let splashWindow: SplashWindowController | undefined;
let backgroundServicesStarted = false;
const rendererStartupMarks = new Set<string>();
const appUserModelId = "com.hzdk.gamemarket.manager";
const minimumProductionSplashMs = 1200;

const getWindowIconPath = (): string | undefined => {
  const candidates = app.isPackaged
    ? [
        join(process.resourcesPath, "branding/icon.png"),
        join(__dirname, "../renderer/branding/hzdkyx-logo-icon.png"),
      ]
    : [
        join(app.getAppPath(), "buildResources/icon.png"),
        join(__dirname, "../renderer/branding/hzdkyx-logo-icon.png"),
      ];

  return candidates.find((candidate) => existsSync(candidate));
};

if (process.platform === "win32") {
  app.setAppUserModelId(appUserModelId);
}

const startBackgroundServices = (): void => {
  if (backgroundServicesStarted) {
    return;
  }

  backgroundServicesStarted = true;
  startupProfiler.mark("background_services_start");
  setTimeout(() => {
    webhookServerPollingService.refresh();
    gameMarketPollingService.refresh();
    cloudSyncPollingService.refresh({ runInitial: true });
    startupProfiler.mark("background_services_end");
  }, 0);
};

const createWindow = (): void => {
  startupProfiler.mark("main_window_create_start");
  const windowIconPath = getWindowIconPath();
  const browserWindowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: "HzdKyx GameMarket Manager",
    backgroundColor: "#07080d",
    autoHideMenuBar: app.isPackaged,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  if (windowIconPath) {
    browserWindowOptions.icon = windowIconPath;
  }

  mainWindow = new BrowserWindow(browserWindowOptions);

  startupProfiler.mark("main_created");
  startupProfiler.mark("main_window_create_end");
  mainWindow.webContents.once("dom-ready", () => {
    startupProfiler.mark("renderer_dom_ready");
  });
  mainWindow.webContents.once("did-finish-load", () => {
    startupProfiler.mark("renderer_ready");
  });
  mainWindow.once("ready-to-show", async () => {
    startupProfiler.mark("main_ready_to_show");
    startupProfiler.mark("main_window_ready_to_show");
    splashWindow?.setMessage("Abrindo painel...");
    if (splashWindow && app.isPackaged) {
      await splashWindow.waitForMinimumVisible(minimumProductionSplashMs);
    }
    mainWindow?.show();
    startupProfiler.mark("main_window_shown");
    splashWindow?.close();
    splashWindow = undefined;
    logger.info(
      {
        totalMs: startupProfiler.getTotalMs(),
        marks: startupProfiler.getMarks()
      },
      "Startup timings"
    );
    startBackgroundServices();
  });
  mainWindow.on("focus", () => {
    cloudSyncPollingService.syncOnFocus();
  });
  configureNotificationWindow(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

const registerIpcHandlers = (): void => {
  ipcMain.on("startup:renderer-mark", (_event, payload: { name?: unknown }) => {
    if (typeof payload.name !== "string") {
      return;
    }
    const allowedMarks = new Set(["login_rendered", "initial_setup_rendered", "authenticated_shell_rendered"]);
    if (!allowedMarks.has(payload.name) || rendererStartupMarks.has(payload.name)) {
      return;
    }

    rendererStartupMarks.add(payload.name);
    startupProfiler.mark(payload.name);
    logger.info(
      {
        totalMs: startupProfiler.getTotalMs(),
        marks: startupProfiler.getMarks()
      },
      "Startup renderer timings"
    );
  });

  registerAuthIpc(ipcMain);
  registerProductsIpc(ipcMain);
  registerInventoryIpc(ipcMain);
  registerOrdersIpc(ipcMain);
  registerEventsIpc(ipcMain);
  registerProfitIpc(ipcMain);
  registerDashboardIpc(ipcMain);
  registerSettingsIpc(ipcMain);
  registerAppNotificationsIpc(ipcMain);
  registerGameMarketIpc(ipcMain);
  registerWebhookServerIpc(ipcMain);
  registerCloudSyncIpc(ipcMain);

  ipcMain.handle("app:get-meta", () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
  }));

  ipcMain.handle("database:get-status", () => getDatabaseStatus());

  ipcMain.handle(
    "notifications:show",
    (_event, payload: { title: string; body: string }) =>
      notificationService.show(payload),
  );
};

app.whenReady().then(async () => {
  startupProfiler.mark("app_ready");
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
  }

  try {
    splashWindow = createSplashWindow();
    splashWindow.window.once("show", () => {
      startupProfiler.mark("splash_shown");
    });
    splashWindow.setMessage("Splash carregando...");
    await splashWindow.ready;
    startupProfiler.mark("splash_content_loaded");
  } catch (error) {
    splashWindow = undefined;
    startupProfiler.mark("splash_failed");
    logger.warn({ error }, "Native splash window failed, renderer BootSplash fallback will be used");
  }

  splashWindow?.setMessage("Inicializando segurança...");
  registerIpcHandlers();

  try {
    splashWindow?.setMessage("Carregando banco local...");
    const status = initializeDatabase();
    logger.info({ databasePath: status.path }, "SQLite initialized");
  } catch (error) {
    logger.error({ error }, "Failed to initialize SQLite");
    splashWindow?.setMessage("Não foi possível carregar o banco local.");
  }

  splashWindow?.setMessage("Preparando interface...");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  webhookServerPollingService.stop();
  gameMarketPollingService.stop();
  cloudSyncPollingService.stop();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
