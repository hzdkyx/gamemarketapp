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
