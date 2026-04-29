import type {
  EventSeverity,
  GameMarketWebhookEventType,
} from "../contracts/event-contracts.js";

export interface NormalizedWebhookEvent {
  eventType: GameMarketWebhookEventType;
  severity: EventSeverity;
  title: string;
  message: string;
  externalEventId: string | null;
  createdAt: string | null;
}

const eventMetadata: Record<GameMarketWebhookEventType, { title: string; message: string; severity: EventSeverity }> = {
  "gamemarket.product.created": {
    title: "Produto criado",
    message: "Produto criado na GameMarket.",
    severity: "info",
  },
  "gamemarket.product.approved": {
    title: "Produto aprovado",
    message: "Produto aprovado na GameMarket.",
    severity: "info",
  },
  "gamemarket.product.rejected": {
    title: "Produto rejeitado",
    message: "Produto rejeitado na GameMarket.",
    severity: "warning",
  },
  "gamemarket.product.out_of_stock": {
    title: "Produto sem estoque",
    message: "PRODUTO SEM ESTOQUE. Verifique o anuncio.",
    severity: "warning",
  },
  "gamemarket.product.variant_sold_out": {
    title: "Variante esgotada",
    message: "VARIANTE ESGOTADA. Verifique o anuncio.",
    severity: "warning",
  },
  "gamemarket.order.created": {
    title: "Pedido criado",
    message: "Pedido criado na GameMarket.",
    severity: "info",
  },
  "gamemarket.order.sale_confirmed": {
    title: "Venda confirmada",
    message: "NOVA VENDA CONFIRMADA NA GAMEMARKET. Acesse o painel e entregue o produto.",
    severity: "success",
  },
  "gamemarket.order.delivered": {
    title: "Pedido entregue",
    message: "Pedido marcado como entregue na GameMarket.",
    severity: "info",
  },
  "gamemarket.order.completed": {
    title: "Pedido concluido",
    message: "Pedido concluido na GameMarket.",
    severity: "success",
  },
  "gamemarket.order.cancelled": {
    title: "Pedido cancelado",
    message: "Pedido cancelado na GameMarket.",
    severity: "warning",
  },
  "gamemarket.financial.balance_updated": {
    title: "Saldo atualizado",
    message: "Saldo atualizado na GameMarket.",
    severity: "info",
  },
  "gamemarket.financial.funds_released": {
    title: "Fundos liberados",
    message: "Fundos liberados na GameMarket.",
    severity: "success",
  },
  "gamemarket.financial.withdrawal_requested": {
    title: "Saque solicitado",
    message: "Saque solicitado na GameMarket.",
    severity: "info",
  },
  "gamemarket.financial.withdrawal_completed": {
    title: "Saque concluido",
    message: "Saque concluido na GameMarket.",
    severity: "info",
  },
  "gamemarket.financial.withdrawal_rejected": {
    title: "Saque rejeitado",
    message: "Saque rejeitado na GameMarket.",
    severity: "critical",
  },
  "gamemarket.financial.refund_started": {
    title: "Reembolso iniciado",
    message: "REEMBOLSO INICIADO. Revise o pedido.",
    severity: "critical",
  },
  "gamemarket.mediation.opened": {
    title: "Mediacao aberta",
    message: "MEDIACAO ABERTA. Acesse a GameMarket e responda o comprador.",
    severity: "critical",
  },
  "gamemarket.mediation.updated": {
    title: "Mediacao atualizada",
    message: "Mediacao atualizada na GameMarket.",
    severity: "warning",
  },
  "gamemarket.mediation.resolved": {
    title: "Mediacao resolvida",
    message: "Mediacao resolvida na GameMarket.",
    severity: "info",
  },
  "gamemarket.review.received": {
    title: "Avaliacao recebida",
    message: "NOVA AVALIACAO RECEBIDA.",
    severity: "success",
  },
  "gamemarket.unknown": {
    title: "Evento GameMarket desconhecido",
    message: "NOVO EVENTO GAMEMARKET RECEBIDO. Revise os detalhes.",
    severity: "warning",
  },
};

const aliasMap: Array<[string, GameMarketWebhookEventType]> = [
  ["produto criado", "gamemarket.product.created"],
  ["product created", "gamemarket.product.created"],
  ["produto aprovado", "gamemarket.product.approved"],
  ["product approved", "gamemarket.product.approved"],
  ["produto rejeitado", "gamemarket.product.rejected"],
  ["product rejected", "gamemarket.product.rejected"],
  ["sem estoque", "gamemarket.product.out_of_stock"],
  ["out of stock", "gamemarket.product.out_of_stock"],
  ["variante esgotada", "gamemarket.product.variant_sold_out"],
  ["variant sold out", "gamemarket.product.variant_sold_out"],
  ["pedido criado", "gamemarket.order.created"],
  ["order created", "gamemarket.order.created"],
  ["venda confirmada", "gamemarket.order.sale_confirmed"],
  ["sale confirmed", "gamemarket.order.sale_confirmed"],
  ["payment confirmed", "gamemarket.order.sale_confirmed"],
  ["pedido entregue", "gamemarket.order.delivered"],
  ["order delivered", "gamemarket.order.delivered"],
  ["pedido concluido", "gamemarket.order.completed"],
  ["order completed", "gamemarket.order.completed"],
  ["pedido cancelado", "gamemarket.order.cancelled"],
  ["order cancelled", "gamemarket.order.cancelled"],
  ["order canceled", "gamemarket.order.cancelled"],
  ["saldo atualizado", "gamemarket.financial.balance_updated"],
  ["balance updated", "gamemarket.financial.balance_updated"],
  ["fundos liberados", "gamemarket.financial.funds_released"],
  ["funds released", "gamemarket.financial.funds_released"],
  ["saque solicitado", "gamemarket.financial.withdrawal_requested"],
  ["withdrawal requested", "gamemarket.financial.withdrawal_requested"],
  ["saque concluido", "gamemarket.financial.withdrawal_completed"],
  ["withdrawal completed", "gamemarket.financial.withdrawal_completed"],
  ["saque rejeitado", "gamemarket.financial.withdrawal_rejected"],
  ["withdrawal rejected", "gamemarket.financial.withdrawal_rejected"],
  ["reembolso iniciado", "gamemarket.financial.refund_started"],
  ["refund started", "gamemarket.financial.refund_started"],
  ["mediação aberta", "gamemarket.mediation.opened"],
  ["mediacao aberta", "gamemarket.mediation.opened"],
  ["mediation opened", "gamemarket.mediation.opened"],
  ["mediação atualizada", "gamemarket.mediation.updated"],
  ["mediacao atualizada", "gamemarket.mediation.updated"],
  ["mediation updated", "gamemarket.mediation.updated"],
  ["mediação resolvida", "gamemarket.mediation.resolved"],
  ["mediacao resolvida", "gamemarket.mediation.resolved"],
  ["mediation resolved", "gamemarket.mediation.resolved"],
  ["avaliação recebida", "gamemarket.review.received"],
  ["avaliacao recebida", "gamemarket.review.received"],
  ["review received", "gamemarket.review.received"],
];

const normalizeText = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const readPath = (payload: unknown, path: string[]): unknown => {
  let current = payload;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
};

const readFirstString = (payload: unknown, paths: string[][]): string | null => {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
};

const collectCandidates = (payload: unknown): string[] => {
  const paths = [
    ["event"],
    ["type"],
    ["event_type"],
    ["eventType"],
    ["action"],
    ["category"],
    ["resource"],
    ["status"],
    ["data", "event"],
    ["data", "type"],
    ["data", "event_type"],
    ["data", "eventType"],
    ["data", "action"],
    ["data", "category"],
    ["data", "resource"],
    ["data", "status"],
    ["payload", "event"],
    ["payload", "type"],
    ["payload", "event_type"],
    ["payload", "eventType"],
    ["payload", "action"],
    ["payload", "category"],
    ["payload", "resource"],
    ["payload", "status"],
  ];

  return paths
    .map((path) => readPath(payload, path))
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map(String)
    .filter(Boolean);
};

const detectType = (payload: unknown): GameMarketWebhookEventType => {
  const candidates = collectCandidates(payload).map(normalizeText);
  const combined = candidates.join(" ");

  for (const [alias, eventType] of aliasMap) {
    const normalizedAlias = normalizeText(alias);
    if (candidates.includes(normalizedAlias) || combined.includes(normalizedAlias)) {
      return eventType;
    }
  }

  return "gamemarket.unknown";
};

const readCreatedAt = (payload: unknown): string | null => {
  const value = readFirstString(payload, [
    ["created_at"],
    ["createdAt"],
    ["timestamp"],
    ["occurred_at"],
    ["occurredAt"],
    ["data", "created_at"],
    ["data", "createdAt"],
    ["payload", "created_at"],
    ["payload", "createdAt"],
  ]);

  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const normalizeGameMarketWebhookEvent = (payload: unknown): NormalizedWebhookEvent => {
  const eventType = detectType(payload);
  const metadata = eventMetadata[eventType];

  return {
    eventType,
    severity: metadata.severity,
    title: metadata.title,
    message: metadata.message,
    externalEventId: readFirstString(payload, [
      ["event_id"],
      ["eventId"],
      ["webhook_id"],
      ["webhookId"],
      ["notification_id"],
      ["notificationId"],
      ["id"],
      ["data", "event_id"],
      ["data", "eventId"],
      ["payload", "event_id"],
      ["payload", "eventId"],
    ]),
    createdAt: readCreatedAt(payload),
  };
};

export const getEventMetadata = (eventType: GameMarketWebhookEventType) => eventMetadata[eventType];
