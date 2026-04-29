import type { z } from "zod";
import {
  gamemarketGamesResponseSchema,
  gamemarketOrderListResponseSchema,
  gamemarketProductListResponseSchema,
  type GameMarketGamesResponse,
  type GameMarketOrderListResponse,
  type GameMarketProductListResponse
} from "./gamemarket-contracts";
import {
  GameMarketApiError,
  GameMarketAuthError,
  GameMarketNetworkError,
  GameMarketRateLimitError,
  GameMarketValidationError
} from "./gamemarket-errors";

type FetchLike = typeof fetch;

export interface GameMarketClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

interface RequestOptions<TSchema extends z.ZodType> {
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  schema: TSchema;
}

const defaultTimeoutMs = 12_000;

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

const buildUrl = (
  baseUrl: string,
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>
): string => {
  const url = new URL(path, `${normalizeBaseUrl(baseUrl)}/`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
};

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GameMarketValidationError({
      status: response.status,
      reason: "invalid_json"
    });
  }
};

export class GameMarketClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;

  constructor(options: GameMarketClientOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listGames(): Promise<GameMarketGamesResponse> {
    return this.get({
      path: "/api/v1/games",
      schema: gamemarketGamesResponseSchema
    });
  }

  async listProducts(page: number, limit: number): Promise<GameMarketProductListResponse> {
    return this.get({
      path: "/api/v1/products",
      query: { page, limit },
      schema: gamemarketProductListResponseSchema
    });
  }

  async listOrders(page: number, limit: number): Promise<GameMarketOrderListResponse> {
    return this.get({
      path: "/api/v1/orders",
      query: { page, limit, type: "sales" },
      schema: gamemarketOrderListResponseSchema
    });
  }

  private async get<TSchema extends z.ZodType>(
    options: RequestOptions<TSchema>
  ): Promise<z.infer<TSchema>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url = buildUrl(this.baseUrl, options.path, options.query);

    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-api-key": this.apiKey
        },
        signal: controller.signal
      });

      const body = await parseJson(response);

      if (response.status === 401 || response.status === 403) {
        throw new GameMarketAuthError({
          status: response.status,
          endpoint: options.path
        });
      }

      if (response.status === 429) {
        throw new GameMarketRateLimitError({
          status: response.status,
          endpoint: options.path,
          rateLimitReset: response.headers.get("X-RateLimit-Reset")
        });
      }

      if (!response.ok) {
        throw new GameMarketApiError(
          {
            status: response.status,
            endpoint: options.path,
            body
          },
          response.status >= 500
        );
      }

      const parsed = options.schema.safeParse(body);
      if (!parsed.success) {
        throw new GameMarketValidationError({
          endpoint: options.path,
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        });
      }

      return parsed.data;
    } catch (error) {
      if (
        error instanceof GameMarketAuthError ||
        error instanceof GameMarketRateLimitError ||
        error instanceof GameMarketApiError ||
        error instanceof GameMarketValidationError
      ) {
        throw error;
      }

      throw new GameMarketNetworkError({
        endpoint: options.path,
        reason: error instanceof Error ? error.message : String(error)
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
