import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import { buildServer } from "./server.js";
import { LocalFileEventStorage } from "./services/event-storage-service.js";

const makeConfig = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  port: 0,
  environment: "test",
  databaseUrl: null,
  localStoragePath: ":memory:",
  webhookIngestSecret: "test_webhook_secret_1234567890",
  appSyncToken: "test_app_sync_token_1234567890",
  allowedOrigins: ["http://localhost:5173"],
  logLevel: "silent",
  bodyLimitBytes: 256 * 1024,
  rateLimitMax: 3,
  rateLimitWindow: "1 minute",
  ...overrides,
});

const auth = { authorization: "Bearer test_app_sync_token_1234567890" };

describe("webhook server", () => {
  let storage: LocalFileEventStorage;
  let app: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    const config = makeConfig();
    storage = new LocalFileEventStorage(":memory:");
    await storage.initialize();
    app = buildServer({ config, storage });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await storage.close();
  });

  it("returns health status", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, environment: "test" });
  });

  it("rejects invalid webhook secrets", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/gamemarket/wrong-secret",
      payload: { event: "Venda Confirmada" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("accepts valid webhook secrets and stores unknown payloads", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/gamemarket/test_webhook_secret_1234567890",
      payload: { anything: true, token: "secret-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, eventType: "gamemarket.unknown" });

    const events = await storage.listEvents({ limit: 10, unreadOnly: false });
    expect(events).toHaveLength(1);
    expect(events[0]?.payloadHash).toHaveLength(64);
  });

  it("normalizes detectable webhook events", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/gamemarket/test_webhook_secret_1234567890",
      payload: { event: "Venda Confirmada", event_id: "gm-event-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ eventType: "gamemarket.order.sale_confirmed" });
  });

  it("requires authorization to list events and returns events with a valid token", async () => {
    const unauthorized = await app.inject({ method: "GET", url: "/api/events" });
    expect(unauthorized.statusCode).toBe(401);

    await app.inject({
      method: "POST",
      url: "/webhooks/gamemarket/test_webhook_secret_1234567890",
      payload: { event: "Sem Estoque" },
    });

    const authorized = await app.inject({ method: "GET", url: "/api/events", headers: auth });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json().items[0]).toMatchObject({ eventType: "gamemarket.product.out_of_stock" });
    expect(authorized.body).not.toContain("rawPayloadMasked");
  });

  it("requires authorization for ack and test events", async () => {
    const testUnauthorized = await app.inject({ method: "POST", url: "/api/test-events", payload: {} });
    expect(testUnauthorized.statusCode).toBe(401);

    const created = await app.inject({
      method: "POST",
      url: "/api/test-events",
      headers: auth,
      payload: { eventType: "gamemarket.review.received" },
    });
    const id = created.json().event.id as string;

    const ackUnauthorized = await app.inject({ method: "PATCH", url: `/api/events/${id}/ack` });
    expect(ackUnauthorized.statusCode).toBe(401);

    const acked = await app.inject({ method: "PATCH", url: `/api/events/${id}/ack`, headers: auth });
    expect(acked.statusCode).toBe(200);
    expect(acked.json().event.ackedAt).toBeTruthy();
  });

  it("applies basic rate limiting on the public webhook endpoint", async () => {
    for (let count = 0; count < 3; count += 1) {
      await app.inject({
        method: "POST",
        url: "/webhooks/gamemarket/test_webhook_secret_1234567890",
        payload: { event: "Pedido Criado", count },
      });
    }

    const limited = await app.inject({
      method: "POST",
      url: "/webhooks/gamemarket/test_webhook_secret_1234567890",
      payload: { event: "Pedido Criado" },
    });

    expect(limited.statusCode).toBe(429);
  });
});
