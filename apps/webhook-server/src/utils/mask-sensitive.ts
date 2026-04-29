const sensitiveKeyPattern =
  /(authorization|cookie|set-cookie|password|senha|token|secret|credential|api[-_]?key|x-api-key|login)/i;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const maxStringLength = 4000;
const maxArrayLength = 50;
const maxObjectKeys = 80;

const maskString = (value: string): string => {
  const withoutEmails = value.replace(emailPattern, "[email-masked]");
  return withoutEmails.length > maxStringLength ? `${withoutEmails.slice(0, maxStringLength)}...` : withoutEmails;
};

export const maskSensitive = (value: unknown, key = "", depth = 0): unknown => {
  if (sensitiveKeyPattern.test(key)) {
    return "[masked]";
  }

  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === "string") {
    return maskString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= 8) {
    return "[truncated-depth]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, maxArrayLength).map((item) => maskSensitive(item, key, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, maxObjectKeys)
        .map(([entryKey, entryValue]) => [entryKey, maskSensitive(entryValue, entryKey, depth + 1)]),
    );
  }

  return null;
};

export const maskHeaders = (headers: Record<string, unknown>): Record<string, unknown> => {
  const safeHeaders = [
    "content-type",
    "user-agent",
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "authorization",
    "cookie",
    "x-api-key",
  ];
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

  return Object.fromEntries(
    safeHeaders
      .filter((header) => normalized.has(header))
      .map((header) => [header, maskSensitive(normalized.get(header), header)]),
  );
};
