import { z } from "zod";
import {
  cloudRoleSchema,
  cloudSyncEntityTypeSchema,
  userStatusSchema
} from "../../../shared/contracts";
import type {
  CloudAuditLogView,
  CloudSyncBootstrapOwnerInput,
  CloudSyncChangePasswordInput,
  CloudSyncEntityType,
  CloudSyncEntityView,
  CloudSyncInviteUserInput,
  CloudSyncLoginInput,
  CloudSyncMemberActionInput,
  CloudSyncRemoveMemberInput,
  CloudSyncResetMemberPasswordInput,
  CloudSyncUpdateMemberInput,
  CloudUserView,
  CloudWorkspaceMemberView,
  CloudWorkspaceView
} from "../../../shared/contracts";

export interface CloudSyncClientOptions {
  baseUrl: string;
  sessionToken?: string | null;
  fetchImpl?: typeof fetch;
}

export interface CloudSyncChange {
  entityType: CloudSyncEntityType;
  localId: string;
  cloudId?: string | null;
  baseVersion: number;
  updatedAt: string;
  deletedAt?: string | null;
  payload: Record<string, unknown>;
}

export interface CloudAuthResponse {
  token: string;
  user: CloudUserView;
  workspaces: CloudWorkspaceView[];
}

export interface CloudSyncPullResponse {
  workspaceId: string;
  entities: CloudSyncEntityView[];
  serverTime: string;
}

export interface CloudSyncStatusResponse {
  workspaceId: string;
  workspaceVersion: number;
  lastUpdatedAt: string | null;
  pendingServerChanges: number;
  serverTime: string;
}

export interface CloudSyncPushResponse extends CloudSyncPullResponse {
  applied: CloudSyncEntityView[];
  conflicts: Array<{
    id: string;
    workspaceId: string;
    entityType: string;
    localId: string;
    cloudId: string;
    remoteVersion: number;
    incomingBaseVersion: number;
    createdAt: string;
  }>;
}

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  role: cloudRoleSchema,
  status: userStatusSchema,
  mustChangePassword: z.boolean().default(false),
  lastLoginAt: z.string().nullable().default(null),
  lastActivityAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string()
});

const workspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: cloudRoleSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

const memberSchema = userSchema.extend({
  membershipId: z.string(),
  workspaceId: z.string()
});

const auditLogSchema = z.object({
  id: z.string(),
  workspaceId: z.string().nullable(),
  actorUserId: z.string().nullable(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string()
});

const syncEntitySchema = z.object({
  cloudId: z.string(),
  workspaceId: z.string(),
  entityType: cloudSyncEntityTypeSchema,
  localId: z.string(),
  payload: z.record(z.string(), z.unknown()),
  version: z.number(),
  updatedByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable()
});

const authResponseSchema = z.object({
  ok: z.literal(true),
  token: z.string(),
  user: userSchema,
  workspaces: z.array(workspaceSchema)
});

const meResponseSchema = z.object({
  ok: z.literal(true),
  user: userSchema,
  workspaces: z.array(workspaceSchema)
});

const membersResponseSchema = z.object({
  ok: z.literal(true),
  members: z.array(memberSchema)
});

const memberResponseSchema = z.object({
  ok: z.literal(true),
  member: memberSchema
});

const auditLogsResponseSchema = z.object({
  ok: z.literal(true),
  auditLogs: z.array(auditLogSchema)
});

const pullResponseSchema = z.object({
  ok: z.literal(true),
  workspaceId: z.string(),
  entities: z.array(syncEntitySchema),
  serverTime: z.string()
});

const statusResponseSchema = z.object({
  ok: z.literal(true),
  workspaceId: z.string(),
  workspaceVersion: z.number().int().nonnegative(),
  lastUpdatedAt: z.string().nullable(),
  pendingServerChanges: z.number().int().nonnegative(),
  serverTime: z.string()
});

const pushResponseSchema = pullResponseSchema.extend({
  applied: z.array(syncEntitySchema),
  conflicts: z.array(
    z.object({
      id: z.string(),
      workspaceId: z.string(),
      entityType: cloudSyncEntityTypeSchema,
      localId: z.string(),
      cloudId: z.string(),
      remoteVersion: z.number(),
      incomingBaseVersion: z.number(),
      createdAt: z.string()
    })
  )
});

const normalizedPushResponseSchema = z.preprocess((value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const response = value as Record<string, unknown>;
    if (!Array.isArray(response.entities) && Array.isArray(response.applied)) {
      return {
        ...response,
        entities: response.applied
      };
    }
  }

  return value;
}, pushResponseSchema);

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const toSafeJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const isRouteNotFound = (message: string): boolean => /route\s+\w+:.*not found/i.test(message);

export class CloudSyncClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: CloudSyncClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(path: string, init: RequestInit = {}, tokenOverride?: string | null): Promise<unknown> {
    const token = tokenOverride ?? this.options.sessionToken;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string> | undefined) ?? {})
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Falha de rede no cloud sync.");
    }

    const json = await toSafeJson(response);
    if (!response.ok) {
      const message =
        json && typeof json === "object" && "message" in json && typeof json.message === "string"
          ? json.message
          : `Cloud sync HTTP ${response.status}`;
      if (response.status === 404 && path.includes("/reset-password") && isRouteNotFound(message)) {
        throw new Error(
          "Não foi possível resetar a senha cloud. O backend pode estar desatualizado ou a rota não está disponível. Atualize o backend e tente novamente."
        );
      }
      throw new Error(`Cloud sync HTTP ${response.status}: ${message}`);
    }
    return json;
  }

  async health(): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/health`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error(`Cloud sync HTTP ${response.status}`);
    }
  }

  async bootstrapOwner(input: CloudSyncBootstrapOwnerInput): Promise<CloudAuthResponse> {
    const parsed = authResponseSchema.parse(
      await this.request("/api/auth/bootstrap-owner", {
        method: "POST",
        body: JSON.stringify(input)
      })
    );
    return parsed as CloudAuthResponse;
  }

  async login(input: CloudSyncLoginInput): Promise<CloudAuthResponse> {
    const parsed = authResponseSchema.parse(
      await this.request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(input)
      })
    );
    return parsed as CloudAuthResponse;
  }

  async logout(): Promise<void> {
    await this.request("/api/auth/logout", { method: "POST", body: "{}" });
  }

  async me(): Promise<Omit<CloudAuthResponse, "token">> {
    const parsed = meResponseSchema.parse(await this.request("/api/me", { method: "GET" }));
    return parsed;
  }

  async changePassword(input: CloudSyncChangePasswordInput): Promise<Omit<CloudAuthResponse, "token">> {
    const parsed = meResponseSchema.parse(
      await this.request("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify(input)
      })
    );
    return parsed;
  }

  async listMembers(workspaceId: string): Promise<CloudWorkspaceMemberView[]> {
    const parsed = membersResponseSchema.parse(
      await this.request(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`, { method: "GET" })
    );
    return parsed.members as CloudWorkspaceMemberView[];
  }

  async inviteUser(workspaceId: string, input: CloudSyncInviteUserInput): Promise<CloudWorkspaceMemberView> {
    const parsed = memberResponseSchema.parse(
      await this.request(`/api/workspaces/${encodeURIComponent(workspaceId)}/invite-user`, {
        method: "POST",
        body: JSON.stringify(input)
      })
    );
    return parsed.member as CloudWorkspaceMemberView;
  }

  async updateMember(workspaceId: string, input: CloudSyncUpdateMemberInput): Promise<CloudWorkspaceMemberView> {
    const { userId, ...payload } = input;
    const parsed = memberResponseSchema.parse(
      await this.request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      )
    );
    return parsed.member as CloudWorkspaceMemberView;
  }

  async disableMember(workspaceId: string, input: CloudSyncMemberActionInput): Promise<CloudWorkspaceMemberView> {
    const parsed = memberResponseSchema.parse(
      await this.request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(input.userId)}/disable`,
        {
          method: "POST",
          body: "{}"
        }
      )
    );
    return parsed.member as CloudWorkspaceMemberView;
  }

  async enableMember(workspaceId: string, input: CloudSyncMemberActionInput): Promise<CloudWorkspaceMemberView> {
    const parsed = memberResponseSchema.parse(
      await this.request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(input.userId)}/enable`,
        {
          method: "POST",
          body: "{}"
        }
      )
    );
    return parsed.member as CloudWorkspaceMemberView;
  }

  async removeMember(workspaceId: string, input: CloudSyncRemoveMemberInput): Promise<CloudWorkspaceMemberView> {
    const parsed = memberResponseSchema.parse(
      await this.request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(input.userId)}`,
        {
          method: "DELETE",
          body: JSON.stringify({ confirmation: input.confirmation })
        }
      )
    );
    return parsed.member as CloudWorkspaceMemberView;
  }

  async resetMemberPassword(
    workspaceId: string,
    input: CloudSyncResetMemberPasswordInput
  ): Promise<CloudWorkspaceMemberView> {
    const parsed = memberResponseSchema.parse(
      await this.request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(input.userId)}/reset-password`,
        {
          method: "POST",
          body: JSON.stringify({
            temporaryPassword: input.temporaryPassword,
            requireChange: input.mustChangePassword
          })
        }
      )
    );
    return parsed.member as CloudWorkspaceMemberView;
  }

  async listMemberAudit(workspaceId: string, userId: string): Promise<CloudAuditLogView[]> {
    const parsed = auditLogsResponseSchema.parse(
      await this.request(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}/audit`,
        { method: "GET" }
      )
    );
    return parsed.auditLogs as CloudAuditLogView[];
  }

  async bootstrap(workspaceId: string): Promise<CloudSyncPullResponse> {
    const params = new URLSearchParams({ workspaceId });
    return pullResponseSchema.parse(
      await this.request(`/api/sync/bootstrap?${params.toString()}`, { method: "GET" })
    ) as CloudSyncPullResponse;
  }

  async pull(workspaceId: string, since?: string | null): Promise<CloudSyncPullResponse> {
    const params = new URLSearchParams({ workspaceId });
    if (since) {
      params.set("since", since);
    }
    return pullResponseSchema.parse(
      await this.request(`/api/sync/pull?${params.toString()}`, { method: "GET" })
    ) as CloudSyncPullResponse;
  }

  async status(workspaceId: string, since?: string | null): Promise<CloudSyncStatusResponse> {
    const params = new URLSearchParams({ workspaceId });
    if (since) {
      params.set("since", since);
    }
    return statusResponseSchema.parse(
      await this.request(`/api/sync/status?${params.toString()}`, { method: "GET" })
    ) as CloudSyncStatusResponse;
  }

  async push(workspaceId: string, changes: CloudSyncChange[]): Promise<CloudSyncPushResponse> {
    const entities = Array.isArray(changes) ? changes : [];
    return normalizedPushResponseSchema.parse(
      await this.request("/api/sync/push", {
        method: "POST",
        body: JSON.stringify({ workspaceId, entities })
      })
    ) as CloudSyncPushResponse;
  }
}
