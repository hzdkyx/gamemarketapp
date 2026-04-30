import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppNotificationRecord,
  NotificationSettings,
} from "../../shared/contracts";
import type { AppNotificationWriteRecord } from "../repositories/app-notification-repository";

const state = vi.hoisted(() => ({
  notifications: [] as AppNotificationRecord[],
  nativeShown: 0,
  nativeClick: null as (() => void) | null,
  sentToRenderer: [] as Array<{ channel: string; payload: unknown }>,
  settings: {
    desktopEnabled: true,
    localNotificationsEnabled: true,
    soundEnabled: true,
    soundVolume: 0.7,
    showWhenMinimized: true,
    automaticPollingEnabled: true,
    pollingIntervalSeconds: 60,
    notifyNewSale: true,
    notifyMediationProblem: true,
    notifyOrderDelivered: true,
    notifyOrderCompleted: true,
    enabledEventTypes: {},
  } as NotificationSettings,
}));

const mapWriteRecord = (
  notification: AppNotificationWriteRecord,
): AppNotificationRecord => ({
  id: notification.id,
  type: notification.type,
  severity: notification.severity,
  title: notification.title,
  message: notification.message,
  orderId: notification.orderId,
  externalOrderId: notification.externalOrderId,
  eventId: notification.eventId,
  dedupeKey: notification.dedupeKey,
  readAt: notification.readAt,
  createdAt: notification.createdAt,
  metadataJson: notification.metadataJson,
});

vi.mock("electron", () => ({
  Notification: class {
    static isSupported(): boolean {
      return true;
    }

    on(event: string, handler: () => void): this {
      if (event === "click") {
        state.nativeClick = handler;
      }
      return this;
    }

    show(): void {
      state.nativeShown += 1;
    }
  },
}));

vi.mock("../repositories/app-notification-repository", () => ({
  appNotificationRepository: {
    getByDedupeKey: (dedupeKey: string) =>
      state.notifications.find((item) => item.dedupeKey === dedupeKey) ?? null,
    insert: (notification: AppNotificationWriteRecord) => {
      const record = mapWriteRecord(notification);
      state.notifications.push(record);
      return record;
    },
    list: () => ({
      items: state.notifications,
      summary: {
        total: state.notifications.length,
        unread: state.notifications.filter((item) => !item.readAt).length,
        unreadNewSales: state.notifications.filter(
          (item) => !item.readAt && item.type === "new_sale",
        ).length,
        criticalUnread: state.notifications.filter(
          (item) => !item.readAt && item.severity === "critical",
        ).length,
      },
    }),
    markRead: (id: string, readAt: string) => {
      const notification = state.notifications.find((item) => item.id === id);
      if (!notification) {
        throw new Error("Notificação local não encontrada.");
      }
      notification.readAt ??= readAt;
      return notification;
    },
    markAllRead: (readAt: string) => {
      let updated = 0;
      for (const notification of state.notifications) {
        if (!notification.readAt) {
          notification.readAt = readAt;
          updated += 1;
        }
      }
      return { updated };
    },
  },
}));

vi.mock("./settings-service", () => ({
  settingsService: {
    getNotificationSettings: () => state.settings,
  },
}));

vi.mock("../logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

const { localNotificationService, sanitizeNotificationMetadata, configureLocalNotificationWindow } =
  await import("./local-notification-service");

describe("localNotificationService", () => {
  beforeEach(() => {
    state.notifications.length = 0;
    state.nativeShown = 0;
    state.nativeClick = null;
    state.sentToRenderer.length = 0;
    state.settings = {
      ...state.settings,
      localNotificationsEnabled: true,
      soundEnabled: true,
      showWhenMinimized: true,
    };
    configureLocalNotificationWindow({
      isDestroyed: () => false,
      isMinimized: () => false,
      isVisible: () => true,
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      webContents: {
        send: (channel: string, payload: unknown) => {
          state.sentToRenderer.push({ channel, payload });
        },
      },
    } as never);
  });

  it("creates an app notification record and emits renderer payload safely", () => {
    const result = localNotificationService.notify({
      type: "new_sale",
      severity: "success",
      title: "Nova venda",
      message: "Pedido: 34831",
      orderId: "order-1",
      externalOrderId: "34831",
      dedupeKey: "sale:new:34831",
      metadata: {
        token: "secret-value",
        visible: "ok",
      },
      playSound: true,
    });

    expect(result.created).toBe(true);
    expect(result.nativeShown).toBe(true);
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.metadataJson).not.toContain("secret-value");
    expect(state.sentToRenderer[0]?.channel).toBe("notifications:created");
    expect(state.sentToRenderer[0]?.payload).toMatchObject({
      playSound: true,
      soundVolume: 0.7,
    });
  });

  it("does not surface duplicate dedupe keys twice", () => {
    localNotificationService.notify({
      type: "new_sale",
      title: "Nova venda",
      message: "Pedido: 34831",
      dedupeKey: "sale:new:34831",
      playSound: true,
    });

    const repeated = localNotificationService.notify({
      type: "new_sale",
      title: "Nova venda",
      message: "Pedido: 34831",
      dedupeKey: "sale:new:34831",
      playSound: true,
    });

    expect(repeated.created).toBe(false);
    expect(repeated.nativeShown).toBe(false);
    expect(state.notifications).toHaveLength(1);
    expect(state.nativeShown).toBe(1);
  });

  it("marks notifications as read individually and in bulk", () => {
    const first = localNotificationService.notify({
      type: "new_sale",
      title: "Nova venda",
      message: "Pedido: 1",
    }).notification;
    localNotificationService.notify({
      type: "mediation_problem",
      title: "Mediação",
      message: "Pedido: 2",
    });

    expect(localNotificationService.markRead(first.id).readAt).toBeTruthy();
    expect(localNotificationService.markAllRead().updated).toBe(1);
    expect(localNotificationService.list({ limit: 20, unreadOnly: false }).summary.unread).toBe(0);
  });

  it("masks sensitive metadata keys and values", () => {
    const masked = sanitizeNotificationMetadata({
      apiKey: "abc",
      nested: {
        rawPayload: { token: "secret" },
        message: "bearer live-token",
      },
    });

    expect(JSON.stringify(masked)).not.toContain("live-token");
    expect(JSON.stringify(masked)).not.toContain("secret");
    expect(masked).toMatchObject({
      apiKey: "[mascarado]",
      nested: {
        rawPayload: "[mascarado]",
      },
    });
  });
});
