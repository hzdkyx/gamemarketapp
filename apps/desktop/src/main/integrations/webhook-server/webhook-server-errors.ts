export class WebhookServerHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "WebhookServerHttpError";
  }
}

export class WebhookServerAuthError extends WebhookServerHttpError {
  constructor() {
    super("Token do Webhook Server invalido ou ausente.", 401);
    this.name = "WebhookServerAuthError";
  }
}

export class WebhookServerNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookServerNetworkError";
  }
}

export class WebhookServerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookServerValidationError";
  }
}

export interface WebhookServerSafeError {
  code: string;
  safeMessage: string;
  status?: number;
}

export const toWebhookServerSafeError = (error: unknown): WebhookServerSafeError => {
  if (error instanceof WebhookServerAuthError) {
    return {
      code: "WEBHOOK_SERVER_AUTH",
      safeMessage: "Token do Webhook Server recusado.",
      status: error.status
    };
  }

  if (error instanceof WebhookServerHttpError) {
    return {
      code: "WEBHOOK_SERVER_HTTP",
      safeMessage: `Webhook Server respondeu com HTTP ${error.status}.`,
      status: error.status
    };
  }

  if (error instanceof WebhookServerNetworkError) {
    return {
      code: "WEBHOOK_SERVER_NETWORK",
      safeMessage: "Webhook Server indisponivel ou URL inacessivel."
    };
  }

  if (error instanceof WebhookServerValidationError) {
    return {
      code: "WEBHOOK_SERVER_VALIDATION",
      safeMessage: "Resposta inesperada do Webhook Server."
    };
  }

  return {
    code: "WEBHOOK_SERVER_UNKNOWN",
    safeMessage: error instanceof Error ? error.message : "Falha inesperada no Webhook Server."
  };
};
