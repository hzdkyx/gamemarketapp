import type { EventStorageService } from "./event-storage-service.js";
import { normalizeGameMarketWebhookEvent } from "./event-normalizer-service.js";
import { maskHeaders, maskSensitive } from "../utils/mask-sensitive.js";
import { hashPayload } from "../utils/hash-payload.js";
import type { StoredWebhookEvent } from "../contracts/event-contracts.js";

export interface WebhookIngestInput {
  body: unknown;
  headers: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
}

export class WebhookIngestService {
  constructor(private readonly storage: EventStorageService) {}

  async ingestGameMarketWebhook(input: WebhookIngestInput): Promise<StoredWebhookEvent> {
    const receivedAt = new Date().toISOString();
    const normalized = normalizeGameMarketWebhookEvent(input.body);

    return this.storage.createEvent({
      externalEventId: normalized.externalEventId,
      eventType: normalized.eventType,
      source: "gamemarket_webhook",
      severity: normalized.severity,
      title: normalized.title,
      message: normalized.message,
      rawPayloadMasked: maskSensitive(input.body),
      payloadHash: hashPayload(input.body),
      headersMasked: maskHeaders(input.headers),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: normalized.createdAt ?? receivedAt,
      receivedAt,
    });
  }
}
