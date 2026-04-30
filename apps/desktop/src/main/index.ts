import { BrowserWindow, app, ipcMain, shell } from "electron";
import { join } from "node:path";
import { initializeDatabase, getDatabaseStatus } from "./database/database";
import { registerAppNotificationsIpc } from "./ipc/app-notifications-ipc";
import { registerAuthIpc } from "./ipc/auth-ipc";
import { registerDashboardIpc } from "./ipc/dashboard-ipc";
import { registerEventsIpc } from "./ipc/events-ipc";
import { registerGameMarketIpc } from "./ipc/gamemarket-ipc";
import { registerInventoryIpc } from "./ipc/inventory-ipc";
import { registerOrdersIpc } from "./ipc/orders-ipc";
import { registerProfitIpc } from "./ipc/profit-ipc";
import { registerProductsIpc } from "./ipc/products-ipc";
import { registerSettingsIpc } from "./ipc/settings-ipc";
import { registerWebhookServerIpc } from "./ipc/webhook-server-ipc";
import { webhookServerPollingService } from "./integrations/webhook-server/webhook-server-polling-service";
import { gameMarketPollingService } from "./integrations/gamemarket/gamemarket-polling-service";
import { logger } from "./logger";
import {
  configureNotificationWindow,
  notificationService,
} from "./services/notification-service";

let mainWindow: BrowserWindow | undefined;
const appUserModelId = "com.hzdk.gamemarket.manager";

if (process.platform === "win32") {
  app.setAppUserModelId(appUserModelId);
}

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: "HzdKyx GameMarket Manager",
    backgroundColor: "#07080d",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
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

app.whenReady().then(() => {
  registerIpcHandlers();

  try {
    const status = initializeDatabase();
    logger.info({ databasePath: status.path }, "SQLite initialized");
    webhookServerPollingService.refresh();
    gameMarketPollingService.refresh();
  } catch (error) {
    logger.error({ error }, "Failed to initialize SQLite");
  }

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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
