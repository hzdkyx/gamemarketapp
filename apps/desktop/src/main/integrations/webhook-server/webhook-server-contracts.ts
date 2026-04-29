import { z } from "zod";
import {
  eventSeveritySchema,
  type WebhookServerEventDetail,
  type WebhookServerEventItem
} from "../../../shared/contracts";

const nullableTextSchema = z.string().or(z.null());

export const webhookServerHealthSchema = z
  .object({
    ok: z.literal(true),
    uptime: z.number(),
    version: z.string(),
    environment: z.string()
  })
  .passthrough();

export const webhookServerEventItemSchema = z
  .object({
    id: z.string(),
    externalEventId: nullableTextSchema,
    eventType: z.string(),
    source: z.string(),
    severity: eventSeveritySchema,
    title: z.string(),
    message: z.string(),
    payloadHash: z.string(),
    ipAddress: nullableTextSchema,
    userAgent: nullableTextSchema,
    ackedAt: nullableTextSchema,
    createdAt: z.string(),
    receivedAt: z.string(),
    hasRawPayload: z.boolean()
  })
  .strict() satisfies z.ZodType<WebhookServerEventItem>;

export const webhookServerEventDetailSchema = webhookServerEventItemSchema
  .omit({ hasRawPayload: true })
  .extend({
    rawPayloadMasked: z.unknown(),
    headersMasked: z.record(z.string(), z.unknown())
  })
  .transform((event) => ({
    ...event,
    hasRawPayload: true
  })) satisfies z.ZodType<WebhookServerEventDetail>;

export const webhookServerEventsResponseSchema = z
  .object({
    ok: z.literal(true),
    items: z.array(webhookServerEventItemSchema),
    count: z.number()
  })
  .strict();

export const webhookServerEventDetailResponseSchema = z
  .object({
    ok: z.literal(true),
    event: webhookServerEventDetailSchema
  })
  .strict();

export const webhookServerAckResponseSchema = z
  .object({
    ok: z.literal(true),
    event: z.object({
      id: z.string(),
      ackedAt: z.string().nullable()
    })
  })
  .strict();

export const webhookServerTestEventResponseSchema = z
  .object({
    ok: z.literal(true),
    event: z.object({
      id: z.string(),
      eventType: z.string(),
      severity: eventSeveritySchema,
      title: z.string(),
      message: z.string(),
      receivedAt: z.string()
    })
  })
  .strict();

export type WebhookServerHealth = z.infer<typeof webhookServerHealthSchema>;
