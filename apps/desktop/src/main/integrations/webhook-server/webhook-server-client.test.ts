import { describe, expect, it, vi } from "vitest";
import { WebhookServerClient } from "./webhook-server-client";
import { WebhookServerAuthError, WebhookServerValidationError } from "./webhook-server-errors";

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json"
    }
  });

describe("WebhookServerClient", () => {
  it("tests health without exposing token and lists events with bearer auth", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith("/health")) {
        return jsonResponse({ ok: true, uptime: 1, version: "0.1.0", environment: "test" });
      }

      return jsonResponse({
        ok: true,
        count: 1,
        items: [
          {
            id: "evt-1",
            externalEventId: null,
            eventType: "gamemarket.order.sale_confirmed",
            source: "gamemarket_webhook",
            severity: "success",
            title: "Venda confirmada",
            message: "ok",
            payloadHash: "hash",
            ipAddress: null,
            userAgent: null,
            ackedAt: null,
            createdAt: "2026-04-29T12:00:00.000Z",
            receivedAt: "2026-04-29T12:00:00.000Z",
            hasRawPayload: true
          }
        ]
      });
    }) as unknown as typeof fetch;
    const client = new WebhookServerClient({
      baseUrl: "http://localhost:3001/",
      appSyncToken: "secret-token",
      fetchImpl
    });

    await client.health();
    const events = await client.listEvents({ unreadOnly: true });

    expect(events[0]?.eventType).toBe("gamemarket.order.sale_confirmed");
    expect(fetchImpl).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/events?"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token"
        })
      })
    );
  });

  it("maps auth failures and invalid response shapes", async () => {
    const authClient = new WebhookServerClient({
      baseUrl: "http://localhost:3001",
      appSyncToken: "bad-token",
      fetchImpl: vi.fn(async () => jsonResponse({ ok: false }, { status: 401 })) as unknown as typeof fetch
    });

    await expect(authClient.listEvents()).rejects.toBeInstanceOf(WebhookServerAuthError);

    const invalidClient = new WebhookServerClient({
      baseUrl: "http://localhost:3001",
      appSyncToken: "token",
      fetchImpl: vi.fn(async () => jsonResponse({ ok: true, items: [{}], count: 1 })) as unknown as typeof fetch
    });

    await expect(invalidClient.listEvents()).rejects.toBeInstanceOf(WebhookServerValidationError);
  });
});
