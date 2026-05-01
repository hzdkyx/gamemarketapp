import type { FastifyInstance } from "fastify";
import {
  cloudSyncPullQuerySchema,
  cloudSyncPushInputSchema,
  type CloudRole,
  type CloudSyncEntityChange,
  type CloudSyncEntityType,
} from "../contracts/cloud-contracts.js";
import { hasCloudPermission, type CloudPermission } from "../services/cloud-permissions.js";
import { requireCloudSession, requireCloudWorkspace } from "../services/cloud-request-context.js";
import type { CloudStorageService } from "../services/cloud-storage-service.js";
import { sanitizeSyncPayloadObject } from "../services/sync-sanitizer.js";

const entityPermission: Record<CloudSyncEntityType, CloudPermission> = {
  products: "editProducts",
  product_variants: "editVariants",
  inventory_items: "editOperationalStock",
  orders: "markDelivered",
  events: "syncData",
  app_notifications: "syncData",
  settings: "manageWorkspace",
};

const resolveWorkspaceId = async (
  cloud: CloudStorageService,
  userId: string,
  requestedWorkspaceId: string | undefined,
): Promise<string> => {
  if (requestedWorkspaceId) {
    return requestedWorkspaceId;
  }

  const workspaces = await cloud.listWorkspacesForUser(userId);
  const first = workspaces[0];
  if (!first) {
    throw Object.assign(new Error("Workspace required."), { statusCode: 400 });
  }
  return first.id;
};

const authorizePushChanges = (role: CloudRole, changes: CloudSyncEntityChange[]): void => {
  const denied = changes.find((change) => !hasCloudPermission(role, entityPermission[change.entityType]));
  if (denied) {
    throw Object.assign(new Error(`Role cannot push ${denied.entityType}.`), { statusCode: 403 });
  }
};

export const registerCloudSyncRoutes = (app: FastifyInstance, cloud: CloudStorageService): void => {
  app.get("/api/sync/bootstrap", async (request) => {
    const session = await requireCloudSession(request, cloud);
    const query = cloudSyncPullQuerySchema.parse(request.query);
    const workspaceId = await resolveWorkspaceId(cloud, session.user.id, query.workspaceId);
    const context = await requireCloudWorkspace(request, cloud, workspaceId, "read");
    const entities = await cloud.listSyncEntities(workspaceId);
    await cloud.recordAudit({
      workspaceId,
      actorUserId: context.user.id,
      action: "cloud.sync_bootstrap",
      metadata: { entities: entities.length },
    });

    return {
      ok: true,
      workspaceId,
      entities,
      serverTime: new Date().toISOString(),
    };
  });

  app.get("/api/sync/pull", async (request) => {
    const session = await requireCloudSession(request, cloud);
    const query = cloudSyncPullQuerySchema.parse(request.query);
    const workspaceId = await resolveWorkspaceId(cloud, session.user.id, query.workspaceId);
    await requireCloudWorkspace(request, cloud, workspaceId, "read");
    const entities = await cloud.listSyncEntities(workspaceId, query.since);

    return {
      ok: true,
      workspaceId,
      entities,
      serverTime: new Date().toISOString(),
    };
  });

  app.post("/api/sync/push", async (request) => {
    const input = cloudSyncPushInputSchema.parse(request.body);
    const context = await requireCloudWorkspace(request, cloud, input.workspaceId, "syncData");
    authorizePushChanges(context.role, input.entities);
    const safeChanges = input.entities.map((change) => ({
      ...change,
      payload: sanitizeSyncPayloadObject(change.payload),
    }));
    const result = await cloud.upsertSyncChanges(input.workspaceId, context.user.id, safeChanges);
    await cloud.recordAudit({
      workspaceId: input.workspaceId,
      actorUserId: context.user.id,
      action: "cloud.sync_push",
      metadata: {
        changes: safeChanges.length,
        applied: result.applied.length,
        conflicts: result.conflicts.length,
        entityTypes: [...new Set(safeChanges.map((change) => change.entityType))],
      },
    });

    return {
      ok: true,
      workspaceId: input.workspaceId,
      entities: result.applied,
      applied: result.applied,
      conflicts: result.conflicts,
      serverTime: new Date().toISOString(),
    };
  });
};
