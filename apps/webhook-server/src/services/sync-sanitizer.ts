const protectedKeyPattern =
  /^(account_login|accountLogin|account_password|accountPassword|account_email|accountEmail|account_email_password|accountEmailPassword|access_notes|accessNotes|secretValue|serialKey|apiKey|api_key|webhookSecret|webhook_secret|appSyncToken|app_sync_token|cloudSessionToken|cloud_session_token|gameMarketToken|gamemarketToken|gamemarket_token|passwordHash|password_hash|encryptedSecret|encrypted_secret|rawPayload|raw_payload|rawExternalPayload|raw_external_payload|externalPayloadRaw|external_payload_raw|rawPayloadMasked|headersMasked)$/i;

const broadSecretKeyPattern =
  /(password|senha|token|secret|credential|api[-_\s]?key|serial[-_\s]?key|raw[-_\s]?(external[-_\s]?)?payload|external[-_\s]?payload[-_\s]?raw)/i;

export const sanitizeSyncPayload = (value: unknown, key = "", depth = 0): unknown => {
  if (protectedKeyPattern.test(key) || broadSecretKeyPattern.test(key)) {
    return undefined;
  }

  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= 8) {
    return null;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeSyncPayload(item, key, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([entryKey, entryValue]) => [entryKey, sanitizeSyncPayload(entryValue, entryKey, depth + 1)] as const)
        .filter(([, entryValue]) => entryValue !== undefined),
    );
  }

  return null;
};

export const sanitizeSyncPayloadObject = (payload: Record<string, unknown>): Record<string, unknown> =>
  sanitizeSyncPayload(payload) as Record<string, unknown>;
