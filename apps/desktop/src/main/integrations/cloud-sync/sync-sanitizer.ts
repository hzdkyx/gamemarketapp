const exactSensitiveKeys = new Set(
  [
    "apiKey",
    "api_key",
    "gameMarketToken",
    "gamemarketToken",
    "gamemarket_token",
    "webhookSecret",
    "webhook_secret",
    "appSyncToken",
    "app_sync_token",
    "cloudSessionToken",
    "cloud_session_token",
    "cloudToken",
    "cloud_token",
    "sessionToken",
    "session_token",
    "password",
    "passwordHash",
    "password_hash",
    "accountPassword",
    "account_password",
    "accountLogin",
    "account_login",
    "accountEmail",
    "account_email",
    "serialKey",
    "serial_key",
    "secretValue",
    "secret_value",
    "encryptedSecret",
    "encrypted_secret",
    "rawPayload",
    "raw_payload",
    "rawExternalPayload",
    "raw_external_payload",
    "externalPayloadRaw",
    "external_payload_raw"
  ].map((key) => key.toLowerCase())
);

const broadSensitiveKeyPattern =
  /(password|senha|token|secret|credential|api[-_\s]?key|serial[-_\s]?key|raw[-_\s]?(external[-_\s]?)?payload|external[-_\s]?payload[-_\s]?raw)/i;

export interface SanitizedSyncPayloadResult {
  payload: Record<string, unknown>;
  ignoredFields: number;
}

interface SanitizedValueResult {
  value: unknown;
  ignoredFields: number;
}

export const isSensitiveSyncKey = (key: string): boolean => {
  const normalized = key.trim().toLowerCase();
  return exactSensitiveKeys.has(normalized) || broadSensitiveKeyPattern.test(key);
};

export const isSensitiveSettingKey = (key: unknown): boolean =>
  typeof key === "string" && isSensitiveSyncKey(key);

const sanitizeValue = (value: unknown, key = "", depth = 0): SanitizedValueResult => {
  if (key && isSensitiveSyncKey(key)) {
    return { value: undefined, ignoredFields: 1 };
  }

  if (value === null || value === undefined) {
    return { value: value ?? null, ignoredFields: 0 };
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { value, ignoredFields: 0 };
  }

  if (depth >= 8) {
    return { value: null, ignoredFields: 0 };
  }

  if (Array.isArray(value)) {
    let ignoredFields = 0;
    const sanitized = value
      .map((item) => {
        const result = sanitizeValue(item, key, depth + 1);
        ignoredFields += result.ignoredFields;
        return result.value;
      })
      .filter((item) => item !== undefined);
    return { value: sanitized, ignoredFields };
  }

  if (typeof value === "object") {
    let ignoredFields = 0;
    const sanitized = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([entryKey, entryValue]) => {
          const result = sanitizeValue(entryValue, entryKey, depth + 1);
          ignoredFields += result.ignoredFields;
          return [entryKey, result.value] as const;
        })
        .filter(([, entryValue]) => entryValue !== undefined)
    );
    return { value: sanitized, ignoredFields };
  }

  return { value: null, ignoredFields: 0 };
};

export const sanitizeSyncPayloadObjectWithStats = (
  payload: Record<string, unknown>
): SanitizedSyncPayloadResult => {
  const result = sanitizeValue(payload);
  return {
    payload: result.value && typeof result.value === "object" && !Array.isArray(result.value) ? (result.value as Record<string, unknown>) : {},
    ignoredFields: result.ignoredFields
  };
};

export const sanitizeSyncPayloadObject = (payload: Record<string, unknown>): Record<string, unknown> =>
  sanitizeSyncPayloadObjectWithStats(payload).payload;
