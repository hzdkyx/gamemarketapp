import type { FastifyInstance } from "fastify";
import {
  cloudCreateWorkspaceInputSchema,
  cloudInviteUserInputSchema,
  cloudUpdateMemberInputSchema,
  cloudWorkspaceParamsSchema,
} from "../contracts/cloud-contracts.js";
import { hashPassword } from "../services/cloud-auth-service.js";
import { canManageRole } from "../services/cloud-permissions.js";
import { requireCloudSession, requireCloudWorkspace } from "../services/cloud-request-context.js";
import type { CloudStorageService } from "../services/cloud-storage-service.js";

export const registerCloudWorkspaceRoutes = (app: FastifyInstance, cloud: CloudStorageService): void => {
  app.get("/api/workspaces", async (request) => {
    const context = await requireCloudSession(request, cloud);
    return {
      ok: true,
      workspaces: await cloud.listWorkspacesForUser(context.user.id),
    };
  });

  app.post("/api/workspaces", async (request) => {
    const context = await requireCloudSession(request, cloud);
    const input = cloudCreateWorkspaceInputSchema.parse(request.body);
    const workspace = await cloud.createWorkspace(context.user.id, input);
    await cloud.recordAudit({
      workspaceId: workspace.id,
      actorUserId: context.user.id,
      action: "cloud.workspace_created",
      entityType: "workspace",
      entityId: workspace.id,
      metadata: { name: workspace.name },
    });
    return { ok: true, workspace };
  });

  app.get("/api/workspaces/:id/members", async (request) => {
    const params = cloudWorkspaceParamsSchema.parse(request.params);
    await requireCloudWorkspace(request, cloud, params.id, "manageUsers");
    return {
      ok: true,
      members: await cloud.listWorkspaceMembers(params.id),
    };
  });

  app.post("/api/workspaces/:id/invite-user", async (request, reply) => {
    const params = cloudWorkspaceParamsSchema.parse(request.params);
    const context = await requireCloudWorkspace(request, cloud, params.id, "manageUsers");
    const input = cloudInviteUserInputSchema.parse(request.body);
    if (!canManageRole(context.role, input.role)) {
      return reply.code(403).send({ ok: false, error: "role_not_allowed" });
    }

    const member = await cloud.inviteUser(params.id, input, await hashPassword(input.password));
    await cloud.recordAudit({
      workspaceId: params.id,
      actorUserId: context.user.id,
      action: "cloud.user_created",
      entityType: "cloud_user",
      entityId: member.id,
      metadata: { role: member.role, status: member.status },
    });

    return { ok: true, member };
  });

  app.patch("/api/workspaces/:id/members", async (request, reply) => {
    const params = cloudWorkspaceParamsSchema.parse(request.params);
    const context = await requireCloudWorkspace(request, cloud, params.id, "manageUsers");
    const input = cloudUpdateMemberInputSchema.parse(request.body);
    if (!canManageRole(context.role, input.role)) {
      return reply.code(403).send({ ok: false, error: "role_not_allowed" });
    }

    const member = await cloud.updateWorkspaceMember(params.id, input);
    if (!member) {
      return reply.code(404).send({ ok: false, error: "not_found" });
    }

    await cloud.recordAudit({
      workspaceId: params.id,
      actorUserId: context.user.id,
      action: "cloud.user_permissions_updated",
      entityType: "cloud_user",
      entityId: member.id,
      metadata: { role: member.role, status: member.status },
    });

    return { ok: true, member };
  });
};
