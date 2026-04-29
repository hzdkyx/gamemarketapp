import type { EventSeverity, WebhookServerEventDetail, WebhookServerEventItem } from "../../../shared/contracts";
import {
  webhookServerAckResponseSchema,
  webhookServerEventDetailResponseSchema,
  webhookServerEventsResponseSchema,
  webhookServerHealthSchema,
  webhookServerTestEventResponseSchema,
  type WebhookServerHealth
} from "./webhook-server-contracts";
import {
  WebhookServerAuthError,
  WebhookServerHttpError,
  WebhookServerNetworkError,
  WebhookServerValidationError
} from "./webhook-server-errors";

export interface WebhookServerClientOptions {
  baseUrl: string;
  appSyncToken: string;
  fetchImpl?: typeof fetch;
}

export interface WebhookServerListEventsInput {
  since?: string | null;
  limit?: number;
  unreadOnly?: boolean;
  type?: string | null;
  severity?: EventSeverity | null;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const toSafeJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export class WebhookServerClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: WebhookServerClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.appSyncToken}`,
          ...(init.headers ?? {})
        }
      });
    } catch (error) {
      throw new WebhookServerNetworkError(error instanceof Error ? error.message : "Network error");
    }

    if (response.status === 401) {
      throw new WebhookServerAuthError();
    }

    if (!response.ok) {
      throw new WebhookServerHttpError(`Webhook Server HTTP ${response.status}`, response.status);
    }

    return toSafeJson(response);
  }

  async health(): Promise<WebhookServerHealth> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/health`, {
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      });
    } catch (error) {
      throw new WebhookServerNetworkError(error instanceof Error ? error.message : "Network error");
    }

    if (!response.ok) {
      throw new WebhookServerHttpError(`Webhook Server HTTP ${response.status}`, response.status);
    }

    const parsed = webhookServerHealthSchema.safeParse(await toSafeJson(response));
    if (!parsed.success) {
      throw new WebhookServerValidationError("Invalid health response.");
    }

    return parsed.data;
  }

  async listEvents(input: WebhookServerListEventsInput = {}): Promise<WebhookServerEventItem[]> {
    const params = new URLSearchParams();
    params.set("limit", String(input.limit ?? 50));
    if (input.since) {
      params.set("since", input.since);
    }
    if (input.unreadOnly !== undefined) {
      params.set("unreadOnly", String(input.unreadOnly));
    }
    if (input.type) {
      params.set("type", input.type);
    }
    if (input.severity) {
      params.set("severity", input.severity);
    }

    const parsed = webhookServerEventsResponseSchema.safeParse(
      await this.request(`/api/events?${params.toString()}`, { method: "GET" })
    );
    if (!parsed.success) {
      throw new WebhookServerValidationError("Invalid events response.");
    }

    return parsed.data.items;
  }

  async getEvent(id: string): Promise<WebhookServerEventDetail> {
    const parsed = webhookServerEventDetailResponseSchema.safeParse(
      await this.request(`/api/events/${encodeURIComponent(id)}`, { method: "GET" })
    );
    if (!parsed.success) {
      throw new WebhookServerValidationError("Invalid event detail response.");
    }

    return parsed.data.event;
  }

  async ackEvent(id: string): Promise<void> {
    const parsed = webhookServerAckResponseSchema.safeParse(
      await this.request(`/api/events/${encodeURIComponent(id)}/ack`, {
        method: "PATCH",
        body: "{}"
      })
    );
    if (!parsed.success) {
      throw new WebhookServerValidationError("Invalid ack response.");
    }
  }

  async sendTestEvent(eventType = "gamemarket.order.sale_confirmed"): Promise<{
    id: string;
    eventType: string;
    severity: EventSeverity;
    message: string;
  }> {
    const parsed = webhookServerTestEventResponseSchema.safeParse(
      await this.request("/api/test-events", {
        method: "POST",
        body: JSON.stringify({ eventType })
      })
    );
    if (!parsed.success) {
      throw new WebhookServerValidationError("Invalid test-event response.");
    }

    return {
      id: parsed.data.event.id,
      eventType: parsed.data.event.eventType,
      severity: parsed.data.event.severity,
      message: parsed.data.event.message
    };
  }
}
