import { createHash } from "node:crypto";
import type { OrderStatus, ProductStatus } from "../../../shared/contracts";
import type { GameMarketOrderListItem, GameMarketProductListItem } from "./gamemarket-contracts";

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

export const hashExternalPayload = (payload: unknown): string =>
  createHash("sha256").update(stableStringify(payload)).digest("hex");

export const mapGameMarketProductStatus = (status: string): ProductStatus => {
  if (status === "ativo") {
    return "active";
  }

  if (status === "desativado") {
    return "paused";
  }

  if (status === "rejeitado") {
    return "archived";
  }

  return "paused";
};

export interface GameMarketOrderStatusMapping {
  status: OrderStatus;
  actionRequired: boolean;
}

const initialSyncMutableOrderStatuses = new Set<OrderStatus>(["draft", "pending_payment"]);
const externallyCompletableOrderStatuses = new Set<OrderStatus>([
  "draft",
  "pending_payment",
  "payment_confirmed",
  "awaiting_delivery",
  "delivered"
]);
const completedExternalStatuses = new Set([
  "completed",
  "concluded",
  "concluido",
  "pedido_concluido",
  "order_completed",
  "funds_released",
  "fundos_liberados"
]);
const deliveredExternalStatuses = new Set([
  "delivered",
  "entregue",
  "pedido_entregue",
  "order_delivered"
]);

const normalizeExternalStatus = (status: string): string =>
  status
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const isGameMarketProcessingStatus = (externalStatus: string | null | undefined): boolean =>
  normalizeExternalStatus(externalStatus ?? "") === "processing";

export const isGameMarketCompletedStatus = (externalStatus: string | null | undefined): boolean => {
  const normalized = normalizeExternalStatus(externalStatus ?? "");
  return completedExternalStatuses.has(normalized);
};

export const isGameMarketDeliveredStatus = (externalStatus: string | null | undefined): boolean => {
  const normalized = normalizeExternalStatus(externalStatus ?? "");
  return deliveredExternalStatuses.has(normalized);
};

export const mapGameMarketOrderStatus = (externalStatus: string): GameMarketOrderStatusMapping => {
  if (isGameMarketProcessingStatus(externalStatus)) {
    return {
      status: "payment_confirmed",
      actionRequired: true
    };
  }

  if (isGameMarketCompletedStatus(externalStatus)) {
    return {
      status: "completed",
      actionRequired: false
    };
  }

  if (isGameMarketDeliveredStatus(externalStatus)) {
    return {
      status: "delivered",
      actionRequired: false
    };
  }

  return {
    status: "draft",
    actionRequired: false
  };
};

export const shouldApplyGameMarketOrderStatus = (
  currentStatus: OrderStatus,
  mappedStatus: OrderStatus
): boolean =>
  (mappedStatus === "payment_confirmed" && initialSyncMutableOrderStatuses.has(currentStatus)) ||
  (mappedStatus === "delivered" &&
    ["draft", "pending_payment", "payment_confirmed", "awaiting_delivery"].includes(currentStatus)) ||
  (mappedStatus === "completed" && externallyCompletableOrderStatuses.has(currentStatus));

export const getGameMarketProductExternalId = (product: GameMarketProductListItem): string =>
  String(product.id);

export const getGameMarketOrderExternalId = (order: GameMarketOrderListItem): string =>
  String(order.id);

export const buildImportedProductNotes = (product: GameMarketProductListItem): string =>
  [
    "Importado via sync manual GameMarket.",
    `Status externo: ${product.status}.`,
    "Revise custo, estoque e dados operacionais locais antes de usar em entrega."
  ].join(" ");

export const buildImportedOrderNotes = (order: GameMarketOrderListItem): string =>
  [
    "Importado via sync manual GameMarket.",
    `Status externo: ${order.status}.`,
    "Entrega local não conclui o pedido até status externo concluído/liberado ou confirmação manual explícita."
  ].join(" ");
