import { createHash } from "node:crypto";
import type { ProductStatus } from "../../../shared/contracts";
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
    "O status externo foi armazenado sem automação de entrega nesta fase."
  ].join(" ");
