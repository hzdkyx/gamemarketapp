import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { testEventInputSchema } from "../contracts/webhook-contracts.js";
import { getEventMetadata } from "../services/event-normalizer-service.js";
import { requireAppSyncToken } from "../services/security-service.js";
import type { EventStorageService } from "../services/event-storage-service.js";
import { maskSensitive } from "../utils/mask-sensitive.js";
import { hashPayload } from "../utils/hash-payload.js";

export const registerTestEventsRoutes = (
  app: FastifyInstance,
  config: AppConfig,
  storage: EventStorageService,
): void => {
  app.post("/api/test-events", async (request, reply) => {
    requireAppSyncToken(request, config);
    const input = testEventInputSchema.parse(request.body ?? {});
    const metadata = getEventMetadata(input.eventType);
    const receivedAt = new Date().toISOString();
    const payload = input.payload ?? {
      event: input.eventType,
      source: "manual-test",
      createdAt: receivedAt,
    };

    const event = await storage.createEvent({
      externalEventId: null,
      eventType: input.eventType,
      source: "gamemarket_webhook",
      severity: metadata.severity,
      title: input.title ?? metadata.title,
      message: input.message ?? metadata.message,
      rawPayloadMasked: maskSensitive(payload),
      payloadHash: hashPayload(payload),
      headersMasked: {},
      ipAddress: request.ip ?? null,
      userAgent: null,
      createdAt: receivedAt,
      receivedAt,
    });

    return reply.code(201).send({
      ok: true,
      event: {
        id: event.id,
        eventType: event.eventType,
        severity: event.severity,
        title: event.title,
        message: event.message,
        receivedAt: event.receivedAt,
      },
    });
  });
};
