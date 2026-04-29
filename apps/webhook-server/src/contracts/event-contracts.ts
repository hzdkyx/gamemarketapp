import { z } from "zod";

export const gamemarketWebhookEventTypeValues = [
  "gamemarket.product.created",
  "gamemarket.product.approved",
  "gamemarket.product.rejected",
  "gamemarket.product.out_of_stock",
  "gamemarket.product.variant_sold_out",
  "gamemarket.order.created",
  "gamemarket.order.sale_confirmed",
  "gamemarket.order.delivered",
  "gamemarket.order.completed",
  "gamemarket.order.cancelled",
  "gamemarket.financial.balance_updated",
  "gamemarket.financial.funds_released",
  "gamemarket.financial.withdrawal_requested",
  "gamemarket.financial.withdrawal_completed",
  "gamemarket.financial.withdrawal_rejected",
  "gamemarket.financial.refund_started",
  "gamemarket.mediation.opened",
  "gamemarket.mediation.updated",
  "gamemarket.mediation.resolved",
  "gamemarket.review.received",
  "gamemarket.unknown",
] as const;

export const eventSeverityValues = ["info", "success", "warning", "critical"] as const;
export const eventSourceValues = ["gamemarket_webhook"] as const;

export const gamemarketWebhookEventTypeSchema = z.enum(gamemarketWebhookEventTypeValues);
export const eventSeveritySchema = z.enum(eventSeverityValues);

export type GameMarketWebhookEventType = (typeof gamemarketWebhookEventTypeValues)[number];
export type EventSeverity = (typeof eventSeverityValues)[number];
export type EventSource = (typeof eventSourceValues)[number];

export interface StoredWebhookEvent {
  id: string;
  externalEventId: string | null;
  eventType: GameMarketWebhookEventType;
  source: EventSource;
  severity: EventSeverity;
  title: string;
  message: string;
  rawPayloadMasked: unknown;
  payloadHash: string;
  headersMasked: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  ackedAt: string | null;
  createdAt: string;
  receivedAt: string;
}

export type EventListItem = Omit<StoredWebhookEvent, "rawPayloadMasked" | "headersMasked"> & {
  hasRawPayload: boolean;
};

export interface EventListFilters {
  since?: string;
  limit: number;
  unreadOnly: boolean;
  type?: GameMarketWebhookEventType;
  severity?: EventSeverity;
}

export interface EventCreateInput {
  externalEventId: string | null;
  eventType: GameMarketWebhookEventType;
  source: EventSource;
  severity: EventSeverity;
  title: string;
  message: string;
  rawPayloadMasked: unknown;
  payloadHash: string;
  headersMasked: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  receivedAt: string;
}
