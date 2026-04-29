import { Notification, type BrowserWindow } from "electron";
import type { EventRecord } from "../../shared/contracts";
import { settingsService } from "./settings-service";

let notificationWindow: BrowserWindow | undefined;

export interface NotificationResult {
  shown: boolean;
  reason?: string;
}

export const configureNotificationWindow = (window: BrowserWindow): void => {
  notificationWindow = window;
};

const sendFallback = (payload: { title: string; body: string; severity?: EventRecord["severity"] }): void => {
  if (!notificationWindow || notificationWindow.isDestroyed()) {
    return;
  }

  notificationWindow.webContents.send("notifications:fallback", payload);
};

export const notificationService = {
  notifyEvent(event: EventRecord): NotificationResult {
    const settings = settingsService.getNotificationSettings();
    const eventEnabled = settings.enabledEventTypes[event.type] ?? false;
    const shouldNotify = settings.desktopEnabled && (eventEnabled || event.severity === "critical");

    if (!shouldNotify) {
      return { shown: false, reason: "Notificação desativada para este evento." };
    }

    const payload = {
      title: event.title,
      body: event.message ?? event.type,
      severity: event.severity
    };

    if (!Notification.isSupported()) {
      sendFallback(payload);
      return { shown: false, reason: "Notification API indisponível; fallback visual enviado ao app." };
    }

    new Notification({
      title: payload.title,
      body: payload.body,
      silent: !settings.soundEnabled
    }).show();

    return { shown: true };
  },

  show(payload: { title: string; body: string }): NotificationResult {
    const settings = settingsService.getNotificationSettings();

    if (!settings.desktopEnabled) {
      sendFallback({ ...payload, severity: "info" });
      return { shown: false, reason: "Notificações desktop desativadas; fallback visual enviado." };
    }

    if (!Notification.isSupported()) {
      sendFallback({ ...payload, severity: "info" });
      return { shown: false, reason: "Notifications are not supported on this system." };
    }

    new Notification({
      title: payload.title,
      body: payload.body,
      silent: !settings.soundEnabled
    }).show();

    return { shown: true };
  }
};
