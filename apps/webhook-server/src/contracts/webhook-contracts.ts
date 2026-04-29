import { z } from "zod";
import {
  eventSeveritySchema,
  gamemarketWebhookEventTypeSchema,
} from "./event-contracts.js";

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return ["1", "true", "yes", "sim"].includes(value.toLowerCase());
  }
  return false;
}, z.boolean());

export const eventListQuerySchema = z
  .object({
    since: z.string().trim().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    unreadOnly: booleanQuerySchema.default(false),
    type: gamemarketWebhookEventTypeSchema.optional(),
    severity: eventSeveritySchema.optional(),
  })
  .strict();

export const eventIdParamsSchema = z.object({ id: z.string().trim().min(1) }).strict();
export const webhookSecretParamsSchema = z.object({ secret: z.string().trim().min(1) }).strict();

export const testEventInputSchema = z
  .object({
    eventType: gamemarketWebhookEventTypeSchema.default("gamemarket.order.sale_confirmed"),
    title: z.string().trim().min(1).max(180).optional(),
    message: z.string().trim().min(1).max(500).optional(),
    payload: z.unknown().optional(),
  })
  .strict();
