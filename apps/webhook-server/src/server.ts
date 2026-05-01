import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "./config.js";
import type { EventStorageService } from "./services/event-storage-service.js";
import type { CloudStorageService } from "./services/cloud-storage-service.js";
import { registerCloudAuthRoutes } from "./routes/cloud-auth.js";
import { registerCloudSyncRoutes } from "./routes/cloud-sync.js";
import { registerCloudWorkspaceRoutes } from "./routes/cloud-workspaces.js";
import { registerEventsRoutes } from "./routes/events.js";
import { registerGameMarketWebhookRoutes } from "./routes/gamemarket-webhooks.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerTestEventsRoutes } from "./routes/test-events.js";

export interface BuildServerOptions {
  config: AppConfig;
  storage: EventStorageService;
  cloud: CloudStorageService;
}

export const buildServer = ({ config, storage, cloud }: BuildServerOptions): FastifyInstance => {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "request.headers.authorization",
        "request.headers.cookie",
      ],
    },
    bodyLimit: config.bodyLimitBytes,
  });

  void app.register(helmet);
  void app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, config.allowedOrigins.includes(origin));
    },
  });
  void app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error instanceof z.ZodError) {
      const syncEntitiesIssue = error.issues.some(
        (issue) => issue.path[0] === "entities" || issue.path[0] === "changes",
      );
      return reply.code(400).send({
        ok: false,
        error: "request_error",
        message: syncEntitiesIssue
          ? "Payload de sincronização inválido: informe entities como array, mesmo vazio."
          : "Payload inválido.",
      });
    }

    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode >= 500) {
      app.log.error({ error }, "Unhandled webhook-server error");
    }

    return reply.code(statusCode).send({
      ok: false,
      error: statusCode >= 500 ? "internal_error" : "request_error",
      message: statusCode >= 500 ? "Internal server error." : error.message,
    });
  });

  registerCloudAuthRoutes(app, cloud);
  registerCloudWorkspaceRoutes(app, cloud);
  registerCloudSyncRoutes(app, cloud);
  registerHealthRoutes(app, config);
  registerGameMarketWebhookRoutes(app, config, storage);
  registerEventsRoutes(app, config, storage);
  registerTestEventsRoutes(app, config, storage);

  return app;
};
