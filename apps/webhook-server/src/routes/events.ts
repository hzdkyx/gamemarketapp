import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { eventIdParamsSchema, eventListQuerySchema } from "../contracts/webhook-contracts.js";
import { requireAppSyncToken } from "../services/security-service.js";
import type { EventStorageService } from "../services/event-storage-service.js";

export const registerEventsRoutes = (
  app: FastifyInstance,
  config: AppConfig,
  storage: EventStorageService,
): void => {
  app.get("/api/events", async (request) => {
    requireAppSyncToken(request, config);
    const query = eventListQuerySchema.parse(request.query);
    const items = await storage.listEvents(query);

    return {
      ok: true,
      items,
      count: items.length,
    };
  });

  app.get("/api/events/:id", async (request, reply) => {
    requireAppSyncToken(request, config);
    const params = eventIdParamsSchema.parse(request.params);
    const event = await storage.getEvent(params.id);
    if (!event) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }

    return {
      ok: true,
      event,
    };
  });

  app.patch("/api/events/:id/ack", async (request, reply) => {
    requireAppSyncToken(request, config);
    const params = eventIdParamsSchema.parse(request.params);
    const event = await storage.ackEvent(params.id, new Date().toISOString());
    if (!event) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }

    return {
      ok: true,
      event: {
        id: event.id,
        ackedAt: event.ackedAt,
      },
    };
  });
};
