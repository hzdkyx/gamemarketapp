import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { webhookSecretParamsSchema } from "../contracts/webhook-contracts.js";
import { validateWebhookSecret } from "../services/security-service.js";
import { WebhookIngestService } from "../services/webhook-ingest-service.js";
import type { EventStorageService } from "../services/event-storage-service.js";

export const registerGameMarketWebhookRoutes = (
  app: FastifyInstance,
  config: AppConfig,
  storage: EventStorageService,
): void => {
  const service = new WebhookIngestService(storage);
  const localRateLimit = new Map<string, { count: number; resetAt: number }>();
  const windowMs = 60_000;
  const isRateLimited = (key: string): boolean => {
    const now = Date.now();
    const current = localRateLimit.get(key);
    if (!current || current.resetAt <= now) {
      localRateLimit.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }

    current.count += 1;
    return current.count > config.rateLimitMax;
  };

  app.post(
    "/webhooks/gamemarket/:secret",
    {
      config: {
        rateLimit: {
          max: config.rateLimitMax,
          timeWindow: config.rateLimitWindow,
        },
      },
    },
    async (request, reply) => {
      if (isRateLimited(request.ip ?? "unknown")) {
        return reply.code(429).send({ ok: false, error: "rate_limited" });
      }

      const params = webhookSecretParamsSchema.parse(request.params);
      if (!validateWebhookSecret(params.secret, config)) {
        return reply.code(401).send({ ok: false, error: "unauthorized" });
      }

      const userAgent = Array.isArray(request.headers["user-agent"])
        ? request.headers["user-agent"][0] ?? null
        : request.headers["user-agent"] ?? null;
      const event = await service.ingestGameMarketWebhook({
        body: request.body,
        headers: request.headers as Record<string, unknown>,
        ipAddress: request.ip ?? null,
        userAgent,
      });

      return reply.code(200).send({
        ok: true,
        accepted: true,
        id: event.id,
        eventType: event.eventType,
        severity: event.severity,
      });
    },
  );
};
