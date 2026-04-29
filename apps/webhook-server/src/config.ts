import "dotenv/config";
import { join } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().trim().optional().default(""),
  WEBHOOK_INGEST_SECRET: z.string().trim().min(8, "WEBHOOK_INGEST_SECRET must be configured."),
  APP_SYNC_TOKEN: z.string().trim().min(8, "APP_SYNC_TOKEN must be configured."),
  ALLOWED_ORIGINS: z.string().trim().optional().default(""),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

const weakSecretPattern = /^(change_me|changeme|secret|token|password|123456)/i;

export interface AppConfig {
  port: number;
  environment: "development" | "test" | "production";
  databaseUrl: string | null;
  localStoragePath: string;
  webhookIngestSecret: string;
  appSyncToken: string;
  allowedOrigins: string[];
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  bodyLimitBytes: number;
  rateLimitMax: number;
  rateLimitWindow: string;
}

const parseAllowedOrigins = (value: string): string[] =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

const assertStrongProductionSecret = (name: string, value: string): void => {
  if (value.length < 32 || weakSecretPattern.test(value)) {
    throw new Error(`${name} must be a strong random value with at least 32 characters in production.`);
  }
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid webhook-server environment: ${message}`);
  }

  const values = parsed.data;
  const databaseUrl = values.DATABASE_URL.trim() || null;

  if (values.NODE_ENV === "production") {
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required in production. Railway filesystem should not be primary storage.");
    }
    assertStrongProductionSecret("WEBHOOK_INGEST_SECRET", values.WEBHOOK_INGEST_SECRET);
    assertStrongProductionSecret("APP_SYNC_TOKEN", values.APP_SYNC_TOKEN);
  }

  return {
    port: values.PORT,
    environment: values.NODE_ENV,
    databaseUrl,
    localStoragePath: join(process.cwd(), "data", "webhook-events.json"),
    webhookIngestSecret: values.WEBHOOK_INGEST_SECRET,
    appSyncToken: values.APP_SYNC_TOKEN,
    allowedOrigins: parseAllowedOrigins(values.ALLOWED_ORIGINS),
    logLevel: values.LOG_LEVEL,
    bodyLimitBytes: 256 * 1024,
    rateLimitMax: 60,
    rateLimitWindow: "1 minute",
  };
};
