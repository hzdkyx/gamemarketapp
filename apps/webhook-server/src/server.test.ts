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
  user: { id: string; mustChangePassword?: boolean };
  workspaces: Array<{ id: string }>;
}

interface CloudMemberBody {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  role: string;
  status: string;
  mustChangePassword?: boolean;
}

const pushProductPayload = (workspaceId: string, name: string, baseVersion = 0) => ({
  workspaceId,
  entities: [
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

  const bootstrapCloudOwner = async (): Promise<CloudBootstrapBody> => {
    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap-owner",
      payload: ownerPayload,
    });
    expect(bootstrap.statusCode).toBe(200);
    return bootstrap.json() as CloudBootstrapBody;
  };

  const inviteCloudMember = async (
    owner: CloudBootstrapBody,
    workspaceId: string,
    payload: {
      name: string;
      email?: string | null;
      username?: string | null;
      password: string;
      role: "admin" | "manager" | "operator" | "viewer";
    },
  ): Promise<CloudMemberBody> => {
    const response = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/invite-user`,
      headers: cloudAuth(owner.token),
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("passwordHash");
    return response.json().member as CloudMemberBody;
  };

  const loginCloudUser = async (identifier: string, password: string): Promise<CloudBootstrapBody> => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier, password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.body).not.toContain(password);
    expect(login.body).not.toContain("passwordHash");
    return login.json() as CloudBootstrapBody;
  };

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

  it("lets owner and admin manage workspace members but blocks manager and viewer", async () => {
    const owner = await bootstrapCloudOwner();
    const workspaceId = owner.workspaces[0]!.id;
    const admin = await inviteCloudMember(owner, workspaceId, {
      name: "Admin Cloud",
      email: "admin-cloud@example.com",
      username: "admin-cloud",
      password: "senha-cloud-admin-123",
      role: "admin",
    });
    const manager = await inviteCloudMember(owner, workspaceId, {
      name: "Manager Cloud",
      email: "manager-cloud@example.com",
      username: "manager-cloud",
      password: "senha-cloud-manager-123",
      role: "manager",
    });
    const viewer = await inviteCloudMember(owner, workspaceId, {
      name: "Viewer Cloud",
      email: "viewer-cloud@example.com",
      username: "viewer-cloud",
      password: "senha-cloud-viewer-123",
      role: "viewer",
    });

    const adminLogin = await loginCloudUser(admin.email!, "senha-cloud-admin-123");
    const adminUpdate = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/members/${viewer.id}`,
      headers: cloudAuth(adminLogin.token),
      payload: {
        name: "Viewer Operacional",
        email: "viewer-operacional@example.com",
        username: "viewer-operacional",
        role: "operator",
        status: "active",
      },
    });
    expect(adminUpdate.statusCode).toBe(200);
    expect(adminUpdate.json().member).toMatchObject({
      name: "Viewer Operacional",
      email: "viewer-operacional@example.com",
      username: "viewer-operacional",
      role: "operator",
      status: "active",
    });

    const managerLogin = await loginCloudUser(manager.email!, "senha-cloud-manager-123");
    const managerUpdate = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/members/${viewer.id}`,
      headers: cloudAuth(managerLogin.token),
      payload: { role: "viewer" },
    });
    expect(managerUpdate.statusCode).toBe(403);

    const managerReset = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/members/${viewer.id}/reset-password`,
      headers: cloudAuth(managerLogin.token),
      payload: { temporaryPassword: "senha-cloud-temporaria-000", requireChange: true },
    });
    expect(managerReset.statusCode).toBe(403);

    const viewerLogin = await loginCloudUser("viewer-operacional", "senha-cloud-viewer-123");
    const viewerUpdate = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}`,
      headers: cloudAuth(viewerLogin.token),
      payload: { role: "operator" },
    });
    expect(viewerUpdate.statusCode).toBe(403);
  });

  it("validates cloud member edits and blocks duplicate identifiers", async () => {
    const owner = await bootstrapCloudOwner();
    const workspaceId = owner.workspaces[0]!.id;
    const manager = await inviteCloudMember(owner, workspaceId, {
      name: "Manager Duplicado",
      email: "manager-duplicate@example.com",
      username: "manager-duplicate",
      password: "senha-cloud-manager-123",
      role: "manager",
    });
    const operator = await inviteCloudMember(owner, workspaceId, {
      name: "Operator Duplicado",
      email: "operator-duplicate@example.com",
      username: "operator-duplicate",
      password: "senha-cloud-operator-123",
      role: "operator",
    });

    const invalidEmail = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}`,
      headers: cloudAuth(owner.token),
      payload: { email: "email-invalido" },
    });
    expect(invalidEmail.statusCode).toBe(400);

    const duplicateUsername = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}`,
      headers: cloudAuth(owner.token),
      payload: { username: operator.username },
    });
    expect(duplicateUsername.statusCode).toBe(409);

    const invalidRole = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}`,
      headers: cloudAuth(owner.token),
      payload: { role: "financeiro" },
    });
    expect(invalidRole.statusCode).toBe(400);

    const validEdit = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}`,
      headers: cloudAuth(owner.token),
      payload: {
        name: "Manager Editado",
        email: "manager-editado@example.com",
        username: "manager-editado",
        role: "viewer",
        status: "disabled",
      },
    });
    expect(validEdit.statusCode).toBe(200);
    expect(validEdit.body).not.toContain("passwordHash");
    expect(validEdit.body).not.toContain("senha-cloud-manager-123");
    expect(validEdit.json().member).toMatchObject({
      name: "Manager Editado",
      email: "manager-editado@example.com",
      username: "manager-editado",
      role: "viewer",
      status: "disabled",
    });
  });

  it("disables and re-enables cloud member access", async () => {
    const owner = await bootstrapCloudOwner();
    const workspaceId = owner.workspaces[0]!.id;
    const operator = await inviteCloudMember(owner, workspaceId, {
      name: "Operador Status",
      email: "operador-status@example.com",
      username: "operador-status",
      password: "senha-cloud-status-123",
      role: "operator",
    });

    const disable = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/members/${operator.id}/disable`,
      headers: cloudAuth(owner.token),
      payload: {},
    });
    expect(disable.statusCode).toBe(200);
    expect(disable.json().member.status).toBe("disabled");

    const blockedLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: operator.email, password: "senha-cloud-status-123" },
    });
    expect(blockedLogin.statusCode).toBe(401);

    const enable = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/members/${operator.id}/enable`,
      headers: cloudAuth(owner.token),
      payload: {},
    });
    expect(enable.statusCode).toBe(200);
    expect(enable.json().member.status).toBe("active");

    const enabledLogin = await loginCloudUser(operator.email!, "senha-cloud-status-123");
    expect(enabledLogin.workspaces.some((workspace) => workspace.id === workspaceId)).toBe(true);
  });

  it("protects the only owner from demotion, disabling and removal", async () => {
    const owner = await bootstrapCloudOwner();
    const workspaceId = owner.workspaces[0]!.id;

    const demoteOnlyOwner = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/members/${owner.user.id}`,
      headers: cloudAuth(owner.token),
      payload: { role: "admin" },
    });
    expect(demoteOnlyOwner.statusCode).toBe(409);

    const disableOnlyOwner = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/members/${owner.user.id}/disable`,
      headers: cloudAuth(owner.token),
      payload: {},
    });
    expect(disableOnlyOwner.statusCode).toBe(409);

    const removeOnlyOwner = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/members/${owner.user.id}`,
      headers: cloudAuth(owner.token),
      payload: { confirmation: ownerPayload.username },
    });
    expect(removeOnlyOwner.statusCode).toBe(409);

    const manager = await inviteCloudMember(owner, workspaceId, {
      name: "Segundo Owner",
      email: "segundo-owner@example.com",
      username: "segundo-owner",
      password: "senha-cloud-owner-456",
      role: "manager",
    });
    const promoteOwner = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}`,
      headers: cloudAuth(owner.token),
      payload: { role: "owner" },
    });
    expect(promoteOwner.statusCode).toBe(200);
    expect(promoteOwner.json().member.role).toBe("owner");

    const demoteOriginalOwner = await app.inject({
      method: "PATCH",
      url: `/api/workspaces/${workspaceId}/members/${owner.user.id}`,
      headers: cloudAuth(owner.token),
      payload: { role: "admin" },
    });
    expect(demoteOriginalOwner.statusCode).toBe(200);
  });

  it("removes workspace access without deleting sync history or audit", async () => {
    const owner = await bootstrapCloudOwner();
    const workspaceId = owner.workspaces[0]!.id;
    const manager = await inviteCloudMember(owner, workspaceId, {
      name: "Duplicado Remover",
      email: "duplicado-remover@example.com",
      username: "duplicado-remover",
      password: "senha-cloud-remove-123",
      role: "manager",
    });
    const managerLogin = await loginCloudUser(manager.email!, "senha-cloud-remove-123");

    const push = await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: cloudAuth(managerLogin.token),
      payload: pushProductPayload(workspaceId, "Produto preservado"),
    });
    expect(push.statusCode).toBe(200);

    const remove = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}`,
      headers: cloudAuth(owner.token),
      payload: { confirmation: manager.username },
    });
    expect(remove.statusCode).toBe(200);
    expect(remove.body).not.toContain("passwordHash");

    const members = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/members`,
      headers: cloudAuth(owner.token),
    });
    expect(members.statusCode).toBe(200);
    expect((members.json().members as CloudMemberBody[]).some((member) => member.id === manager.id)).toBe(false);

    const refetchedMembers = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/members`,
      headers: cloudAuth(owner.token),
    });
    expect(refetchedMembers.statusCode).toBe(200);
    expect((refetchedMembers.json().members as CloudMemberBody[]).some((member) => member.id === manager.id)).toBe(
      false,
    );

    const removeMissing = await app.inject({
      method: "DELETE",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}`,
      headers: cloudAuth(owner.token),
      payload: { confirmation: manager.username },
    });
    expect(removeMissing.statusCode).toBe(404);
    expect(removeMissing.body).not.toContain("Route DELETE");

    const removedLogin = await loginCloudUser(manager.email!, "senha-cloud-remove-123");
    expect(removedLogin.workspaces.some((workspace) => workspace.id === workspaceId)).toBe(false);

    const blockedSync = await app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${workspaceId}`,
      headers: cloudAuth(removedLogin.token),
    });
    expect(blockedSync.statusCode).toBe(403);

    const ownerPull = await app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${workspaceId}&since=2000-01-01T00:00:00.000Z`,
      headers: cloudAuth(owner.token),
    });
    expect(ownerPull.statusCode).toBe(200);
    expect(ownerPull.body).toContain("Produto preservado");

    const audit = await app.inject({
      method: "GET",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}/audit`,
      headers: cloudAuth(owner.token),
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().auditLogs).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "cloud.member_removed" })]),
    );
  });

  it("resets cloud passwords without returning hashes or temporary passwords", async () => {
    const owner = await bootstrapCloudOwner();
    const workspaceId = owner.workspaces[0]!.id;
    const manager = await inviteCloudMember(owner, workspaceId, {
      name: "Reset Senha",
      email: "reset-senha@example.com",
      username: "reset-senha",
      password: "senha-cloud-antiga-123",
      role: "manager",
    });
    const oldLogin = await loginCloudUser(manager.email!, "senha-cloud-antiga-123");

    const managerReset = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}/reset-password`,
      headers: cloudAuth(oldLogin.token),
      payload: { temporaryPassword: "senha-cloud-temporaria-000", requireChange: true },
    });
    expect(managerReset.statusCode).toBe(403);

    const missingRouteTarget = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/members/cloud-user-inexistente/reset-password`,
      headers: cloudAuth(owner.token),
      payload: { temporaryPassword: "senha-cloud-temporaria-000", requireChange: true },
    });
    expect(missingRouteTarget.statusCode).toBe(404);
    expect(missingRouteTarget.body).not.toContain("Route POST");

    const reset = await app.inject({
      method: "POST",
      url: `/api/workspaces/${workspaceId}/members/${manager.id}/reset-password`,
      headers: cloudAuth(owner.token),
      payload: {
        temporaryPassword: "senha-cloud-temporaria-456",
        requireChange: true,
      },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.body).not.toContain("passwordHash");
    expect(reset.body).not.toContain("senha-cloud-temporaria-456");
    expect(reset.json().member.mustChangePassword).toBe(true);

    const revokedSession = await app.inject({
      method: "GET",
      url: "/api/me",
      headers: cloudAuth(oldLogin.token),
    });
    expect(revokedSession.statusCode).toBe(401);

    const oldPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: manager.email, password: "senha-cloud-antiga-123" },
    });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const temporaryPasswordLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { identifier: manager.email, password: "senha-cloud-temporaria-456" },
    });
    expect(temporaryPasswordLogin.statusCode).toBe(200);
    expect(temporaryPasswordLogin.body).not.toContain("senha-cloud-temporaria-456");
    expect(temporaryPasswordLogin.body).not.toContain("passwordHash");
    expect((temporaryPasswordLogin.json() as CloudBootstrapBody).user.mustChangePassword).toBe(true);
    const temporarySession = temporaryPasswordLogin.json() as CloudBootstrapBody;

    const blockedBeforeChange = await app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${workspaceId}`,
      headers: cloudAuth(temporarySession.token),
    });
    expect(blockedBeforeChange.statusCode).toBe(403);

    const changePassword = await app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: cloudAuth(temporarySession.token),
      payload: {
        currentPassword: "senha-cloud-temporaria-456",
        password: "senha-cloud-definitiva-789",
        confirmPassword: "senha-cloud-definitiva-789",
      },
    });
    expect(changePassword.statusCode).toBe(200);
    expect(changePassword.body).not.toContain("passwordHash");
    expect(changePassword.body).not.toContain("senha-cloud-temporaria-456");
    expect(changePassword.body).not.toContain("senha-cloud-definitiva-789");
    expect(changePassword.json().user.mustChangePassword).toBe(false);

    const allowedAfterChange = await app.inject({
      method: "GET",
      url: `/api/sync/pull?workspaceId=${workspaceId}`,
      headers: cloudAuth(temporarySession.token),
    });
    expect(allowedAfterChange.statusCode).toBe(200);

    expect(await cloud.listMemberAuditLogs(workspaceId, manager.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "cloud.member_password_reset" })]),
    );
    expect(JSON.stringify(await cloud.listMemberAuditLogs(workspaceId, manager.id))).not.toContain(
      "senha-cloud-temporaria-456",
    );
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
    expect(managerPush.json().entities).toHaveLength(2);
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
    expect(push.json().entities).toHaveLength(1);
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

  it("returns lightweight cloud sync status without payload data", async () => {
    const bootstrap = await app.inject({
      method: "POST",
      url: "/api/auth/bootstrap-owner",
      payload: ownerPayload,
    });
    const owner = bootstrap.json() as CloudBootstrapBody;
    const workspaceId = owner.workspaces[0]!.id;

    await app.inject({
      method: "POST",
      url: "/api/sync/push",
      headers: cloudAuth(owner.token),
      payload: pushProductPayload(workspaceId, "Produto com status leve"),
    });

    const status = await app.inject({
      method: "GET",
      url: `/api/sync/status?workspaceId=${workspaceId}&since=2000-01-01T00:00:00.000Z`,
      headers: cloudAuth(owner.token),
    });

    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      ok: true,
      workspaceId,
      workspaceVersion: 1,
      pendingServerChanges: 1,
    });
    expect(status.json().serverTime).toBeTruthy();
    expect(status.body).not.toContain("Produto com status leve");
    expect(status.body).not.toContain("entities");
  });

  it("accepts empty sync pushes and returns entities as an array", async () => {
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
      payload: {
        workspaceId,
        entities: [],
      },
    });

    expect(push.statusCode).toBe(200);
    expect(push.json().entities).toEqual([]);
    expect(push.json().applied).toEqual([]);
    expect(push.json().conflicts).toEqual([]);
  });

  it("rejects invalid sync pushes with a friendly error", async () => {
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
      payload: {
        workspaceId,
      },
    });

    expect(push.statusCode).toBe(400);
    expect(push.json()).toMatchObject({
      ok: false,
      error: "request_error",
    });
    expect(push.json().message).toContain("entities como array");
    expect(push.body).not.toContain("invalid_type");
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
