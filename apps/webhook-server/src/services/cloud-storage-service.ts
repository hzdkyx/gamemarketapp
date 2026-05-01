import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import type {
  CloudBootstrapOwnerInput,
  CloudCreateWorkspaceInput,
  CloudInviteUserInput,
  CloudRole,
  CloudSessionView,
  CloudSyncConflictView,
  CloudSyncEntityChange,
  CloudSyncEntityType,
  CloudSyncEntityView,
  CloudSyncWorkspaceStatus,
  CloudUpdateMemberInput,
  CloudUserStatus,
  CloudUserView,
  CloudWorkspaceMemberView,
  CloudWorkspaceView,
} from "../contracts/cloud-contracts.js";
import { runPostgresMigrations } from "../db/migrations.js";
import { normalizeIdentifier } from "./cloud-auth-service.js";

const { Pool } = pg;

const sessionDurationMs = 30 * 24 * 60 * 60 * 1000;

export interface CloudUserRecord extends CloudUserView {
  passwordHash: string;
}

export interface CloudMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: CloudRole;
  status: CloudUserStatus;
}

export interface CloudSyncPushResult {
  applied: CloudSyncEntityView[];
  conflicts: CloudSyncConflictView[];
}

export interface CloudStorageService {
  initialize(): Promise<void>;
  close(): Promise<void>;
  getUserCount(): Promise<number>;
  findUserByIdentifier(identifier: string): Promise<CloudUserRecord | null>;
  getUserById(id: string): Promise<CloudUserRecord | null>;
  createOwnerWorkspace(input: CloudBootstrapOwnerInput, passwordHash: string): Promise<CloudSessionView>;
  createWorkspace(ownerUserId: string, input: CloudCreateWorkspaceInput): Promise<CloudWorkspaceView>;
  createSession(userId: string, tokenHash: string): Promise<void>;
  getSessionUser(tokenHash: string): Promise<CloudUserRecord | null>;
  revokeSession(tokenHash: string): Promise<void>;
  listWorkspacesForUser(userId: string): Promise<CloudWorkspaceView[]>;
  getWorkspaceMember(workspaceId: string, userId: string): Promise<CloudMembership | null>;
  listWorkspaceMembers(workspaceId: string): Promise<CloudWorkspaceMemberView[]>;
  inviteUser(workspaceId: string, input: CloudInviteUserInput, passwordHash: string): Promise<CloudWorkspaceMemberView>;
  updateWorkspaceMember(workspaceId: string, input: CloudUpdateMemberInput): Promise<CloudWorkspaceMemberView | null>;
  listSyncEntities(workspaceId: string, since?: string): Promise<CloudSyncEntityView[]>;
  getSyncStatus(workspaceId: string, since?: string): Promise<CloudSyncWorkspaceStatus>;
  upsertSyncChanges(
    workspaceId: string,
    userId: string,
    changes: CloudSyncEntityChange[],
  ): Promise<CloudSyncPushResult>;
  recordAudit(input: {
    workspaceId: string | null;
    actorUserId: string | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

interface UserRow {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  password_hash: string;
  role: CloudRole;
  status: CloudUserStatus;
  created_at: string;
  updated_at: string;
}

interface WorkspaceRow {
  id: string;
  name: string;
  role: CloudRole;
  created_at: string;
  updated_at: string;
}

interface MemberRow extends UserRow {
  membership_id: string;
  workspace_id: string;
  membership_role: CloudRole;
  membership_status: CloudUserStatus;
}

interface SyncEntityRow {
  cloud_id: string;
  workspace_id: string;
  entity_type: CloudSyncEntityType;
  local_id: string;
  payload: unknown;
  version: number;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ConflictRow {
  id: string;
  workspace_id: string;
  entity_type: CloudSyncEntityType;
  local_id: string;
  cloud_id: string;
  remote_version: number;
  incoming_base_version: number;
  created_at: string;
}

const toIso = (value: string | Date): string => new Date(value).toISOString();

const hashPayload = (payload: unknown): string =>
  createHash("sha256").update(JSON.stringify(payload)).digest("hex");

const parsePayload = (value: unknown): Record<string, unknown> => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
};

const mapUser = (row: UserRow): CloudUserRecord => ({
  id: row.id,
  name: row.name,
  email: row.email,
  username: row.username,
  passwordHash: row.password_hash,
  role: row.role,
  status: row.status,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

const toUserView = (user: CloudUserRecord, role = user.role): CloudUserView => ({
  id: user.id,
  name: user.name,
  email: user.email,
  username: user.username,
  role,
  status: user.status,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const mapWorkspace = (row: WorkspaceRow): CloudWorkspaceView => ({
  id: row.id,
  name: row.name,
  role: row.role,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
});

const mapMember = (row: MemberRow): CloudWorkspaceMemberView => ({
  ...toUserView(mapUser(row), row.membership_role),
  status: row.membership_status,
  membershipId: row.membership_id,
  workspaceId: row.workspace_id,
});

const mapSyncEntity = (row: SyncEntityRow): CloudSyncEntityView => ({
  cloudId: row.cloud_id,
  workspaceId: row.workspace_id,
  entityType: row.entity_type,
  localId: row.local_id,
  payload: parsePayload(row.payload),
  version: Number(row.version),
  updatedByUserId: row.updated_by_user_id,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
  deletedAt: row.deleted_at ? toIso(row.deleted_at) : null,
});

const mapConflict = (row: ConflictRow): CloudSyncConflictView => ({
  id: row.id,
  workspaceId: row.workspace_id,
  entityType: row.entity_type,
  localId: row.local_id,
  cloudId: row.cloud_id,
  remoteVersion: Number(row.remote_version),
  incomingBaseVersion: Number(row.incoming_base_version),
  createdAt: toIso(row.created_at),
});

export class PostgresCloudStorage implements CloudStorageService {
  private readonly pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
    });
  }

  async initialize(): Promise<void> {
    await runPostgresMigrations(this.pool);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getUserCount(): Promise<number> {
    const result = await this.pool.query<{ count: string }>("SELECT COUNT(*) AS count FROM cloud_users");
    return Number(result.rows[0]?.count ?? 0);
  }

  async findUserByIdentifier(identifier: string): Promise<CloudUserRecord | null> {
    const normalized = normalizeIdentifier(identifier);
    if (!normalized) {
      return null;
    }

    const result = await this.pool.query<UserRow>(
      `
        SELECT *
        FROM cloud_users
        WHERE email_normalized = $1 OR username_normalized = $1
        LIMIT 1
      `,
      [normalized],
    );

    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async getUserById(id: string): Promise<CloudUserRecord | null> {
    const result = await this.pool.query<UserRow>("SELECT * FROM cloud_users WHERE id = $1", [id]);
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async createOwnerWorkspace(input: CloudBootstrapOwnerInput, passwordHash: string): Promise<CloudSessionView> {
    const now = new Date().toISOString();
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const membershipId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `
          INSERT INTO cloud_users (
            id, name, email, email_normalized, username, username_normalized,
            password_hash, role, status, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'owner', 'active', $8, $8)
        `,
        [
          userId,
          input.name,
          input.email ?? null,
          normalizeIdentifier(input.email),
          input.username ?? null,
          normalizeIdentifier(input.username),
          passwordHash,
          now,
        ],
      );
      await client.query(
        `
          INSERT INTO cloud_workspaces (id, name, owner_user_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $4)
        `,
        [workspaceId, input.workspaceName, userId, now],
      );
      await client.query(
        `
          INSERT INTO cloud_workspace_members (id, workspace_id, user_id, role, status, created_at, updated_at)
          VALUES ($1, $2, $3, 'owner', 'active', $4, $4)
        `,
        [membershipId, workspaceId, userId, now],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const user = await this.getUserById(userId);
    const workspaces = await this.listWorkspacesForUser(userId);
    if (!user) {
      throw new Error("Cloud owner was not persisted.");
    }

    return {
      user: toUserView(user),
      workspaces,
    };
  }

  async createWorkspace(ownerUserId: string, input: CloudCreateWorkspaceInput): Promise<CloudWorkspaceView> {
    const now = new Date().toISOString();
    const workspaceId = randomUUID();
    const membershipId = randomUUID();
    await this.pool.query(
      `
        INSERT INTO cloud_workspaces (id, name, owner_user_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $4)
      `,
      [workspaceId, input.name, ownerUserId, now],
    );
    await this.pool.query(
      `
        INSERT INTO cloud_workspace_members (id, workspace_id, user_id, role, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'owner', 'active', $4, $4)
      `,
      [membershipId, workspaceId, ownerUserId, now],
    );
    const workspaces = await this.listWorkspacesForUser(ownerUserId);
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace) {
      throw new Error("Cloud workspace was not persisted.");
    }
    return workspace;
  }

  async createSession(userId: string, tokenHash: string): Promise<void> {
    const now = new Date();
    await this.pool.query(
      `
        INSERT INTO cloud_sessions (id, user_id, token_hash, created_at, expires_at, last_used_at)
        VALUES ($1, $2, $3, $4, $5, $4)
      `,
      [randomUUID(), userId, tokenHash, now.toISOString(), new Date(now.getTime() + sessionDurationMs).toISOString()],
    );
  }

  async getSessionUser(tokenHash: string): Promise<CloudUserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `
        SELECT cloud_users.*
        FROM cloud_sessions
        INNER JOIN cloud_users ON cloud_users.id = cloud_sessions.user_id
        WHERE cloud_sessions.token_hash = $1
          AND cloud_sessions.revoked_at IS NULL
          AND cloud_sessions.expires_at > NOW()
          AND cloud_users.status = 'active'
        LIMIT 1
      `,
      [tokenHash],
    );

    if (!result.rows[0]) {
      return null;
    }

    await this.pool.query("UPDATE cloud_sessions SET last_used_at = $1 WHERE token_hash = $2", [
      new Date().toISOString(),
      tokenHash,
    ]);
    return mapUser(result.rows[0]);
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.pool.query(
      "UPDATE cloud_sessions SET revoked_at = COALESCE(revoked_at, $1) WHERE token_hash = $2",
      [new Date().toISOString(), tokenHash],
    );
  }

  async listWorkspacesForUser(userId: string): Promise<CloudWorkspaceView[]> {
    const result = await this.pool.query<WorkspaceRow>(
      `
        SELECT
          cloud_workspaces.id,
          cloud_workspaces.name,
          cloud_workspace_members.role,
          cloud_workspaces.created_at,
          cloud_workspaces.updated_at
        FROM cloud_workspace_members
        INNER JOIN cloud_workspaces ON cloud_workspaces.id = cloud_workspace_members.workspace_id
        WHERE cloud_workspace_members.user_id = $1
          AND cloud_workspace_members.status = 'active'
        ORDER BY LOWER(cloud_workspaces.name) ASC
      `,
      [userId],
    );

    return result.rows.map(mapWorkspace);
  }

  async getWorkspaceMember(workspaceId: string, userId: string): Promise<CloudMembership | null> {
    const result = await this.pool.query<{
      id: string;
      workspace_id: string;
      user_id: string;
      role: CloudRole;
      status: CloudUserStatus;
    }>(
      `
        SELECT id, workspace_id, user_id, role, status
        FROM cloud_workspace_members
        WHERE workspace_id = $1 AND user_id = $2
        LIMIT 1
      `,
      [workspaceId, userId],
    );

    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          userId: row.user_id,
          role: row.role,
          status: row.status,
        }
      : null;
  }

  async listWorkspaceMembers(workspaceId: string): Promise<CloudWorkspaceMemberView[]> {
    const result = await this.pool.query<MemberRow>(
      `
        SELECT
          cloud_users.*,
          cloud_workspace_members.id AS membership_id,
          cloud_workspace_members.workspace_id,
          cloud_workspace_members.role AS membership_role,
          cloud_workspace_members.status AS membership_status
        FROM cloud_workspace_members
        INNER JOIN cloud_users ON cloud_users.id = cloud_workspace_members.user_id
        WHERE cloud_workspace_members.workspace_id = $1
        ORDER BY cloud_workspace_members.role ASC, LOWER(cloud_users.name) ASC
      `,
      [workspaceId],
    );

    return result.rows.map(mapMember);
  }

  async inviteUser(workspaceId: string, input: CloudInviteUserInput, passwordHash: string): Promise<CloudWorkspaceMemberView> {
    const now = new Date().toISOString();
    const normalizedEmail = normalizeIdentifier(input.email);
    const normalizedUsername = normalizeIdentifier(input.username);
    const existing = input.email
      ? await this.findUserByIdentifier(input.email)
      : input.username
        ? await this.findUserByIdentifier(input.username)
        : null;
    const userId = existing?.id ?? randomUUID();
    const membershipId = randomUUID();

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (!existing) {
        await client.query(
          `
            INSERT INTO cloud_users (
              id, name, email, email_normalized, username, username_normalized,
              password_hash, role, status, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $9)
          `,
          [
            userId,
            input.name,
            input.email ?? null,
            normalizedEmail,
            input.username ?? null,
            normalizedUsername,
            passwordHash,
            input.role,
            now,
          ],
        );
      }

      await client.query(
        `
          INSERT INTO cloud_workspace_members (id, workspace_id, user_id, role, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 'active', $5, $5)
          ON CONFLICT (workspace_id, user_id)
          DO UPDATE SET role = excluded.role, status = 'active', updated_at = excluded.updated_at
        `,
        [membershipId, workspaceId, userId, input.role, now],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const members = await this.listWorkspaceMembers(workspaceId);
    const member = members.find((item) => item.id === userId);
    if (!member) {
      throw new Error("Cloud workspace member was not persisted.");
    }
    return member;
  }

  async updateWorkspaceMember(workspaceId: string, input: CloudUpdateMemberInput): Promise<CloudWorkspaceMemberView | null> {
    await this.pool.query(
      `
        UPDATE cloud_workspace_members
        SET role = $1, status = $2, updated_at = $3
        WHERE workspace_id = $4 AND user_id = $5 AND role != 'owner'
      `,
      [input.role, input.status, new Date().toISOString(), workspaceId, input.userId],
    );

    const members = await this.listWorkspaceMembers(workspaceId);
    return members.find((item) => item.id === input.userId) ?? null;
  }

  async listSyncEntities(workspaceId: string, since?: string): Promise<CloudSyncEntityView[]> {
    const params: string[] = [workspaceId];
    const sinceClause = since ? "AND updated_at > $2" : "";
    if (since) {
      params.push(since);
    }

    const result = await this.pool.query<SyncEntityRow>(
      `
        SELECT *
        FROM cloud_sync_entities
        WHERE workspace_id = $1
          ${sinceClause}
        ORDER BY updated_at ASC, cloud_id ASC
      `,
      params,
    );

    return result.rows.map(mapSyncEntity);
  }

  async getSyncStatus(workspaceId: string, since?: string): Promise<CloudSyncWorkspaceStatus> {
    const result = await this.pool.query<{
      workspace_version: number | string | null;
      last_updated_at: string | null;
      pending_server_changes: number | string | null;
    }>(
      `
        SELECT
          COALESCE(MAX(version), 0) AS workspace_version,
          MAX(updated_at) AS last_updated_at,
          SUM(
            CASE
              WHEN $2::timestamptz IS NULL OR updated_at > $2::timestamptz THEN 1
              ELSE 0
            END
          ) AS pending_server_changes
        FROM cloud_sync_entities
        WHERE workspace_id = $1
      `,
      [workspaceId, since ?? null],
    );
    const row = result.rows[0];

    return {
      workspaceVersion: Number(row?.workspace_version ?? 0),
      lastUpdatedAt: row?.last_updated_at ?? null,
      pendingServerChanges: Number(row?.pending_server_changes ?? 0),
    };
  }

  async upsertSyncChanges(
    workspaceId: string,
    userId: string,
    changes: CloudSyncEntityChange[],
  ): Promise<CloudSyncPushResult> {
    const applied: CloudSyncEntityView[] = [];
    const conflicts: CloudSyncConflictView[] = [];
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");
      for (const change of changes) {
        const existingResult = await client.query<SyncEntityRow>(
          `
            SELECT *
            FROM cloud_sync_entities
            WHERE workspace_id = $1
              AND (
                ($2::text IS NOT NULL AND cloud_id = $2)
                OR (entity_type = $3 AND local_id = $4)
              )
            LIMIT 1
          `,
          [workspaceId, change.cloudId ?? null, change.entityType, change.localId],
        );
        const existing = existingResult.rows[0] ? mapSyncEntity(existingResult.rows[0]) : null;
        const cloudId = existing?.cloudId ?? change.cloudId ?? randomUUID();
        const incomingBaseVersion = change.baseVersion ?? 0;
        const hasConflict = existing ? existing.version > incomingBaseVersion : false;
        const updatedAt = change.updatedAt;
        const payload = change.payload;

        if (existing && hasConflict) {
          const conflictId = randomUUID();
          await client.query(
            `
              INSERT INTO cloud_sync_conflicts (
                id, workspace_id, cloud_id, entity_type, local_id, remote_version,
                incoming_base_version, remote_payload, incoming_payload,
                created_by_user_id, created_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
            `,
            [
              conflictId,
              workspaceId,
              existing.cloudId,
              change.entityType,
              change.localId,
              existing.version,
              incomingBaseVersion,
              JSON.stringify(existing.payload),
              JSON.stringify(payload),
              userId,
              new Date().toISOString(),
            ],
          );
          const conflictResult = await client.query<ConflictRow>(
            "SELECT * FROM cloud_sync_conflicts WHERE id = $1",
            [conflictId],
          );
          if (conflictResult.rows[0]) {
            conflicts.push(mapConflict(conflictResult.rows[0]));
          }
        }

        const result = await client.query<SyncEntityRow>(
          `
            INSERT INTO cloud_sync_entities (
              cloud_id, workspace_id, entity_type, local_id, payload, payload_hash,
              version, updated_by_user_id, created_at, updated_at, deleted_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, 1, $7, $8, $9, $10)
            ON CONFLICT (workspace_id, entity_type, local_id)
            DO UPDATE SET
              payload = excluded.payload,
              payload_hash = excluded.payload_hash,
              version = cloud_sync_entities.version + 1,
              updated_by_user_id = excluded.updated_by_user_id,
              updated_at = excluded.updated_at,
              deleted_at = excluded.deleted_at
            RETURNING *
          `,
          [
            cloudId,
            workspaceId,
            change.entityType,
            change.localId,
            JSON.stringify(payload),
            hashPayload(payload),
            userId,
            existing?.createdAt ?? updatedAt,
            updatedAt,
            change.deletedAt ?? null,
          ],
        );
        if (result.rows[0]) {
          applied.push(mapSyncEntity(result.rows[0]));
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    return { applied, conflicts };
  }

  async recordAudit(input: {
    workspaceId: string | null;
    actorUserId: string | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `
        INSERT INTO cloud_audit_logs (
          id, workspace_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      `,
      [
        randomUUID(),
        input.workspaceId,
        input.actorUserId,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        JSON.stringify(input.metadata ?? {}),
        new Date().toISOString(),
      ],
    );
  }
}

interface MemoryUser extends CloudUserRecord {
  emailNormalized: string | null;
  usernameNormalized: string | null;
}

interface MemoryWorkspace {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}

interface MemorySession {
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
}

export class InMemoryCloudStorage implements CloudStorageService {
  private users = new Map<string, MemoryUser>();
  private workspaces = new Map<string, MemoryWorkspace>();
  private members = new Map<string, CloudMembership>();
  private sessions = new Map<string, MemorySession>();
  private syncEntities = new Map<string, CloudSyncEntityView>();
  private conflicts: CloudSyncConflictView[] = [];

  async initialize(): Promise<void> {
    return undefined;
  }

  async close(): Promise<void> {
    return undefined;
  }

  async getUserCount(): Promise<number> {
    return this.users.size;
  }

  async findUserByIdentifier(identifier: string): Promise<CloudUserRecord | null> {
    const normalized = normalizeIdentifier(identifier);
    const user = [...this.users.values()].find(
      (item) => item.emailNormalized === normalized || item.usernameNormalized === normalized,
    );
    return user ?? null;
  }

  async getUserById(id: string): Promise<CloudUserRecord | null> {
    return this.users.get(id) ?? null;
  }

  async createOwnerWorkspace(input: CloudBootstrapOwnerInput, passwordHash: string): Promise<CloudSessionView> {
    const now = new Date().toISOString();
    const user: MemoryUser = {
      id: randomUUID(),
      name: input.name,
      email: input.email ?? null,
      emailNormalized: normalizeIdentifier(input.email),
      username: input.username ?? null,
      usernameNormalized: normalizeIdentifier(input.username),
      passwordHash,
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    const workspace: MemoryWorkspace = {
      id: randomUUID(),
      name: input.workspaceName,
      ownerUserId: user.id,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    this.workspaces.set(workspace.id, workspace);
    this.members.set(`${workspace.id}:${user.id}`, {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
      status: "active",
    });
    return {
      user: toUserView(user),
      workspaces: await this.listWorkspacesForUser(user.id),
    };
  }

  async createWorkspace(ownerUserId: string, input: CloudCreateWorkspaceInput): Promise<CloudWorkspaceView> {
    const now = new Date().toISOString();
    const workspace: MemoryWorkspace = {
      id: randomUUID(),
      name: input.name,
      ownerUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.workspaces.set(workspace.id, workspace);
    this.members.set(`${workspace.id}:${ownerUserId}`, {
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: ownerUserId,
      role: "owner",
      status: "active",
    });
    return (await this.listWorkspacesForUser(ownerUserId)).find((item) => item.id === workspace.id)!;
  }

  async createSession(userId: string, tokenHash: string): Promise<void> {
    const now = new Date();
    this.sessions.set(tokenHash, {
      userId,
      tokenHash,
      expiresAt: new Date(now.getTime() + sessionDurationMs).toISOString(),
      revokedAt: null,
    });
  }

  async getSessionUser(tokenHash: string): Promise<CloudUserRecord | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.revokedAt || session.expiresAt <= new Date().toISOString()) {
      return null;
    }
    const user = this.users.get(session.userId);
    return user?.status === "active" ? user : null;
  }

  async revokeSession(tokenHash: string): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session) {
      session.revokedAt = new Date().toISOString();
    }
  }

  async listWorkspacesForUser(userId: string): Promise<CloudWorkspaceView[]> {
    return [...this.members.values()]
      .filter((member) => member.userId === userId && member.status === "active")
      .map((member) => {
        const workspace = this.workspaces.get(member.workspaceId);
        if (!workspace) {
          return null;
        }
        return {
          id: workspace.id,
          name: workspace.name,
          role: member.role,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
        };
      })
      .filter((item): item is CloudWorkspaceView => Boolean(item));
  }

  async getWorkspaceMember(workspaceId: string, userId: string): Promise<CloudMembership | null> {
    return this.members.get(`${workspaceId}:${userId}`) ?? null;
  }

  async listWorkspaceMembers(workspaceId: string): Promise<CloudWorkspaceMemberView[]> {
    return [...this.members.values()]
      .filter((member) => member.workspaceId === workspaceId)
      .map((member) => {
        const user = this.users.get(member.userId);
        if (!user) {
          return null;
        }
        return {
          ...toUserView(user, member.role),
          status: member.status,
          membershipId: member.id,
          workspaceId,
        };
      })
      .filter((item): item is CloudWorkspaceMemberView => Boolean(item));
  }

  async inviteUser(workspaceId: string, input: CloudInviteUserInput, passwordHash: string): Promise<CloudWorkspaceMemberView> {
    const now = new Date().toISOString();
    const existing = input.email
      ? await this.findUserByIdentifier(input.email)
      : input.username
        ? await this.findUserByIdentifier(input.username)
        : null;
    const user: MemoryUser =
      (existing as MemoryUser | null) ?? {
        id: randomUUID(),
        name: input.name,
        email: input.email ?? null,
        emailNormalized: normalizeIdentifier(input.email),
        username: input.username ?? null,
        usernameNormalized: normalizeIdentifier(input.username),
        passwordHash,
        role: input.role,
        status: "active",
        createdAt: now,
        updatedAt: now,
      };
    this.users.set(user.id, user);
    this.members.set(`${workspaceId}:${user.id}`, {
      id: randomUUID(),
      workspaceId,
      userId: user.id,
      role: input.role,
      status: "active",
    });
    return (await this.listWorkspaceMembers(workspaceId)).find((item) => item.id === user.id)!;
  }

  async updateWorkspaceMember(workspaceId: string, input: CloudUpdateMemberInput): Promise<CloudWorkspaceMemberView | null> {
    const member = this.members.get(`${workspaceId}:${input.userId}`);
    if (!member || member.role === "owner") {
      return null;
    }
    member.role = input.role;
    member.status = input.status;
    return (await this.listWorkspaceMembers(workspaceId)).find((item) => item.id === input.userId) ?? null;
  }

  async listSyncEntities(workspaceId: string, since?: string): Promise<CloudSyncEntityView[]> {
    return [...this.syncEntities.values()]
      .filter((entity) => entity.workspaceId === workspaceId)
      .filter((entity) => !since || entity.updatedAt > since)
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt) || left.cloudId.localeCompare(right.cloudId));
  }

  async getSyncStatus(workspaceId: string, since?: string): Promise<CloudSyncWorkspaceStatus> {
    const entities = [...this.syncEntities.values()].filter((entity) => entity.workspaceId === workspaceId);
    const lastUpdatedAt = entities.reduce<string | null>(
      (latest, entity) => (!latest || entity.updatedAt > latest ? entity.updatedAt : latest),
      null,
    );
    const workspaceVersion = entities.reduce((version, entity) => Math.max(version, entity.version), 0);
    const pendingServerChanges = entities.filter((entity) => !since || entity.updatedAt > since).length;

    return {
      workspaceVersion,
      lastUpdatedAt,
      pendingServerChanges,
    };
  }

  async upsertSyncChanges(
    workspaceId: string,
    userId: string,
    changes: CloudSyncEntityChange[],
  ): Promise<CloudSyncPushResult> {
    const applied: CloudSyncEntityView[] = [];
    const conflicts: CloudSyncConflictView[] = [];
    for (const change of changes) {
      const existing = [...this.syncEntities.values()].find(
        (entity) =>
          entity.workspaceId === workspaceId &&
          ((change.cloudId && entity.cloudId === change.cloudId) ||
            (entity.entityType === change.entityType && entity.localId === change.localId)),
      );
      if (existing && existing.version > change.baseVersion) {
        const conflict: CloudSyncConflictView = {
          id: randomUUID(),
          workspaceId,
          entityType: change.entityType,
          localId: change.localId,
          cloudId: existing.cloudId,
          remoteVersion: existing.version,
          incomingBaseVersion: change.baseVersion,
          createdAt: new Date().toISOString(),
        };
        this.conflicts.push(conflict);
        conflicts.push(conflict);
      }

      const entity: CloudSyncEntityView = {
        cloudId: existing?.cloudId ?? change.cloudId ?? randomUUID(),
        workspaceId,
        entityType: change.entityType,
        localId: change.localId,
        payload: change.payload,
        version: (existing?.version ?? 0) + 1,
        updatedByUserId: userId,
        createdAt: existing?.createdAt ?? change.updatedAt,
        updatedAt: change.updatedAt,
        deletedAt: change.deletedAt ?? null,
      };
      this.syncEntities.set(entity.cloudId, entity);
      applied.push(entity);
    }

    return { applied, conflicts };
  }

  async recordAudit(): Promise<void> {
    return undefined;
  }
}
