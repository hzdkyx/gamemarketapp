import type { FastifyRequest } from "fastify";
import type { CloudRole } from "../contracts/cloud-contracts.js";
import { hashSessionToken } from "./cloud-auth-service.js";
import { hasCloudPermission, type CloudPermission } from "./cloud-permissions.js";
import type { CloudStorageService, CloudUserRecord } from "./cloud-storage-service.js";

export interface CloudRequestContext {
  tokenHash: string;
  user: CloudUserRecord;
}

export interface CloudWorkspaceContext extends CloudRequestContext {
  workspaceId: string;
  role: CloudRole;
}

const httpError = (statusCode: number, message: string): Error =>
  Object.assign(new Error(message), { statusCode });

export const getBearerToken = (request: FastifyRequest): string => {
  const authorization = request.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!value?.startsWith("Bearer ")) {
    throw httpError(401, "Authorization bearer token required.");
  }

  const token = value.slice("Bearer ".length).trim();
  if (!token) {
    throw httpError(401, "Authorization bearer token required.");
  }
  return token;
};

export const requireCloudSession = async (
  request: FastifyRequest,
  cloud: CloudStorageService,
): Promise<CloudRequestContext> => {
  const token = getBearerToken(request);
  const tokenHash = hashSessionToken(token);
  const user = await cloud.getSessionUser(tokenHash);
  if (!user) {
    throw httpError(401, "Invalid cloud session.");
  }

  return { tokenHash, user };
};

export const requireCloudWorkspace = async (
  request: FastifyRequest,
  cloud: CloudStorageService,
  workspaceId: string,
  permission: CloudPermission,
): Promise<CloudWorkspaceContext> => {
  const context = await requireCloudSession(request, cloud);
  const membership = await cloud.getWorkspaceMember(workspaceId, context.user.id);
  if (!membership || membership.status !== "active") {
    throw httpError(403, "Workspace access denied.");
  }

  if (context.user.mustChangePassword) {
    throw httpError(403, "Troca de senha cloud obrigatória.");
  }

  if (!hasCloudPermission(membership.role, permission)) {
    throw httpError(403, "Workspace permission denied.");
  }

  return {
    ...context,
    workspaceId,
    role: membership.role,
  };
};
