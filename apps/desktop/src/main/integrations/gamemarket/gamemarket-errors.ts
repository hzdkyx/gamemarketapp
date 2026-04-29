export type GameMarketErrorCode =
  | "GAMEMARKET_AUTH_ERROR"
  | "GAMEMARKET_NETWORK_ERROR"
  | "GAMEMARKET_RATE_LIMIT_ERROR"
  | "GAMEMARKET_VALIDATION_ERROR"
  | "GAMEMARKET_API_ERROR"
  | "GAMEMARKET_DOCS_MISSING"
  | "GAMEMARKET_UNKNOWN_ERROR";

export interface GameMarketSafeError {
  code: GameMarketErrorCode;
  safeMessage: string;
  safeDetails: Record<string, unknown>;
  retryable: boolean;
  timestamp: string;
}

const sensitiveKeyPattern = /(token|secret|senha|password|key|chave|authorization|x-api-key)/i;
const sensitiveValuePattern = /(gm_sk_|gmk_|bearer\s+)[a-z0-9._-]+/gi;

export const redactSensitiveValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replace(sensitiveValuePattern, "[mascarado]");
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitiveValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        sensitiveKeyPattern.test(key) ? "[mascarado]" : redactSensitiveValue(nestedValue)
      ])
    );
  }

  return value;
};

export class GameMarketBaseError extends Error {
  readonly code: GameMarketErrorCode;
  readonly safeMessage: string;
  readonly safeDetails: Record<string, unknown>;
  readonly retryable: boolean;
  readonly timestamp: string;

  constructor(input: {
    code: GameMarketErrorCode;
    message: string;
    safeMessage: string;
    safeDetails?: Record<string, unknown>;
    retryable?: boolean;
    timestamp?: string;
  }) {
    super(input.message);
    this.name = this.constructor.name;
    this.code = input.code;
    this.safeMessage = input.safeMessage;
    this.safeDetails = (redactSensitiveValue(input.safeDetails ?? {}) ?? {}) as Record<string, unknown>;
    this.retryable = input.retryable ?? false;
    this.timestamp = input.timestamp ?? new Date().toISOString();
  }

  toSafeError(): GameMarketSafeError {
    return {
      code: this.code,
      safeMessage: this.safeMessage,
      safeDetails: this.safeDetails,
      retryable: this.retryable,
      timestamp: this.timestamp
    };
  }
}

export class GameMarketAuthError extends GameMarketBaseError {
  constructor(details?: Record<string, unknown>) {
    super({
      code: "GAMEMARKET_AUTH_ERROR",
      message: "GameMarket API authentication failed.",
      safeMessage: "A chave da GameMarket foi recusada ou não tem permissão para esta operação.",
      safeDetails: details ?? {},
      retryable: false
    });
  }
}

export class GameMarketNetworkError extends GameMarketBaseError {
  constructor(details?: Record<string, unknown>) {
    super({
      code: "GAMEMARKET_NETWORK_ERROR",
      message: "GameMarket API network request failed.",
      safeMessage: "Não foi possível conectar à API da GameMarket.",
      safeDetails: details ?? {},
      retryable: true
    });
  }
}

export class GameMarketRateLimitError extends GameMarketBaseError {
  constructor(details?: Record<string, unknown>) {
    super({
      code: "GAMEMARKET_RATE_LIMIT_ERROR",
      message: "GameMarket API rate limit exceeded.",
      safeMessage: "Limite de requisições da GameMarket atingido. Aguarde antes de tentar novamente.",
      safeDetails: details ?? {},
      retryable: true
    });
  }
}

export class GameMarketValidationError extends GameMarketBaseError {
  constructor(details?: Record<string, unknown>) {
    super({
      code: "GAMEMARKET_VALIDATION_ERROR",
      message: "GameMarket API response validation failed.",
      safeMessage: "A resposta da GameMarket veio em um formato diferente do documentado.",
      safeDetails: details ?? {},
      retryable: false
    });
  }
}

export class GameMarketApiError extends GameMarketBaseError {
  constructor(details?: Record<string, unknown>, retryable = false) {
    super({
      code: "GAMEMARKET_API_ERROR",
      message: "GameMarket API returned an error.",
      safeMessage: "A API da GameMarket retornou erro para esta operação.",
      safeDetails: details ?? {},
      retryable
    });
  }
}

export class GameMarketDocsMissingError extends GameMarketBaseError {
  constructor(details?: Record<string, unknown>) {
    super({
      code: "GAMEMARKET_DOCS_MISSING",
      message: "GameMarket API documentation is missing or incomplete.",
      safeMessage: "A documentação local da GameMarket está ausente ou incompleta.",
      safeDetails: details ?? {},
      retryable: false
    });
  }
}

export class GameMarketUnknownError extends GameMarketBaseError {
  constructor(details?: Record<string, unknown>) {
    super({
      code: "GAMEMARKET_UNKNOWN_ERROR",
      message: "Unexpected GameMarket integration error.",
      safeMessage: "Erro inesperado na integração GameMarket.",
      safeDetails: details ?? {},
      retryable: false
    });
  }
}

export const toGameMarketSafeError = (error: unknown): GameMarketSafeError => {
  if (error instanceof GameMarketBaseError) {
    return error.toSafeError();
  }

  return new GameMarketUnknownError({
    error: error instanceof Error ? error.message : String(error)
  }).toSafeError();
};
