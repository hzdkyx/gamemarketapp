export type SqliteBindable = string | number | bigint | Buffer | null;

export const serializeJson = (value: unknown): string => JSON.stringify(value);

export const toSqliteBoolean = (value: unknown): 0 | 1 => {
  if (value === true || value === 1) {
    return 1;
  }

  return 0;
};

export const toSqliteDate = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return String(toSqliteNullable(value));
};

export const toSqliteNullable = (value: unknown): SqliteBindable => {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return toSqliteDate(value);
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === "boolean") {
    return toSqliteBoolean(value);
  }

  if (typeof value === "string" || typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (Array.isArray(value) || typeof value === "object") {
    return serializeJson(value);
  }

  return null;
};
