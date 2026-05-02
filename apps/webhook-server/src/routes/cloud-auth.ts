import type { FastifyInstance } from "fastify";
import {
  cloudBootstrapOwnerInputSchema,
  cloudChangePasswordInputSchema,
  cloudLoginInputSchema,
  type CloudSessionView,
  type CloudUserView,
} from "../contracts/cloud-contracts.js";
import { createSessionToken, hashPassword, hashSessionToken, verifyPassword } from "../services/cloud-auth-service.js";
import { requireCloudSession } from "../services/cloud-request-context.js";
import type { CloudStorageService, CloudUserRecord } from "../services/cloud-storage-service.js";

const toCloudUserView = (user: CloudUserRecord): CloudUserView => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username,
  role: user.role,
  status: user.status,
  mustChangePassword: user.mustChangePassword,
  lastLoginAt: user.lastLoginAt,
  lastActivityAt: user.lastActivityAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export const registerCloudAuthRoutes = (app: FastifyInstance, cloud: CloudStorageService): void => {
  app.post("/api/auth/bootstrap-owner", async (request, reply) => {
    const users = await cloud.getUserCount();
    if (users > 0) {
      return reply.code(409).send({ ok: false, error: "cloud_already_initialized" });
    }

    const input = cloudBootstrapOwnerInputSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const session = await cloud.createOwnerWorkspace(input, passwordHash);
    const token = createSessionToken();
    await cloud.createSession(session.user.id, hashSessionToken(token));
    await cloud.recordAudit({
      workspaceId: session.workspaces[0]?.id ?? null,
      actorUserId: session.user.id,
      action: "cloud.owner_bootstrapped",
      metadata: { workspaceName: input.workspaceName },
    });

    return {
      ok: true,
      token,
      ...session,
    };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const input = cloudLoginInputSchema.parse(request.body);
    const user = await cloud.findUserByIdentifier(input.identifier);
    if (!user || user.status !== "active") {
      return reply.code(401).send({ ok: false, error: "invalid_credentials" });
    }

    const valid = await verifyPassword(input.password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ ok: false, error: "invalid_credentials" });
    }

    const token = createSessionToken();
    await cloud.createSession(user.id, hashSessionToken(token));
    const response: CloudSessionView = {
      user: toCloudUserView(user),
      workspaces: await cloud.listWorkspacesForUser(user.id),
    };

    await cloud.recordAudit({
      workspaceId: response.workspaces[0]?.id ?? null,
      actorUserId: user.id,
      action: "cloud.user_logged_in",
      metadata: {},
    });

    return {
      ok: true,
      token,
      ...response,
    };
  });

  app.post("/api/auth/change-password", async (request, reply) => {
    const context = await requireCloudSession(request, cloud);
    const input = cloudChangePasswordInputSchema.parse(request.body);
    const valid = await verifyPassword(input.currentPassword, context.user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ ok: false, error: "invalid_credentials" });
    }

    const user = await cloud.changeUserPassword(
      context.user.id,
      await hashPassword(input.password),
      false,
      context.tokenHash,
    );
    if (!user) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }

    const workspaces = await cloud.listWorkspacesForUser(user.id);
    await cloud.recordAudit({
      workspaceId: workspaces[0]?.id ?? null,
      actorUserId: user.id,
      action: "cloud.user_password_changed",
      entityType: "cloud_user",
      entityId: user.id,
      metadata: { targetCloudUserId: user.id },
    });

    return {
      ok: true,
      user: toCloudUserView(user),
      workspaces,
    };
  });

  app.post("/api/auth/logout", async (request) => {
    const context = await requireCloudSession(request, cloud);
    await cloud.revokeSession(context.tokenHash);
    await cloud.recordAudit({
      workspaceId: null,
      actorUserId: context.user.id,
      action: "cloud.user_logged_out",
      metadata: {},
    });
    return { ok: true };
  });

  app.get("/api/me", async (request) => {
    const context = await requireCloudSession(request, cloud);
    return {
      ok: true,
      user: toCloudUserView(context.user),
      workspaces: await cloud.listWorkspacesForUser(context.user.id),
    };
  });
};
