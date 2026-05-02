import type { FastifyInstance } from "fastify";
import {
  cloudCreateWorkspaceInputSchema,
  cloudInviteUserInputSchema,
  cloudRemoveMemberInputSchema,
  cloudResetMemberPasswordInputSchema,
  cloudUpdateMemberInputSchema,
  cloudWorkspaceMemberParamsSchema,
  cloudWorkspaceMemberUpdateInputSchema,
  cloudWorkspaceParamsSchema,
  type CloudRole,
  type CloudWorkspaceMemberUpdateInput,
  type CloudWorkspaceMemberView,
} from "../contracts/cloud-contracts.js";
import { hashPassword } from "../services/cloud-auth-service.js";
import { canManageRole } from "../services/cloud-permissions.js";
import { requireCloudSession, requireCloudWorkspace, type CloudWorkspaceContext } from "../services/cloud-request-context.js";
import type { CloudStorageService } from "../services/cloud-storage-service.js";

const httpError = (statusCode: number, message: string): Error => Object.assign(new Error(message), { statusCode });

const actorCanManageMember = (actorRole: CloudRole, targetRole: CloudRole, nextRole?: CloudRole): boolean => {
  if (actorRole === "owner") {
    return true;
  }

  if (actorRole === "admin") {
    return (
      !["owner", "admin"].includes(targetRole) &&
      (nextRole === undefined || !["owner", "admin"].includes(nextRole))
    );
  }

  return false;
};

const activeOwnerCount = (members: CloudWorkspaceMemberView[]): number =>
  members.filter((member) => member.role === "owner" && member.status === "active").length;

const totalOwnerCount = (members: CloudWorkspaceMemberView[]): number =>
  members.filter((member) => member.role === "owner").length;

const assertMemberCanBeManaged = (
  context: CloudWorkspaceContext,
  target: CloudWorkspaceMemberView,
  nextRole?: CloudRole,
): void => {
  if (!actorCanManageMember(context.role, target.role, nextRole)) {
    throw httpError(403, "Papel do membro não pode ser gerenciado por este usuário.");
  }
};

const assertOwnerInvariant = (
  target: CloudWorkspaceMemberView,
  members: CloudWorkspaceMemberView[],
  input: CloudWorkspaceMemberUpdateInput,
): void => {
  if (target.role !== "owner") {
    return;
  }

  if (input.role && input.role !== "owner" && totalOwnerCount(members) <= 1) {
    throw httpError(409, "Não é permitido rebaixar o único owner do workspace.");
  }

  if (input.status === "disabled" && target.status === "active" && activeOwnerCount(members) <= 1) {
    throw httpError(409, "Não é permitido desativar o único owner ativo do workspace.");
  }
};

const assertMemberCanBeRemoved = (
  context: CloudWorkspaceContext,
  target: CloudWorkspaceMemberView,
  members: CloudWorkspaceMemberView[],
): void => {
  if (target.id === context.user.id) {
    throw httpError(409, "Não é permitido remover a si mesmo do workspace.");
  }

  assertMemberCanBeManaged(context, target);

  if (target.role !== "owner") {
    return;
  }

  if (totalOwnerCount(members) <= 1 || (target.status === "active" && activeOwnerCount(members) <= 1)) {
    throw httpError(409, "Promova outro owner antes de remover este owner do workspace.");
  }
};

const getChangedFields = (
  current: CloudWorkspaceMemberView,
  input: CloudWorkspaceMemberUpdateInput,
): Array<keyof CloudWorkspaceMemberUpdateInput> => {
  const fields: Array<keyof CloudWorkspaceMemberUpdateInput> = ["name", "email", "username", "role", "status"];
  return fields.filter((field) => input[field] !== undefined && input[field] !== current[field]);
};

const confirmationTarget = (member: CloudWorkspaceMemberView): string => member.username ?? member.email ?? member.name;

const toSafeAuditMetadata = (
  context: CloudWorkspaceContext,
  target: CloudWorkspaceMemberView,
  changedFields: Array<keyof CloudWorkspaceMemberUpdateInput> = [],
): Record<string, unknown> => ({
  workspaceId: context.workspaceId,
  targetCloudUserId: target.id,
  actorCloudUserId: context.user.id,
  changedFields,
  timestamp: new Date().toISOString(),
});

const updateMember = async (
  cloud: CloudStorageService,
  context: CloudWorkspaceContext,
  target: CloudWorkspaceMemberView,
  members: CloudWorkspaceMemberView[],
  input: CloudWorkspaceMemberUpdateInput,
): Promise<CloudWorkspaceMemberView> => {
  assertMemberCanBeManaged(context, target, input.role);
  assertOwnerInvariant(target, members, input);

  const changedFields = getChangedFields(target, input);
  const member = await cloud.updateWorkspaceMember(context.workspaceId, target.id, input);
  if (!member) {
    throw httpError(404, "Membro não encontrado.");
  }

  await cloud.recordAudit({
    workspaceId: context.workspaceId,
    actorUserId: context.user.id,
    action: "cloud.member_updated",
    entityType: "cloud_user",
    entityId: member.id,
    metadata: toSafeAuditMetadata(context, target, changedFields),
  });

  if (changedFields.includes("role")) {
    await cloud.recordAudit({
      workspaceId: context.workspaceId,
      actorUserId: context.user.id,
      action: "cloud.member_role_changed",
      entityType: "cloud_user",
      entityId: member.id,
      metadata: {
        ...toSafeAuditMetadata(context, target, ["role"]),
        previousRole: target.role,
        nextRole: member.role,
      },
    });
  }

  if (changedFields.includes("status") && member.status === "disabled") {
    await cloud.recordAudit({
      workspaceId: context.workspaceId,
      actorUserId: context.user.id,
      action: "cloud.member_disabled",
      entityType: "cloud_user",
      entityId: member.id,
      metadata: toSafeAuditMetadata(context, target, ["status"]),
    });
  }

  if (changedFields.includes("status") && member.status === "active") {
    await cloud.recordAudit({
      workspaceId: context.workspaceId,
      actorUserId: context.user.id,
      action: "cloud.member_enabled",
      entityType: "cloud_user",
      entityId: member.id,
      metadata: toSafeAuditMetadata(context, target, ["status"]),
    });
  }

  return member;
};

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
      action: "cloud.member_created",
      entityType: "cloud_user",
      entityId: member.id,
      metadata: toSafeAuditMetadata(context, member, ["role", "status"]),
    });

    return { ok: true, member };
  });

  app.patch("/api/workspaces/:id/members/:memberId", async (request) => {
    const params = cloudWorkspaceMemberParamsSchema.parse(request.params);
    const context = await requireCloudWorkspace(request, cloud, params.id, "manageUsers");
    const input = cloudWorkspaceMemberUpdateInputSchema.parse(request.body);
    const members = await cloud.listWorkspaceMembers(params.id);
    const target = members.find((member) => member.id === params.memberId);
    if (!target) {
      throw httpError(404, "Membro não encontrado.");
    }

    const member = await updateMember(cloud, context, target, members, input);
    return { ok: true, member };
  });

  app.patch("/api/workspaces/:id/members", async (request) => {
    const params = cloudWorkspaceParamsSchema.parse(request.params);
    const context = await requireCloudWorkspace(request, cloud, params.id, "manageUsers");
    const { userId, ...input } = cloudUpdateMemberInputSchema.parse(request.body);
    const members = await cloud.listWorkspaceMembers(params.id);
    const target = members.find((member) => member.id === userId);
    if (!target) {
      throw httpError(404, "Membro não encontrado.");
    }

    const member = await updateMember(cloud, context, target, members, input);
    return { ok: true, member };
  });

  app.post("/api/workspaces/:id/members/:memberId/disable", async (request) => {
    const params = cloudWorkspaceMemberParamsSchema.parse(request.params);
    const context = await requireCloudWorkspace(request, cloud, params.id, "manageUsers");
    const members = await cloud.listWorkspaceMembers(params.id);
    const target = members.find((member) => member.id === params.memberId);
    if (!target) {
      throw httpError(404, "Membro não encontrado.");
    }

    const member = await updateMember(cloud, context, target, members, { status: "disabled" });
    return { ok: true, member };
  });

  app.post("/api/workspaces/:id/members/:memberId/enable", async (request) => {
    const params = cloudWorkspaceMemberParamsSchema.parse(request.params);
    const context = await requireCloudWorkspace(request, cloud, params.id, "manageUsers");
    const members = await cloud.listWorkspaceMembers(params.id);
    const target = members.find((member) => member.id === params.memberId);
    if (!target) {
      throw httpError(404, "Membro não encontrado.");
    }

    const member = await updateMember(cloud, context, target, members, { status: "active" });
    return { ok: true, member };
  });

  app.delete("/api/workspaces/:id/members/:memberId", async (request) => {
    const params = cloudWorkspaceMemberParamsSchema.parse(request.params);
    const context = await requireCloudWorkspace(request, cloud, params.id, "manageUsers");
    const input = cloudRemoveMemberInputSchema.parse(request.body);
    const members = await cloud.listWorkspaceMembers(params.id);
    const target = members.find((member) => member.id === params.memberId);
    if (!target) {
      throw httpError(404, "Membro não encontrado.");
    }

    assertMemberCanBeRemoved(context, target, members);
    if (input.confirmation !== confirmationTarget(target)) {
      throw httpError(400, "Confirmação inválida para remover membro do workspace.");
    }

    const member = await cloud.removeWorkspaceMember(params.id, params.memberId);
    if (!member) {
      throw httpError(404, "Membro não encontrado.");
    }

    await cloud.recordAudit({
      workspaceId: params.id,
      actorUserId: context.user.id,
      action: "cloud.member_removed",
      entityType: "cloud_user",
      entityId: member.id,
      metadata: toSafeAuditMetadata(context, target, ["status"]),
    });

    return { ok: true, member };
  });

  app.post("/api/workspaces/:id/members/:memberId/reset-password", async (request) => {
    const params = cloudWorkspaceMemberParamsSchema.parse(request.params);
    const context = await requireCloudWorkspace(request, cloud, params.id, "manageUsers");
    const input = cloudResetMemberPasswordInputSchema.parse(request.body);
    const members = await cloud.listWorkspaceMembers(params.id);
    const target = members.find((member) => member.id === params.memberId);
    if (!target) {
      throw httpError(404, "Membro não encontrado.");
    }
    assertMemberCanBeManaged(context, target);

    const member = await cloud.resetWorkspaceMemberPassword(
      params.id,
      params.memberId,
      await hashPassword(input.temporaryPassword),
      { mustChangePassword: input.mustChangePassword },
    );
    if (!member) {
      throw httpError(404, "Membro não encontrado.");
    }

    await cloud.recordAudit({
      workspaceId: params.id,
      actorUserId: context.user.id,
      action: "cloud.member_password_reset",
      entityType: "cloud_user",
      entityId: member.id,
      metadata: toSafeAuditMetadata(context, target, []),
    });

    return { ok: true, member };
  });

  app.get("/api/workspaces/:id/members/:memberId/audit", async (request) => {
    const params = cloudWorkspaceMemberParamsSchema.parse(request.params);
    const context = await requireCloudWorkspace(request, cloud, params.id, "manageUsers");
    const members = await cloud.listWorkspaceMembers(params.id);
    const target = members.find((member) => member.id === params.memberId);
    if (target) {
      assertMemberCanBeManaged(context, target);
    }

    return {
      ok: true,
      auditLogs: await cloud.listMemberAuditLogs(params.id, params.memberId),
    };
  });
};
