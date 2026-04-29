import { describe, expect, it, vi } from "vitest";
import { GameMarketClient } from "./gamemarket-client";
import {
  GameMarketAuthError,
  GameMarketNetworkError,
  GameMarketValidationError
} from "./gamemarket-errors";

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json"
    }
  });

describe("GameMarketClient", () => {
  it("calls documented read endpoint with x-api-key and validates success response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        success: true,
        data: [{ name: "Valorant", slug: "valorant", isActive: true }]
      })
    ) as unknown as typeof fetch;
    const client = new GameMarketClient({
      baseUrl: "https://gamemarket.com.br",
      apiKey: "test-api-key-1234",
      fetchImpl
    });

    const result = await client.listGames();

    expect(result.data[0]?.slug).toBe("valorant");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://gamemarket.com.br/api/v1/games",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-api-key": "test-api-key-1234"
        })
      })
    );
  });

  it("maps authentication failures to GameMarketAuthError", async () => {
    const client = new GameMarketClient({
      baseUrl: "https://gamemarket.com.br",
      apiKey: "invalid-test-api-key",
      fetchImpl: vi.fn(async () => jsonResponse({ success: false }, { status: 401 })) as unknown as typeof fetch
    });

    await expect(client.listGames()).rejects.toBeInstanceOf(GameMarketAuthError);
  });

  it("maps network failures to GameMarketNetworkError", async () => {
    const client = new GameMarketClient({
      baseUrl: "https://gamemarket.com.br",
      apiKey: "test-api-key",
      fetchImpl: vi.fn(async () => {
        throw new Error("ECONNRESET");
      }) as unknown as typeof fetch
    });

    await expect(client.listGames()).rejects.toBeInstanceOf(GameMarketNetworkError);
  });

  it("rejects undocumented response shapes", async () => {
    const client = new GameMarketClient({
      baseUrl: "https://gamemarket.com.br",
      apiKey: "test-api-key",
      fetchImpl: vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch
    });

    await expect(client.listGames()).rejects.toBeInstanceOf(GameMarketValidationError);
  });
});
