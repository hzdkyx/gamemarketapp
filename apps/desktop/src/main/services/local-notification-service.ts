import { Notification, type BrowserWindow } from "electron";
import { randomUUID } from "node:crypto";
import type {
  AppNotificationListInput,
  AppNotificationListResult,
  AppNotificationRecord,
  AppNotificationType,
  EventRecord,
  EventSeverity,
} from "../../shared/contracts";
import {
  appNotificationRepository,
  type AppNotificationWriteRecord,
} from "../repositories/app-notification-repository";
import { logger } from "../logger";
import { settingsService } from "./settings-service";

let notificationWindow: BrowserWindow | undefined;

const handledEventTypes = new Set<EventRecord["type"]>([
  "order.payment_confirmed",
  "order.delivered",
  "order.completed",
  "order.mediation",
  "order.problem",
  "order.refunded",
  "integration.gamemarket.order_imported",
  "integration.gamemarket.order_updated",
  "integration.webhook_server.event_imported",
]);

const sensitiveKeyPattern =
  /(api.?key|app.?sync|webhook.?ingest|database.?url|password|senha|token|secret|login|email|serial|raw.?payload|payload)/i;
const sensitiveValuePattern =
  /(gm_sk_|gmk_|bearer\s+|app_sync_token|webhook_ingest_secret|database_url)[a-z0-9._:-]*/gi;

export const sanitizeNotificationMetadata = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.replace(sensitiveValuePattern, "[mascarado]");
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeNotificationMetadata);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        sensitiveKeyPattern.test(key)
          ? "[mascarado]"
          : sanitizeNotificationMetadata(nestedValue),
      ]),
    );
  }

  return value;
};

export interface LocalNotificationInput {
  type: AppNotificationType;
  severity?: EventSeverity;
  title: string;
  message: string;
  orderId?: string | null;
  externalOrderId?: string | null;
  eventId?: string | null;
  dedupeKey?: string | null;
  metadata?: unknown;
  playSound?: boolean;
}

export interface LocalNotificationResult {
  notification: AppNotificationRecord;
  created: boolean;
  nativeShown: boolean;
  reason?: string;
}

export interface NotificationResult {
  shown: boolean;
  reason?: string;
}

export const configureLocalNotificationWindow = (window: BrowserWindow): void => {
  notificationWindow = window;
};

const nowIso = (): string => new Date().toISOString();

const focusMainWindow = (): void => {
  if (!notificationWindow || notificationWindow.isDestroyed()) {
    return;
  }

  if (notificationWindow.isMinimized()) {
    notificationWindow.restore();
  }

  if (!notificationWindow.isVisible()) {
    notificationWindow.show();
  }

  notificationWindow.focus();
};

const sendToRenderer = (
  channel: string,
  payload: Record<string, unknown>,
): void => {
  if (!notificationWindow || notificationWindow.isDestroyed()) {
    return;
  }

  notificationWindow.webContents.send(channel, payload);
};

const shouldSurfaceType = (
  type: AppNotificationType,
  settings: ReturnType<typeof settingsService.getNotificationSettings>,
): boolean => {
  if (!settings.localNotificationsEnabled) {
    return false;
  }

  if (type === "new_sale") {
    return settings.notifyNewSale;
  }

  if (type === "mediation_problem") {
    return settings.notifyMediationProblem;
  }

  if (type === "order_delivered") {
    return settings.notifyOrderDelivered;
  }

  if (type === "order_completed") {
    return settings.notifyOrderCompleted;
  }

  return true;
};

const makeWriteRecord = (
  input: LocalNotificationInput,
): AppNotificationWriteRecord => {
  const metadata =
    input.metadata === undefined
      ? null
      : JSON.stringify(sanitizeNotificationMetadata(input.metadata));

  return {
    id: randomUUID(),
    type: input.type,
    severity: input.severity ?? "info",
    title: input.title,
    message: input.message,
    orderId: input.orderId ?? null,
    externalOrderId: input.externalOrderId ?? null,
    eventId: input.eventId ?? null,
    dedupeKey: input.dedupeKey ?? null,
    readAt: null,
    createdAt: nowIso(),
    metadataJson:
      metadata && metadata.length > 4000 ? `${metadata.slice(0, 4000)}...` : metadata,
  };
};

const showNativeNotification = (
  notification: AppNotificationRecord,
  showWhenMinimized: boolean,
): { shown: boolean; reason?: string } => {
  if (!Notification.isSupported()) {
    return { shown: false, reason: "Notification API indisponível." };
  }

  if (
    notificationWindow &&
    !notificationWindow.isDestroyed() &&
    notificationWindow.isMinimized() &&
    !showWhenMinimized
  ) {
    return { shown: false, reason: "Notificação nativa omitida com app minimizado." };
  }

  try {
    const nativeNotification = new Notification({
      title: notification.title,
      body: notification.message,
      silent: true,
    });

    nativeNotification.on("click", () => {
      focusMainWindow();
      if (notification.orderId) {
        sendToRenderer("notifications:open-order", {
          orderId: notification.orderId,
        });
      }
    });
    nativeNotification.show();

    return { shown: true };
  } catch (error) {
    logger.warn(
      {
        error: error instanceof Error ? error.message : "unknown",
        notificationId: notification.id,
      },
      "Local native notification failed",
    );
    return { shown: false, reason: "Falha ao exibir notificação nativa." };
  }
};

export const localNotificationService = {
  notify(input: LocalNotificationInput): LocalNotificationResult {
    if (input.dedupeKey) {
      const existing = appNotificationRepository.getByDedupeKey(input.dedupeKey);
      if (existing) {
        return {
          notification: existing,
          created: false,
          nativeShown: false,
          reason: "Notificação duplicada ignorada.",
        };
      }
    }

    const notification = appNotificationRepository.insert(makeWriteRecord(input));
    const settings = settingsService.getNotificationSettings();
    const shouldSurface = shouldSurfaceType(notification.type, settings);
    const playSound =
      shouldSurface &&
      settings.soundEnabled &&
      (input.playSound ?? notification.type === "new_sale");
    const nativeResult = shouldSurface
      ? showNativeNotification(notification, settings.showWhenMinimized)
      : { shown: false, reason: "Notificação local desativada." };

    sendToRenderer("notifications:created", {
      notification,
      showToast: shouldSurface,
      playSound,
      soundVolume: settings.soundVolume,
    });

    const result: LocalNotificationResult = {
      notification,
      created: true,
      nativeShown: nativeResult.shown,
    };
    if (nativeResult.reason) {
      result.reason = nativeResult.reason;
    }

    return result;
  },

  notifyEvent(event: EventRecord): NotificationResult {
    if (handledEventTypes.has(event.type) && event.source !== "manual") {
      return { shown: false, reason: "Evento operacional tratado por dedupe específico." };
    }

    const settings = settingsService.getNotificationSettings();
    const eventEnabled = settings.enabledEventTypes[event.type] ?? false;
    const shouldNotify =
      settings.localNotificationsEnabled && (eventEnabled || event.severity === "critical");

    if (!shouldNotify) {
      return { shown: false, reason: "Notificação desativada para este evento." };
    }

    const result = this.notify({
      type: event.type === "system.notification_test" ? "system_test" : "internal_event",
      severity: event.severity,
      title: event.title,
      message: event.message ?? event.type,
      orderId: event.orderId,
      eventId: event.id,
      dedupeKey: `event:${event.id}`,
      metadata: {
        eventType: event.type,
        eventSource: event.source,
      },
      playSound: false,
    });

    const notificationResult: NotificationResult = {
      shown: result.nativeShown,
    };
    if (result.reason) {
      notificationResult.reason = result.reason;
    }

    return notificationResult;
  },

  show(payload: { title: string; body: string }): NotificationResult {
    const result = this.notify({
      type: "system_test",
      severity: "info",
      title: payload.title,
      message: payload.body,
      metadata: { source: "manual_test" },
      playSound: true,
    });

    const notificationResult: NotificationResult = {
      shown: result.nativeShown,
    };
    if (result.reason) {
      notificationResult.reason = result.reason;
    }

    return notificationResult;
  },

  list(input: AppNotificationListInput): AppNotificationListResult {
    return appNotificationRepository.list(input);
  },

  markRead(id: string): AppNotificationRecord {
    return appNotificationRepository.markRead(id, nowIso());
  },

  markAllRead(): { updated: number } {
    return appNotificationRepository.markAllRead(nowIso());
  },
};
