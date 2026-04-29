import pino from "pino";

export const logger = pino({
  name: "hzdk-gamemarket-manager",
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "apiKey",
      "token",
      "password",
      "passwordHash",
      "*.apiKey",
      "*.token",
      "*.password",
      "*.passwordHash"
    ],
    censor: "[redacted]"
  }
});
