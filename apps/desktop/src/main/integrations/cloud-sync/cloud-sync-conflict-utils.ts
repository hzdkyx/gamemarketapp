import type { CloudSyncConflictFieldDiff } from "../../../shared/contracts";
import { isSensitiveSyncKey } from "./sync-sanitizer";

export const sensitiveConflictPlaceholder = "Campo sensível omitido";

const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) {
    return String(value ?? null);
  }

  if (typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
};

const sanitizeValue = (
  value: unknown,
  key: string,
  path: string,
  omittedFields: Set<string>,
  depth = 0,
): unknown => {
  if (key && isSensitiveSyncKey(key)) {
    omittedFields.add(path || key);
    return sensitiveConflictPlaceholder;
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
    return value.map((item, index) => sanitizeValue(item, key, `${path}[${index}]`, omittedFields, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, entryKey, path ? `${path}.${entryKey}` : entryKey, omittedFields, depth + 1),
      ]),
    );
  }

  return null;
};

export const parseConflictPayload = (value: unknown): Record<string, unknown> => {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};

export const sanitizeConflictPayload = (
  payload: Record<string, unknown>,
): { payload: Record<string, unknown>; omittedFields: string[] } => {
  const omittedFields = new Set<string>();
  const sanitized = sanitizeValue(payload, "", "", omittedFields);

  return {
    payload: sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? (sanitized as Record<string, unknown>) : {},
    omittedFields: [...omittedFields].sort(),
  };
};

export const buildConflictDiff = (
  localPayload: Record<string, unknown>,
  remotePayload: Record<string, unknown>,
  omittedSensitiveFields: string[] = [],
): CloudSyncConflictFieldDiff[] => {
  const fields = [...new Set([...Object.keys(localPayload), ...Object.keys(remotePayload), ...omittedSensitiveFields])]
    .filter((field) => field.trim().length > 0)
    .sort((left, right) => left.localeCompare(right));

  const sensitiveFields = new Set(omittedSensitiveFields.map((field) => field.split(".")[0] ?? field));

  return fields.map((field) => {
    const localValue = localPayload[field] ?? null;
    const remoteValue = remotePayload[field] ?? null;
    const sensitive = sensitiveFields.has(field) || isSensitiveSyncKey(field);
    return {
      field,
      localValue: sensitive ? sensitiveConflictPlaceholder : localValue,
      remoteValue: sensitive ? sensitiveConflictPlaceholder : remoteValue,
      changed: sensitive || stableStringify(localValue) !== stableStringify(remoteValue),
      sensitive,
    };
  });
};

export const summarizeChangedFields = (
  localPayload: Record<string, unknown>,
  remotePayload: Record<string, unknown>,
  omittedSensitiveFields: string[] = [],
): string[] =>
  buildConflictDiff(localPayload, remotePayload, omittedSensitiveFields)
    .filter((item) => item.changed)
    .map((item) => item.field);
