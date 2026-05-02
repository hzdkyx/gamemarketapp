import { describe, expect, it, vi } from "vitest";
import { CloudSyncClient, type CloudSyncChange } from "./cloud-sync-client";

const makePushResponse = (applied: unknown[] = []) =>
  new Response(
    JSON.stringify({
      ok: true,
      workspaceId: "workspace-1",
      applied,
      conflicts: [],
      serverTime: "2026-05-01T12:00:00.000Z"
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );

describe("CloudSyncClient.push", () => {
  it("always sends entities as an array, even when called with an invalid empty value", async () => {
    let parsedBody: unknown = null;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      parsedBody = JSON.parse(String(init?.body));
      return makePushResponse();
    });
    const client = new CloudSyncClient({
      baseUrl: "https://cloud.example.test",
      sessionToken: "session-token",
      fetchImpl: fetchImpl as typeof fetch
    });

    const result = await client.push("workspace-1", undefined as unknown as CloudSyncChange[]);

    expect(parsedBody).toEqual({
      workspaceId: "workspace-1",
      entities: []
    });
    expect(result.entities).toEqual([]);
    expect(result.applied).toEqual([]);
  });

  it("uses entities as the push request contract and accepts legacy responses without entities", async () => {
    let parsedBody: unknown = null;
    const change: CloudSyncChange = {
      entityType: "products",
      localId: "product-1",
      baseVersion: 0,
      updatedAt: "2026-05-01T12:00:00.000Z",
      deletedAt: null,
      payload: { id: "product-1", name: "Produto" }
    };
    const applied = {
      cloudId: "cloud-product-1",
      workspaceId: "workspace-1",
      entityType: "products",
      localId: "product-1",
      payload: { id: "product-1", name: "Produto" },
      version: 1,
      updatedByUserId: "user-1",
      createdAt: "2026-05-01T12:00:00.000Z",
      updatedAt: "2026-05-01T12:00:00.000Z",
      deletedAt: null
    };
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      parsedBody = JSON.parse(String(init?.body));
      return makePushResponse([applied]);
    });
    const client = new CloudSyncClient({
      baseUrl: "https://cloud.example.test",
      sessionToken: "session-token",
      fetchImpl: fetchImpl as typeof fetch
    });

    const result = await client.push("workspace-1", [change]);

    expect(parsedBody).toEqual({
      workspaceId: "workspace-1",
      entities: [change]
    });
    expect(result.entities).toHaveLength(1);
    expect(result.applied).toHaveLength(1);
  });
});

describe("CloudSyncClient.status", () => {
  it("requests lightweight workspace status with the last pull cursor", async () => {
    let requestedUrl = "";
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return new Response(
        JSON.stringify({
          ok: true,
          workspaceId: "workspace-1",
          workspaceVersion: 7,
          lastUpdatedAt: "2026-05-01T12:00:00.000Z",
          pendingServerChanges: 0,
          serverTime: "2026-05-01T12:01:00.000Z"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });
    const client = new CloudSyncClient({
      baseUrl: "https://cloud.example.test",
      sessionToken: "session-token",
      fetchImpl: fetchImpl as typeof fetch
    });

    const result = await client.status("workspace-1", "2026-05-01T11:59:00.000Z");

    expect(requestedUrl).toContain("/api/sync/status?");
    expect(requestedUrl).toContain("workspaceId=workspace-1");
    expect(requestedUrl).toContain("since=2026-05-01T11%3A59%3A00.000Z");
    expect(result.pendingServerChanges).toBe(0);
    expect(result.workspaceVersion).toBe(7);
  });
});

describe("CloudSyncClient.workspaceMembers", () => {
  it("changes the current cloud password through the auth endpoint", async () => {
    let requestUrl = "";
    let requestBody = "";
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(url);
      requestBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          ok: true,
          user: {
            id: "user-1",
            name: "Cloud User",
            email: "cloud@example.com",
            username: "cloud-user",
            role: "manager",
            status: "active",
            mustChangePassword: false,
            lastLoginAt: null,
            lastActivityAt: null,
            createdAt: "2026-05-01T12:00:00.000Z",
            updatedAt: "2026-05-01T12:00:00.000Z"
          },
          workspaces: []
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    });
    const client = new CloudSyncClient({
      baseUrl: "https://cloud.example.test",
      sessionToken: "session-token",
      fetchImpl: fetchImpl as typeof fetch
    });

    const result = await client.changePassword({
      currentPassword: "senha-temporaria-123",
      password: "senha-definitiva-456",
      confirmPassword: "senha-definitiva-456"
    });

    expect(requestUrl).toContain("/api/auth/change-password");
    expect(requestBody).not.toContain("passwordHash");
    expect(result.user.mustChangePassword).toBe(false);
  });

  it("uses dedicated member administration endpoints without sending hashes", async () => {
    const requests: Array<{ url: string; method: string; body: string }> = [];
    const member = {
      id: "member-1",
      name: "Manager Editado",
      email: "manager.editado@example.com",
      username: "manager-editado",
      role: "manager",
      status: "active",
      mustChangePassword: false,
      lastLoginAt: null,
      lastActivityAt: null,
      createdAt: "2026-05-01T12:00:00.000Z",
      updatedAt: "2026-05-01T12:00:00.000Z",
      membershipId: "membership-1",
      workspaceId: "workspace-1"
    };
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(url),
        method: init?.method ?? "GET",
        body: String(init?.body ?? "")
      });
      const payload = String(url).endsWith("/audit")
        ? {
            ok: true,
            auditLogs: [
              {
                id: "audit-1",
                workspaceId: "workspace-1",
                actorUserId: "owner-1",
                action: "cloud.member_updated",
                entityType: "cloud_user",
                entityId: "member-1",
                metadata: { targetCloudUserId: "member-1", changedFields: ["name"] },
                createdAt: "2026-05-01T12:00:00.000Z"
              }
            ]
          }
        : { ok: true, member };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    const client = new CloudSyncClient({
      baseUrl: "https://cloud.example.test",
      sessionToken: "session-token",
      fetchImpl: fetchImpl as typeof fetch
    });

    await client.updateMember("workspace-1", {
      userId: "member-1",
      name: "Manager Editado",
      email: "manager.editado@example.com",
      username: "manager-editado",
      role: "manager",
      status: "active"
    });
    await client.disableMember("workspace-1", { userId: "member-1" });
    await client.enableMember("workspace-1", { userId: "member-1" });
    await client.removeMember("workspace-1", {
      userId: "member-1",
      confirmation: "manager-editado"
    });
    await client.resetMemberPassword("workspace-1", {
      userId: "member-1",
      temporaryPassword: "senha-temporaria-123",
      confirmPassword: "senha-temporaria-123",
      mustChangePassword: true
    });
    const audit = await client.listMemberAudit("workspace-1", "member-1");

    expect(requests.map((request) => request.method)).toEqual(["PATCH", "POST", "POST", "DELETE", "POST", "GET"]);
    expect(requests[0]?.url).toContain("/api/workspaces/workspace-1/members/member-1");
    expect(requests[1]?.url).toContain("/api/workspaces/workspace-1/members/member-1/disable");
    expect(requests[2]?.url).toContain("/api/workspaces/workspace-1/members/member-1/enable");
    expect(requests[3]?.body).toBe(JSON.stringify({ confirmation: "manager-editado" }));
    expect(requests[4]?.url).toContain("/api/workspaces/workspace-1/members/member-1/reset-password");
    expect(requests[4]?.body).toBe(
      JSON.stringify({ temporaryPassword: "senha-temporaria-123", requireChange: true })
    );
    expect(requests[4]?.body).not.toContain("passwordHash");
    expect(requests[4]?.body).not.toContain("token");
    expect(requests[4]?.body).not.toContain("confirmPassword");
    expect(audit[0]?.action).toBe("cloud.member_updated");
  });

  it("maps missing reset-password backend routes to a friendly operational error", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          message: "Route POST:/api/workspaces/workspace-1/members/member-1/reset-password not found"
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
    const client = new CloudSyncClient({
      baseUrl: "https://cloud.example.test",
      sessionToken: "session-token",
      fetchImpl: fetchImpl as typeof fetch
    });

    await expect(
      client.resetMemberPassword("workspace-1", {
        userId: "member-1",
        temporaryPassword: "senha-temporaria-123",
        confirmPassword: "senha-temporaria-123",
        mustChangePassword: true
      })
    ).rejects.toThrow("backend pode estar desatualizado");
  });
});
