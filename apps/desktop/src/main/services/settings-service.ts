import { eventTypeValues, type NotificationSettings, type NotificationSettingsUpdateInput } from "../../shared/contracts";
import { getSqliteDatabase } from "../database/database";

const notificationSettingsKey = "notificationSettings";

const defaultEnabledEventTypes = Object.fromEntries(
  eventTypeValues.map((type) => [
    type,
    [
      "order.payment_confirmed",
      "order.mediation",
      "order.refunded",
      "order.problem",
      "product.low_stock",
      "product.out_of_stock",
      "integration.webhook_server.review_received",
      "integration.webhook_server.variant_sold_out",
      "integration.webhook_server.unknown_event",
      "system.notification_test"
    ].includes(type)
  ])
) as Record<string, boolean>;

export const defaultNotificationSettings: NotificationSettings = {
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
  enabledEventTypes: defaultEnabledEventTypes
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
};

const parseSettings = (value: string | null | undefined): NotificationSettings => {
  if (!value) {
    return defaultNotificationSettings;
  }

  try {
    const parsed = JSON.parse(value) as Partial<NotificationSettings>;
    const localNotificationsEnabled =
      parsed.localNotificationsEnabled ?? parsed.desktopEnabled ?? defaultNotificationSettings.localNotificationsEnabled;

    return {
      desktopEnabled: localNotificationsEnabled,
      localNotificationsEnabled,
      soundEnabled: parsed.soundEnabled ?? defaultNotificationSettings.soundEnabled,
      soundVolume: clampNumber(
        parsed.soundVolume,
        defaultNotificationSettings.soundVolume,
        0,
        1
      ),
      showWhenMinimized: parsed.showWhenMinimized ?? defaultNotificationSettings.showWhenMinimized,
      automaticPollingEnabled:
        parsed.automaticPollingEnabled ?? defaultNotificationSettings.automaticPollingEnabled,
      pollingIntervalSeconds: Math.round(
        clampNumber(
          parsed.pollingIntervalSeconds,
          defaultNotificationSettings.pollingIntervalSeconds,
          15,
          3600
        )
      ),
      notifyNewSale: parsed.notifyNewSale ?? defaultNotificationSettings.notifyNewSale,
      notifyMediationProblem:
        parsed.notifyMediationProblem ?? defaultNotificationSettings.notifyMediationProblem,
      notifyOrderDelivered:
        parsed.notifyOrderDelivered ?? defaultNotificationSettings.notifyOrderDelivered,
      notifyOrderCompleted:
        parsed.notifyOrderCompleted ?? defaultNotificationSettings.notifyOrderCompleted,
      enabledEventTypes: {
        ...defaultNotificationSettings.enabledEventTypes,
        ...(parsed.enabledEventTypes ?? {})
      }
    };
  } catch {
    return defaultNotificationSettings;
  }
};

export const settingsService = {
  getNotificationSettings(): NotificationSettings {
    const db = getSqliteDatabase();
    const row = db
      .prepare("SELECT value_json FROM settings WHERE key = ?")
      .get(notificationSettingsKey) as { value_json: string } | undefined;

    return parseSettings(row?.value_json);
  },

  updateNotificationSettings(input: NotificationSettingsUpdateInput): NotificationSettings {
    const current = this.getNotificationSettings();
    const localNotificationsEnabled =
      input.localNotificationsEnabled ?? input.desktopEnabled ?? current.localNotificationsEnabled;
    const updated: NotificationSettings = {
      desktopEnabled: localNotificationsEnabled,
      localNotificationsEnabled,
      soundEnabled: input.soundEnabled ?? current.soundEnabled,
      soundVolume: clampNumber(input.soundVolume, current.soundVolume, 0, 1),
      showWhenMinimized: input.showWhenMinimized ?? current.showWhenMinimized,
      automaticPollingEnabled: input.automaticPollingEnabled ?? current.automaticPollingEnabled,
      pollingIntervalSeconds: Math.round(
        clampNumber(input.pollingIntervalSeconds, current.pollingIntervalSeconds, 15, 3600)
      ),
      notifyNewSale: input.notifyNewSale ?? current.notifyNewSale,
      notifyMediationProblem: input.notifyMediationProblem ?? current.notifyMediationProblem,
      notifyOrderDelivered: input.notifyOrderDelivered ?? current.notifyOrderDelivered,
      notifyOrderCompleted: input.notifyOrderCompleted ?? current.notifyOrderCompleted,
      enabledEventTypes: {
        ...current.enabledEventTypes,
        ...(input.enabledEventTypes ?? {})
      }
    };
    const timestamp = new Date().toISOString();
    const db = getSqliteDatabase();

    db.prepare(
      `
        INSERT INTO settings (key, value_json, is_secret, updated_at)
        VALUES (@key, @valueJson, 0, @updatedAt)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          is_secret = excluded.is_secret,
          updated_at = excluded.updated_at
      `
    ).run({
      key: notificationSettingsKey,
      valueJson: JSON.stringify(updated),
      updatedAt: timestamp
    });

    return updated;
  }
};
