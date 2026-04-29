import { randomUUID } from "node:crypto";
import { buildCsv } from "../../shared/csv";
import {
  eventTypeValues,
  type CsvExportResult,
  type EventCreateManualInput,
  type EventListInput,
  type EventListResult,
  type EventRecord,
  type EventSeverity,
  type EventSource,
  type EventType
} from "../../shared/contracts";
import { eventRepository, type EventWriteRecord } from "../repositories/event-repository";
import { notificationService } from "./notification-service";

const nowIso = (): string => new Date().toISOString();

const sensitiveKeyPattern = /(password|senha|token|secret|chave|key|login|credential)/i;

const sanitizeRawPayload = (payload: unknown): string | null => {
  if (payload === undefined || payload === null || payload === "") {
    return null;
  }

  if (typeof payload === "string") {
    return payload.length > 4000 ? `${payload.slice(0, 4000)}...` : payload;
  }

  try {
    const serialized = JSON.stringify(
      payload,
      (key, value: unknown) => (sensitiveKeyPattern.test(key) ? "[mascarado]" : value),
      2
    );

    return serialized.length > 4000 ? `${serialized.slice(0, 4000)}...` : serialized;
  } catch {
    return null;
  }
};

const makeEventCode = (type: EventType): string =>
  `EVT-${type.replaceAll(".", "-").toUpperCase()}-${randomUUID().slice(0, 8).toUpperCase()}`;

interface InternalEventInput {
  source?: EventSource;
  type: EventType;
  severity?: EventSeverity;
  title: string;
  message?: string | null;
  orderId?: string | null;
  productId?: string | null;
  inventoryItemId?: string | null;
  actorUserId?: string | null;
  rawPayload?: unknown;
  createdAt?: string;
}

const makeWriteRecord = (input: InternalEventInput): EventWriteRecord => ({
  id: randomUUID(),
  eventCode: makeEventCode(input.type),
  source: input.source ?? "system",
  type: input.type,
  severity: input.severity ?? "info",
  title: input.title,
  message: input.message ?? null,
  orderId: input.orderId ?? null,
  productId: input.productId ?? null,
  inventoryItemId: input.inventoryItemId ?? null,
  actorUserId: input.actorUserId ?? null,
  readAt: null,
  rawPayload: sanitizeRawPayload(input.rawPayload),
  createdAt: input.createdAt ?? nowIso()
});

export const eventService = {
  list(filters: EventListInput): EventListResult {
    return {
      items: eventRepository.list(filters),
      summary: eventRepository.getSummary(),
      types: [...eventTypeValues]
    };
  },

  get(id: string): EventRecord {
    const event = eventRepository.getById(id);
    if (!event) {
      throw new Error("Evento não encontrado.");
    }

    return event;
  },

  createInternal(input: InternalEventInput): EventRecord {
    const event = eventRepository.insert(makeWriteRecord(input));
    notificationService.notifyEvent(event);
    return event;
  },

  createManual(input: EventCreateManualInput, actorUserId: string | null = null): EventRecord {
    return this.createInternal({
      source: "manual",
      type: input.type,
      severity: input.severity,
      title: input.title,
      message: input.message ?? null,
      orderId: input.orderId ?? null,
      productId: input.productId ?? null,
      inventoryItemId: input.inventoryItemId ?? null,
      actorUserId,
      rawPayload: input.rawPayload
    });
  },

  markRead(id: string): EventRecord {
    return eventRepository.markRead(id, nowIso());
  },

  markAllRead(): { updated: number } {
    return {
      updated: eventRepository.markAllRead(nowIso())
    };
  },

  listByOrderId(orderId: string): EventRecord[] {
    return eventRepository.listByOrderId(orderId);
  },

  exportCsv(filters: EventListInput): CsvExportResult {
    const rows = eventRepository.list(filters);
    const content = buildCsv(rows, [
      { header: "ID", value: (row) => row.id },
      { header: "Código", value: (row) => row.eventCode },
      { header: "Origem", value: (row) => row.source },
      { header: "Tipo interno", value: (row) => row.type },
      { header: "Severidade", value: (row) => row.severity },
      { header: "Título", value: (row) => row.title },
      { header: "Mensagem", value: (row) => row.message },
      { header: "Pedido", value: (row) => row.orderCode ?? row.orderId },
      { header: "Produto", value: (row) => row.productName ?? row.productId },
      { header: "Item estoque", value: (row) => row.inventoryCode ?? row.inventoryItemId },
      { header: "Lido em", value: (row) => row.readAt },
      { header: "Criado em", value: (row) => row.createdAt }
    ]);

    return {
      filename: "hzdk-events.csv",
      content
    };
  }
};
