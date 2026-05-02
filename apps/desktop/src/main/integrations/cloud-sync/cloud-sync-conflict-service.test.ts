import { beforeEach, describe, expect, it, vi } from "vitest";

type ConflictRow = Record<string, unknown>;

const state = vi.hoisted(() => ({
  settings: {
    backendUrl: "https://cloud.example.test",
    mode: "cloud" as const,
    connectionStatus: "connected" as const,
    hasSession: true,
    currentUser: {
      id: "cloud-user-1",
      name: "Owner",
      email: null,
      username: "owner",
      role: "owner" as const,
      status: "active" as const,
      mustChangePassword: false,
      lastLoginAt: null,
      lastActivityAt: null,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z"
    },
    workspaces: [],
    workspaceId: "workspace-1",
    workspaceName: "HzdKyx",
    workspaceRole: "owner" as "owner" | "admin" | "manager" | "operator" | "viewer" | null,
    autoSyncEnabled: true,
    syncIntervalSeconds: 30,
    lastSyncAt: null,
    lastPullAt: null,
    lastPushAt: null,
    lastError: null,
    pendingChanges: 0,
    conflictCount: 0
  },
  conflicts: [] as ConflictRow[],
  markResolutionPending: vi.fn<(entityType: unknown, localId: unknown, baseVersion?: unknown) => void>(),
  applyResolvedRemoteEntity: vi.fn<(entity: unknown, syncedAt: unknown) => { applied: number; ignored: number; skipped: number; reason: string | null }>(() => ({
    applied: 1,
    ignored: 0,
    skipped: 0,
    reason: null
  })),
  applyManualResolutionEntity: vi.fn<
    (entity: unknown, actorUserId: unknown, syncedAt: unknown) => { applied: number; ignored: number; skipped: number; reason: string | null }
  >(() => ({ applied: 1, ignored: 0, skipped: 0, reason: null })),
  auditEvents: [] as Array<Record<string, unknown>>
}));

vi.mock("../../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: (sql: string) => ({
      all: () => {
        if (sql.includes("cloud_sync_conflicts")) {
          return state.conflicts;
        }
        return [];
      },
      run: (params: Record<string, unknown>) => {
        if (sql.includes("UPDATE cloud_sync_conflicts")) {
          const row = state.conflicts.find((item) => item.id === params.id);
          if (row) {
            row.status = params.status;
            row.resolved_at = params.resolvedAt;
            row.resolved_by_local_user_id = params.actorUserId;
            row.resolution_type = params.resolutionType;
            row.resolution_note = params.note;
            row.last_error = params.lastError;
            row.updated_at = params.updatedAt;
          }
          return { changes: row ? 1 : 0 };
        }
        return { changes: 0 };
      }
    })
  })
}));

vi.mock("./cloud-sync-settings-service", () => ({
  cloudSyncSettingsService: {
    getSettings: () => state.settings
  }
}));

vi.mock("./cloud-sync-local-store", () => ({
  cloudSyncLocalStore: {
    markResolutionPending: (entityType: unknown, localId: unknown, baseVersion: unknown) =>
      state.markResolutionPending(entityType, localId, baseVersion),
    applyResolvedRemoteEntity: (entity: unknown, syncedAt: unknown) =>
      state.applyResolvedRemoteEntity(entity, syncedAt),
    applyManualResolutionEntity: (entity: unknown, actorUserId: unknown, syncedAt: unknown) =>
      state.applyManualResolutionEntity(entity, actorUserId, syncedAt)
  }
}));

vi.mock("../../services/event-service", () => ({
  eventService: {
    createInternal: (input: Record<string, unknown>) => {
      state.auditEvents.push(input);
      return input;
    }
  }
}));

vi.mock("../../logger", () => ({
  logger: {
    warn: vi.fn()
  }
}));

const { cloudSyncConflictService } = await import("./cloud-sync-conflict-service");

const makeConflict = (overrides: Partial<ConflictRow> = {}): ConflictRow => ({
  id: "conflict-1",
  workspace_id: "workspace-1",
  entity_type: "products",
  local_id: "product-1",
  cloud_id: "cloud-product-1",
  remote_version: 3,
  incoming_base_version: 2,
  local_payload_json: JSON.stringify({
    id: "product-1",
    name: "Produto local",
    unit_cost_cents: 1000,
    updated_by_user_id: "local-user-1",
    updated_at: "2026-05-01T12:02:00.000Z",
    password: "never-show"
  }),
  remote_payload_json: JSON.stringify({
    id: "product-1",
    name: "Produto nuvem",
    unit_cost_cents: 1400,
    updated_by_user_id: "cloud-user-2",
    updated_at: "2026-05-01T12:03:00.000Z",
    token: "never-show"
  }),
  created_at: "2026-05-01T12:04:00.000Z",
  resolved_at: null,
  status: "pending",
  severity: "high",
  source: "local_pull",
  updated_at: "2026-05-01T12:04:00.000Z",
  ...overrides
});

describe("cloud sync conflict service", () => {
  beforeEach(() => {
    state.settings.workspaceRole = "owner";
    state.settings.hasSession = true;
    state.settings.mode = "cloud";
    state.settings.workspaceId = "workspace-1";
    state.conflicts = [makeConflict()];
    state.markResolutionPending.mockClear();
    state.applyResolvedRemoteEntity.mockClear();
    state.applyManualResolutionEntity.mockClear();
    state.applyResolvedRemoteEntity.mockReturnValue({ applied: 1, ignored: 0, skipped: 0, reason: null });
    state.applyManualResolutionEntity.mockReturnValue({ applied: 1, ignored: 0, skipped: 0, reason: null });
    state.auditEvents = [];
  });

  it("lists pending conflicts with filters and friendly metadata", () => {
    state.conflicts.push(
      makeConflict({
        id: "conflict-2",
        entity_type: "orders",
        local_id: "order-1",
        status: "resolved_remote",
        resolved_at: "2026-05-01T12:10:00.000Z"
      })
    );

    const result = cloudSyncConflictService.list({ status: "pending", entityType: "products" });

    expect(result.items).toHaveLength(1);
    expect(result.pending).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: "conflict-1",
      entityType: "products",
      status: "pending",
      severity: "high",
      affectedFields: expect.arrayContaining(["name", "unit_cost_cents"])
    });
  });

  it("opens details with field diff and sanitized sensitive values", () => {
    const detail = cloudSyncConflictService.getDetail("conflict-1");
    const serialized = JSON.stringify(detail);

    expect(detail.sensitiveFieldsOmitted).toBe(true);
    expect(detail.omittedSensitiveFields).toEqual(expect.arrayContaining(["password", "token"]));
    expect(detail.diff.map((field) => field.field)).toEqual(expect.arrayContaining(["name", "unit_cost_cents"]));
    expect(serialized).not.toContain("never-show");
    expect(serialized).toContain("Campo sensível omitido");
  });

  it("keeps the local version, marks the conflict resolved and schedules push", () => {
    const result = cloudSyncConflictService.resolve(
      { id: "conflict-1", resolutionType: "keep_local" },
      "local-user-1"
    );

    expect(result.status).toBe("resolved_local");
    expect(result.pushScheduled).toBe(true);
    expect(state.markResolutionPending).toHaveBeenCalledWith("products", "product-1", 3);
    expect(state.conflicts[0]).toMatchObject({
      status: "resolved_local",
      resolution_type: "keep_local",
      resolved_by_local_user_id: "local-user-1"
    });
    expect(state.auditEvents[0]).toMatchObject({ type: "cloud.conflict_resolved_local" });
  });

  it("uses the remote version without applying sensitive fields", () => {
    const result = cloudSyncConflictService.resolve(
      { id: "conflict-1", resolutionType: "use_remote" },
      "local-user-1"
    );
    const entity = (state.applyResolvedRemoteEntity.mock.calls[0] as unknown[] | undefined)?.[0] as {
      payload: Record<string, unknown>;
    };

    expect(result.status).toBe("resolved_remote");
    expect(result.pushScheduled).toBe(false);
    expect(entity.payload).toMatchObject({ name: "Produto nuvem", unit_cost_cents: 1400 });
    expect(entity.payload).not.toHaveProperty("token");
  });

  it("saves manual resolution only for permitted non-sensitive fields", () => {
    const result = cloudSyncConflictService.resolve(
      {
        id: "conflict-1",
        resolutionType: "manual",
        manualPayload: {
          name: "Produto escolhido",
          token: "blocked"
        },
        note: "Conferido pelo manager"
      },
      "local-user-1"
    );
    const entity = (state.applyManualResolutionEntity.mock.calls[0] as unknown[] | undefined)?.[0] as {
      payload: Record<string, unknown>;
    };

    expect(result.status).toBe("resolved_manual");
    expect(result.pushScheduled).toBe(true);
    expect(entity.payload).toMatchObject({ name: "Produto escolhido", unit_cost_cents: 1000 });
    expect(entity.payload).not.toHaveProperty("token");
    expect(state.conflicts[0]?.resolution_note).toBe("Conferido pelo manager");
  });

  it("archives a conflict only with explicit confirmation", () => {
    expect(() =>
      cloudSyncConflictService.resolve({ id: "conflict-1", resolutionType: "ignore" }, "local-user-1")
    ).toThrow("Confirme");

    const result = cloudSyncConflictService.resolve(
      { id: "conflict-1", resolutionType: "ignore", confirm: true },
      "local-user-1"
    );

    expect(result.status).toBe("ignored");
    expect(result.pushScheduled).toBe(false);
    expect(state.conflicts[0]?.status).toBe("ignored");
  });

  it("blocks viewers and users without cloud session from resolving", () => {
    state.settings.workspaceRole = "viewer";

    expect(() =>
      cloudSyncConflictService.resolve({ id: "conflict-1", resolutionType: "keep_local" }, "local-user-1")
    ).toThrow("Apenas owner");

    state.settings.workspaceRole = "owner";
    state.settings.hasSession = false;

    expect(() =>
      cloudSyncConflictService.resolve({ id: "conflict-1", resolutionType: "keep_local" }, "local-user-1")
    ).toThrow("Faça login");
  });
});
