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
  soundEnabled: false,
  enabledEventTypes: defaultEnabledEventTypes
};

const parseSettings = (value: string | null | undefined): NotificationSettings => {
  if (!value) {
    return defaultNotificationSettings;
  }

  try {
    const parsed = JSON.parse(value) as Partial<NotificationSettings>;
    return {
      desktopEnabled: parsed.desktopEnabled ?? defaultNotificationSettings.desktopEnabled,
      soundEnabled: parsed.soundEnabled ?? defaultNotificationSettings.soundEnabled,
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
    const updated: NotificationSettings = {
      desktopEnabled: input.desktopEnabled ?? current.desktopEnabled,
      soundEnabled: input.soundEnabled ?? current.soundEnabled,
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
