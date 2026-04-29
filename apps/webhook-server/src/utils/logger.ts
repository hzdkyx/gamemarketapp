import pino from "pino";
import type { AppConfig } from "../config.js";

export const createLogger = (config: Pick<AppConfig, "logLevel">) =>
  pino({
    level: config.logLevel,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.cookie",
        "*.token",
        "*.secret",
        "*.password",
      ],
      censor: "[masked]",
    },
  });
