import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig } from "./config.js";
import { buildServer } from "./server.js";
import { InMemoryCloudStorage } from "./services/cloud-storage-service.js";
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
  rateLimitMax: 100,
  rateLimitWindow: "1 minute",
  ...overrides,
});

const auth = { authorization: "Bearer test_app_sync_token_1234567890" };
const cloudAuth = (token: string): { authorization: string } => ({ authorization: `Bearer ${token}` });

const ownerPayload = {
  name: "Pedro Spoto",
  email: "pedro@example.com",
  username: "pedro",
  password: "senha-cloud-segura-123",
  workspaceName: "HzdKyx GameMarket",
};

interface CloudBootstrapBody {
  token: string;
  user: { id: string };
  workspaces: Array<{ id: string }>;
}

const pushProductPayload = (workspaceId: string, name: string, baseVersion = 0) => ({
  workspaceId,
  changes: [
    {
      entityType: "products",
      localId: "local-product-1",
      baseVersion,
      updatedAt: new Date().toISOString(),
      payload: {
        id: "local-product-1",
        name,
        salePrice: 100,
        accountPassword: "do-not-sync",
        apiKey: "do-not-sync",
        nested: {
          token: "do-not-sync",
          safe: "kept",
        },
      },
    },
  ],
});

describe("webhook server", () => {
  let storage: LocalFileEventStorage;
  let cloud: InMemoryCloudStorage;
  let app: ReturnType<typeof buildServer>;

  beforeEach(async () => {
    const config = makeConfig();
    storage = new LocalFileEventStorage(":memory:");
    cloud = new InMemoryCloudStorage();
    await storage.initialize();
    await cloud.initialize();
    app = buildServer({ config, storage, cloud });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await storage.close();
    await cloud.close();
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
    await app.close();
    await storage.close();
    await cloud.close();

    const config = makeConfig({ rateLimitMax: 3 });
    storage = new LocalFileEventStorage(":memory:");
    cloud = new InMemoryCloudStorage();
    await storage.initialize();
    await cloud.initialize();
    app = buildServer({ config, storage, cloud });
    await app.ready();

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

  it("creates a cloud owner workspace and logs in without exposing password hashes", async () => {
    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap-owner",
      payload: ownerPayload,
    });
    expect(bootstrap.statusCode).toBe(200);
    const created = bootstrap.json() as CloudBootstrapBody;
    expect(created.token).toBeTruthy();
    expect(created.workspaces[0]?.id).toBeTruthy();
    expect(bootstrap.body).not.toContain("passwordHash");

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: ownerPayload.email, password: ownerPayload.password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.body).not.toContain(ownerPayload.password);

    const me = await app.inject({ method: "GET", url: "/api/me", headers: cloudAuth(created.token) });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ user: { name: ownerPayload.name } });
  });

  it("allows managers to push product and variant sync data but blocks viewers", async () => {
    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap-owner",
      payload: ownerPayload,
    });
    const owner = bootstrap.json() as CloudBootstrapBody;
    const workspaceId = owner.workspaces[0]!.id;

    const managerInvite = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/invite-user`,
      headers: cloudAuth(owner.token),
      payload: {
        name: "Operadora",
        email: "operadora@example.com",
        password: "senha-cloud-segura-456",
        role: "manager",
      },
    });
    expect(managerInvite.statusCode).toBe(200);

    const managerLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "operadora@example.com", password: "senha-cloud-segura-456" },
    });
    const managerToken = (managerLogin.json() as CloudBootstrapBody).token;

    const managerPush = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: cloudAuth(managerToken),
      payload: {
        workspaceId,
        changes: [
          {
            entityType: "products",
            localId: "product-manager",
            baseVersion: 0,
            updatedAt: new Date().toISOString(),
            payload: { id: "product-manager", name: "Produto", cost: 10, price: 20 },
          },
          {
            entityType: "product_variants",
            localId: "variant-manager",
            baseVersion: 0,
            updatedAt: new Date().toISOString(),
            payload: { id: "variant-manager", productId: "product-manager", title: "Steam" },
          },
        ],
      },
    });
    expect(managerPush.statusCode).toBe(200);
    expect(managerPush.json().applied).toHaveLength(2);

    const viewerInvite = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/invite-user`,
      headers: cloudAuth(owner.token),
      payload: {
        name: "Leitura",
        email: "viewer@example.com",
        password: "senha-cloud-segura-789",
        role: "viewer",
      },
    });
    expect(viewerInvite.statusCode).toBe(200);

    const viewerLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: "viewer@example.com", password: "senha-cloud-segura-789" },
    });
    const viewerToken = (viewerLogin.json() as CloudBootstrapBody).token;
    const viewerPush = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: cloudAuth(viewerToken),
      payload: pushProductPayload(workspaceId, "Produto negado"),
    });
    expect(viewerPush.statusCode).toBe(403);

    const viewerNotificationPush = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: cloudAuth(viewerToken),
      payload: {
        workspaceId,
        changes: [
          {
            entityType: "app_notifications",
            localId: "notification-viewer",
            baseVersion: 0,
            updatedAt: new Date().toISOString(),
            payload: { id: "notification-viewer", title: "Tentativa viewer" },
          },
        ],
      },
    });
    expect(viewerNotificationPush.statusCode).toBe(403);
  });

  it("bootstraps, pushes and pulls sanitized sync payloads", async () => {
    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap-owner",
      payload: ownerPayload,
    });
    const owner = bootstrap.json() as CloudBootstrapBody;
    const workspaceId = owner.workspaces[0]!.id;

    const push = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: cloudAuth(owner.token),
      payload: pushProductPayload(workspaceId, "Produto sincronizado"),
    });
    expect(push.statusCode).toBe(200);
    expect(push.body).not.toContain("do-not-sync");
    expect(push.json().applied[0].payload).toMatchObject({
      name: "Produto sincronizado",
      nested: { safe: "kept" },
    });
    expect(push.json().applied[0].payload.accountPassword).toBeUndefined();
    expect(push.json().applied[0].payload.nested.token).toBeUndefined();

    const bootstrapSync = await app.inject({
      method: "GET",
      url: `/api/sync/bootstrap?workspaceId=${workspaceId}`,
      headers: cloudAuth(owner.token),
    });
    expect(bootstrapSync.statusCode).toBe(200);
    expect(bootstrapSync.json().entities).toHaveLength(1);

    const pull = await app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${workspaceId}&since=2000-01-01T00:00:00.000Z`,
      headers: cloudAuth(owner.token),
    });
    expect(pull.statusCode).toBe(200);
    expect(pull.json().entities[0].payload).toMatchObject({ name: "Produto sincronizado" });
  });

  it("records simple conflicts while preserving last-write-wins behavior", async () => {
    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap-owner",
      payload: ownerPayload,
    });
    const owner = bootstrap.json() as CloudBootstrapBody;
    const workspaceId = owner.workspaces[0]!.id;

    const firstPush = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: cloudAuth(owner.token),
      payload: pushProductPayload(workspaceId, "Primeira versão"),
    });
    expect(firstPush.statusCode).toBe(200);
    expect(firstPush.json().conflicts).toHaveLength(0);

    const conflictingPush = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: cloudAuth(owner.token),
      payload: pushProductPayload(workspaceId, "Segunda versão", 0),
    });
    expect(conflictingPush.statusCode).toBe(200);
    expect(conflictingPush.json().conflicts).toHaveLength(1);
    expect(conflictingPush.json().applied[0]).toMatchObject({
      version: 2,
      payload: { name: "Segunda versão" },
    });
  });
});
