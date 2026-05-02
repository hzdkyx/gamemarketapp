import { getSqliteDatabase } from "../../database/database";
import { eventService } from "../../services/event-service";
import { localNotificationService } from "../../services/local-notification-service";
import { auditHistoryService, type AuditFieldDefinition } from "../../services/audit-history-service";
import type {
  EventSeverity,
  EventType,
  WebhookServerEventDetail,
  WebhookServerEventItem,
  WebhookServerSyncSummary
} from "../../../shared/contracts";
import { WebhookServerClient } from "./webhook-server-client";
import { webhookServerSettingsService } from "./webhook-server-settings-service";
import { toWebhookServerSafeError } from "./webhook-server-errors";
import { gameMarketSyncService } from "../gamemarket/gamemarket-sync-service";

interface LocalEventMapping {
  type: EventType;
  severity: EventSeverity;
  title: string;
  message: string;
  actionRequired: boolean;
  notificationCandidate: boolean;
}

interface ExternalReferences {
  orderId: string | null;
  productId: string | null;
}

interface WebhookOrderAuditSnapshot {
  id: string;
  orderCode: string;
  externalOrderId: string | null;
  status: string;
  externalStatus: string | null;
  actionRequired: boolean;
  grossAmount: number;
  netAmount: number;
  profitAmount: number;
  buyerName: string | null;
  productId: string;
  variantId: string | null;
  inventoryItemId: string | null;
  completedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  updatedAt: string;
}

const nowIso = (): string => new Date().toISOString();

const centsToMoney = (value: number | null): number => Math.round(value ?? 0) / 100;

const mappingByRemoteType: Record<string, LocalEventMapping> = {
  "gamemarket.order.sale_confirmed": {
    type: "order.payment_confirmed",
    severity: "success",
    title: "Venda confirmada na GameMarket",
    message: "NOVA VENDA CONFIRMADA NA GAMEMARKET. Acesse o painel e entregue o produto.",
    actionRequired: true,
    notificationCandidate: true
  },
  "gamemarket.mediation.opened": {
    type: "order.mediation",
    severity: "critical",
    title: "Mediação aberta na GameMarket",
    message: "MEDIAÇÃO ABERTA. Acesse a GameMarket e responda o comprador.",
    actionRequired: true,
    notificationCandidate: true
  },
  "gamemarket.financial.refund_started": {
    type: "order.refunded",
    severity: "critical",
    title: "Reembolso iniciado na GameMarket",
    message: "REEMBOLSO INICIADO. Revise o pedido.",
    actionRequired: true,
    notificationCandidate: true
  },
  "gamemarket.order.completed": {
    type: "order.completed",
    severity: "success",
    title: "Pedido concluído na GameMarket",
    message: "PEDIDO CONCLUÍDO NA GAMEMARKET. O pedido pode ser tratado como liberado.",
    actionRequired: false,
    notificationCandidate: true
  },
  "gamemarket.order.delivered": {
    type: "order.delivered",
    severity: "success",
    title: "Pedido entregue na GameMarket",
    message: "PEDIDO ENTREGUE NA GAMEMARKET. Acompanhe a liberação.",
    actionRequired: false,
    notificationCandidate: true
  },
  "gamemarket.financial.funds_released": {
    type: "order.completed",
    severity: "success",
    title: "Fundos liberados na GameMarket",
    message: "FUNDOS LIBERADOS NA GAMEMARKET. O pedido pode ser tratado como concluído.",
    actionRequired: false,
    notificationCandidate: true
  },
  "gamemarket.review.received": {
    type: "integration.webhook_server.review_received",
    severity: "success",
    title: "Avaliação recebida na GameMarket",
    message: "NOVA AVALIAÇÃO RECEBIDA.",
    actionRequired: false,
    notificationCandidate: true
  },
  "gamemarket.product.out_of_stock": {
    type: "product.out_of_stock",
    severity: "warning",
    title: "Produto sem estoque na GameMarket",
    message: "PRODUTO SEM ESTOQUE. Verifique o anúncio.",
    actionRequired: true,
    notificationCandidate: true
  },
  "gamemarket.product.variant_sold_out": {
    type: "integration.webhook_server.variant_sold_out",
    severity: "warning",
    title: "Variante esgotada na GameMarket",
    message: "VARIANTE ESGOTADA. Verifique o anúncio.",
    actionRequired: true,
    notificationCandidate: true
  },
  "gamemarket.unknown": {
    type: "integration.webhook_server.unknown_event",
    severity: "warning",
    title: "Evento GameMarket recebido",
    message: "NOVO EVENTO GAMEMARKET RECEBIDO. Revise os detalhes.",
    actionRequired: true,
    notificationCandidate: true
  }
};

const defaultMapping = (event: WebhookServerEventItem): LocalEventMapping => ({
  type: "integration.webhook_server.event_imported",
  severity: event.severity,
  title: event.title,
  message: event.message,
  actionRequired: false,
  notificationCandidate: false
});

const getMapping = (event: WebhookServerEventItem): LocalEventMapping =>
  mappingByRemoteType[event.eventType] ?? defaultMapping(event);

const getDedupeKey = (event: WebhookServerEventItem): string =>
  event.externalEventId
    ? `external:${event.externalEventId}`
    : `server:${event.id}:${event.payloadHash}:${event.eventType}`;

const hasImported = (dedupeKey: string): boolean =>
  Boolean(
    getSqliteDatabase()
      .prepare("SELECT 1 FROM webhook_server_event_imports WHERE dedupe_key = ?")
      .get(dedupeKey)
  );

const recordImport = (input: {
  dedupeKey: string;
  remoteEvent: WebhookServerEventItem;
  importedEventId: string;
  importedAt: string;
}): void => {
  getSqliteDatabase()
    .prepare(
      `
        INSERT INTO webhook_server_event_imports (
          dedupe_key,
          remote_event_id,
          external_event_id,
          payload_hash,
          event_type,
          imported_event_id,
          imported_at
        )
        VALUES (
          @dedupeKey,
          @remoteEventId,
          @externalEventId,
          @payloadHash,
          @eventType,
          @importedEventId,
          @importedAt
        )
      `
    )
    .run({
      dedupeKey: input.dedupeKey,
      remoteEventId: input.remoteEvent.id,
      externalEventId: input.remoteEvent.externalEventId,
      payloadHash: input.remoteEvent.payloadHash,
      eventType: input.remoteEvent.eventType,
      importedEventId: input.importedEventId,
      importedAt: input.importedAt
    });
};

const findStringByKeys = (value: unknown, keys: Set<string>, depth = 0): string | null => {
  if (!value || typeof value !== "object" || depth > 6) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStringByKeys(item, keys, depth + 1);
      if (found) {
        return found;
      }
    }
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (keys.has(key.toLowerCase()) && (typeof nestedValue === "string" || typeof nestedValue === "number")) {
      const stringValue = String(nestedValue).trim();
      if (stringValue) {
        return stringValue;
      }
    }

    const nestedFound = findStringByKeys(nestedValue, keys, depth + 1);
    if (nestedFound) {
      return nestedFound;
    }
  }

  return null;
};

const getExternalReferences = (detail: WebhookServerEventDetail): ExternalReferences => ({
  orderId: findStringByKeys(
    detail.rawPayloadMasked,
    new Set(["orderid", "order_id", "pedidoid", "pedido_id", "externalorderid", "external_order_id"])
  ),
  productId: findStringByKeys(
    detail.rawPayloadMasked,
    new Set(["productid", "product_id", "produtoid", "produto_id", "externalproductid", "external_product_id"])
  )
});

const findLocalOrderId = (externalOrderId: string | null): string | null => {
  if (!externalOrderId) {
    return null;
  }

  const row = getSqliteDatabase()
    .prepare(
      `
        SELECT id
        FROM orders
        WHERE external_marketplace = 'gamemarket' AND external_order_id = ?
      `
    )
    .get(externalOrderId) as { id: string } | undefined;

  return row?.id ?? null;
};

const findLocalProductId = (externalProductId: string | null): string | null => {
  if (!externalProductId) {
    return null;
  }

  const row = getSqliteDatabase()
    .prepare(
      `
        SELECT id
        FROM products
        WHERE external_marketplace = 'gamemarket' AND external_product_id = ?
      `
    )
    .get(externalProductId) as { id: string } | undefined;

  return row?.id ?? null;
};

const webhookOrderAuditFields: Array<AuditFieldDefinition<WebhookOrderAuditSnapshot>> = [
  { field: "status", label: "Status local", read: (order) => order.status },
  { field: "externalStatus", label: "Status externo GameMarket", read: (order) => order.externalStatus },
  { field: "action", label: "Ação pendente", read: (order) => order.actionRequired },
  { field: "grossAmount", label: "Valor bruto", read: (order) => order.grossAmount },
  { field: "netAmount", label: "Valor líquido", read: (order) => order.netAmount },
  { field: "profitAmount", label: "Lucro snapshot", read: (order) => order.profitAmount },
  { field: "buyerName", label: "Comprador", read: (order) => order.buyerName },
  { field: "productId", label: "Produto vinculado", read: (order) => order.productId },
  { field: "variantId", label: "Variação vinculada", read: (order) => order.variantId },
  { field: "inventoryItemId", label: "Item de estoque", read: (order) => order.inventoryItemId },
  { field: "completedAt", label: "Concluído em", read: (order) => order.completedAt },
  { field: "deliveredAt", label: "Entregue em", read: (order) => order.deliveredAt },
  { field: "notes", label: "Observações", read: (order) => order.notes }
];

const getOrderAuditSnapshot = (orderId: string | null): WebhookOrderAuditSnapshot | null => {
  if (!orderId) {
    return null;
  }

  const row = getSqliteDatabase()
    .prepare(
      `
        SELECT
          id,
          order_code,
          external_order_id,
          status,
          external_status,
          action_required,
          sale_price_cents,
          net_value_cents,
          profit_cents,
          buyer_name,
          product_id,
          product_variant_id,
          inventory_item_id,
          completed_at,
          delivered_at,
          notes,
          updated_at
        FROM orders
        WHERE id = ?
      `
    )
    .get(orderId) as
    | {
        id: string;
        order_code: string;
        external_order_id: string | null;
        status: string;
        external_status: string | null;
        action_required: number;
        sale_price_cents: number | null;
        net_value_cents: number | null;
        profit_cents: number | null;
        buyer_name: string | null;
        product_id: string;
        product_variant_id: string | null;
        inventory_item_id: string | null;
        completed_at: string | null;
        delivered_at: string | null;
        notes: string | null;
        updated_at: string;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    orderCode: row.order_code,
    externalOrderId: row.external_order_id,
    status: row.status,
    externalStatus: row.external_status,
    actionRequired: Boolean(row.action_required),
    grossAmount: centsToMoney(row.sale_price_cents),
    netAmount: centsToMoney(row.net_value_cents),
    profitAmount: centsToMoney(row.profit_cents),
    buyerName: row.buyer_name,
    productId: row.product_id,
    variantId: row.product_variant_id,
    inventoryItemId: row.inventory_item_id,
    completedAt: row.completed_at,
    deliveredAt: row.delivered_at,
    notes: row.notes,
    updatedAt: row.updated_at
  };
};

const recordWebhookOrderAudit = (
  before: WebhookOrderAuditSnapshot | null,
  after: WebhookOrderAuditSnapshot | null,
  input: {
    action: "updated" | "status_changed";
    title: string;
    message: string;
    actorUserId: string | null;
    remoteEvent: WebhookServerEventItem;
  }
): void => {
  if (!after) {
    return;
  }

  auditHistoryService.record({
    entityType: "order",
    entityId: after.id,
    source: "webhook",
    action: input.action,
    title: input.title,
    message: input.message,
    actorUserId: input.actorUserId,
    relatedProductId: after.productId,
    relatedVariantId: after.variantId,
    relatedOrderId: after.id,
    inventoryItemId: after.inventoryItemId,
    createdAt: after.updatedAt,
    changes: [
      ...auditHistoryService.buildChanges(before, after, webhookOrderAuditFields),
      {
        field: "webhookEvent",
        label: "Evento webhook",
        before: null,
        after: input.remoteEvent.eventType,
        sensitive: false
      }
    ]
  });
};

const markOrderActionRequired = (
  orderId: string | null,
  actionRequired: boolean,
  actorUserId: string | null,
  remoteEvent: WebhookServerEventItem
): void => {
  if (!orderId || !actionRequired) {
    return;
  }

  const before = getOrderAuditSnapshot(orderId);
  const timestamp = nowIso();
  getSqliteDatabase()
    .prepare("UPDATE orders SET action_required = 1, updated_at = ? WHERE id = ?")
    .run(timestamp, orderId);
  recordWebhookOrderAudit(before, getOrderAuditSnapshot(orderId), {
    action: "updated",
    title: "Pedido marcado para ação pelo webhook",
    message: "Evento recebido pelo webhook exigiu revisão operacional do pedido.",
    actorUserId,
    remoteEvent
  });
};

const completionRemoteTypes = new Set([
  "gamemarket.order.completed",
  "gamemarket.financial.funds_released"
]);
const saleRemoteTypes = new Set([
  "gamemarket.order.sale_confirmed",
  "gamemarket.order.created"
]);
const deliveredRemoteTypes = new Set(["gamemarket.order.delivered"]);
const problemRemoteTypes = new Set([
  "gamemarket.mediation.opened",
  "gamemarket.mediation.updated",
  "gamemarket.financial.refund_started"
]);

const promoteOrderCompleted = (
  orderId: string | null,
  remoteEvent: WebhookServerEventItem,
  actorUserId: string | null
): void => {
  if (!orderId || !completionRemoteTypes.has(remoteEvent.eventType)) {
    return;
  }

  const timestamp = nowIso();
  const before = getOrderAuditSnapshot(orderId);
  getSqliteDatabase()
    .prepare(
      `
        UPDATE orders
        SET
          status = 'completed',
          action_required = 0,
          completed_at = COALESCE(completed_at, @completedAt),
          updated_by_user_id = @updatedByUserId,
          updated_at = @updatedAt
        WHERE id = @id
          AND status NOT IN ('completed', 'cancelled', 'refunded', 'archived')
      `
    )
    .run({
      id: orderId,
      completedAt: timestamp,
      updatedByUserId: actorUserId,
      updatedAt: timestamp
    });
  recordWebhookOrderAudit(before, getOrderAuditSnapshot(orderId), {
    action: "status_changed",
    title: "Pedido concluído pelo webhook",
    message: "Webhook indicou conclusão/liberação financeira pela GameMarket.",
    actorUserId,
    remoteEvent
  });
};

const makeFailedSummary = (startedAt: string, error: string): WebhookServerSyncSummary => {
  const finishedAt = nowIso();
  return {
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    status: "failed",
    eventsFound: 0,
    eventsImported: 0,
    eventsAcked: 0,
    duplicatesSkipped: 0,
    notificationsTriggered: 0,
    errors: [error]
  };
};

const notifyRemoteOrderEvent = (input: {
  remoteEvent: WebhookServerEventItem;
  importedEventId: string;
  orderId: string | null;
  externalOrderId: string | null;
}): boolean => {
  const { remoteEvent, importedEventId, orderId, externalOrderId } = input;
  const stableOrderRef = externalOrderId ?? orderId ?? remoteEvent.id;

  if (saleRemoteTypes.has(remoteEvent.eventType)) {
    const result = localNotificationService.notify({
      type: "new_sale",
      severity: orderId ? "success" : "warning",
      title: "Nova venda na GameMarket",
      message: [
        `Pedido: ${externalOrderId ?? "não identificado"}`,
        "Produto: sincronização oficial em andamento",
        "Variação: Variação não vinculada",
        "Valor: confirme no pedido importado",
        "Lucro previsto: calcule após vincular variação/custo"
      ].join("\n"),
      orderId,
      externalOrderId,
      eventId: importedEventId,
      dedupeKey: `sale:new:${stableOrderRef}`,
      metadata: {
        remoteEventId: remoteEvent.id,
        eventType: remoteEvent.eventType,
        externalOrderId,
        actionRequired: true
      },
      playSound: true
    });

    return result.created;
  }

  if (deliveredRemoteTypes.has(remoteEvent.eventType)) {
    const result = localNotificationService.notify({
      type: "order_delivered",
      severity: "success",
      title: "Pedido entregue na GameMarket",
      message: `Pedido ${externalOrderId ?? stableOrderRef} foi entregue e aguarda liberação.`,
      orderId,
      externalOrderId,
      eventId: importedEventId,
      dedupeKey: `order:delivered:${orderId ?? stableOrderRef}`,
      metadata: {
        remoteEventId: remoteEvent.id,
        eventType: remoteEvent.eventType,
        externalOrderId
      },
      playSound: false
    });

    return result.created;
  }

  if (completionRemoteTypes.has(remoteEvent.eventType)) {
    const result = localNotificationService.notify({
      type: "order_completed",
      severity: "success",
      title: "Pedido concluído/liberado na GameMarket",
      message: `Pedido ${externalOrderId ?? stableOrderRef} foi concluído ou liberado pela GameMarket.`,
      orderId,
      externalOrderId,
      eventId: importedEventId,
      dedupeKey: `order:completed:${stableOrderRef}`,
      metadata: {
        remoteEventId: remoteEvent.id,
        eventType: remoteEvent.eventType,
        externalOrderId
      },
      playSound: false
    });

    return result.created;
  }

  if (problemRemoteTypes.has(remoteEvent.eventType)) {
    const result = localNotificationService.notify({
      type: "mediation_problem",
      severity: "critical",
      title: remoteEvent.title,
      message: remoteEvent.message,
      orderId,
      externalOrderId,
      eventId: importedEventId,
      dedupeKey: `order:mediation:${stableOrderRef}:${remoteEvent.eventType}`,
      metadata: {
        remoteEventId: remoteEvent.id,
        eventType: remoteEvent.eventType,
        externalOrderId
      },
      playSound: false
    });

    return result.created;
  }

  return false;
};

export const webhookServerSyncService = {
  async syncNow(actorUserId: string | null = null): Promise<WebhookServerSyncSummary> {
    const startedAt = nowIso();
    eventService.createInternal({
      source: "webhook_server",
      type: "integration.webhook_server.sync_started",
      severity: "info",
      title: "Sync Webhook Server iniciada",
      message: "Busca manual de eventos em tempo real iniciada.",
      actorUserId
    });

    try {
      const settings = webhookServerSettingsService.getSettings();
      const token = webhookServerSettingsService.getTokenForRequest();
      if (!token) {
        throw new Error("App Sync Token não configurado.");
      }

      const client = new WebhookServerClient({
        baseUrl: settings.backendUrl,
        appSyncToken: token
      });
      const remoteEvents = await client.listEvents({
        unreadOnly: true,
        limit: 100
      });
      const finishedAt = nowIso();
      const summary: WebhookServerSyncSummary = {
        startedAt,
        finishedAt,
        durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
        status: "synced",
        eventsFound: remoteEvents.length,
        eventsImported: 0,
        eventsAcked: 0,
        duplicatesSkipped: 0,
        notificationsTriggered: 0,
        errors: []
      };

      for (const remoteEvent of remoteEvents) {
        const dedupeKey = getDedupeKey(remoteEvent);
        try {
          if (hasImported(dedupeKey)) {
            summary.duplicatesSkipped += 1;
            await client.ackEvent(remoteEvent.id);
            summary.eventsAcked += 1;
            continue;
          }

          const detail = await client.getEvent(remoteEvent.id);
          const references = getExternalReferences(detail);
          let orderId = findLocalOrderId(references.orderId);
          if (!orderId && references.orderId && saleRemoteTypes.has(remoteEvent.eventType)) {
            await gameMarketSyncService.syncNow(actorUserId, { trigger: "webhook" });
            orderId = findLocalOrderId(references.orderId);
          }
          const productId = findLocalProductId(references.productId);
          const mapping = getMapping(remoteEvent);
          markOrderActionRequired(orderId, mapping.actionRequired, actorUserId, remoteEvent);
          promoteOrderCompleted(orderId, remoteEvent, actorUserId);
          const imported = eventService.createInternal({
            source: "webhook_server",
            type: mapping.type,
            severity: mapping.severity,
            title: mapping.title,
            message: mapping.message,
            orderId,
            productId,
            rawPayload: {
              remoteEventId: remoteEvent.id,
              externalEventId: remoteEvent.externalEventId,
              eventType: remoteEvent.eventType,
              payloadHash: remoteEvent.payloadHash,
              externalReferences: references,
              actionRequired: mapping.actionRequired,
              rawPayloadMasked: detail.rawPayloadMasked
            },
            actorUserId
          });
          recordImport({
            dedupeKey,
            remoteEvent,
            importedEventId: imported.id,
            importedAt: finishedAt
          });
          await client.ackEvent(remoteEvent.id);
          summary.eventsImported += 1;
          summary.eventsAcked += 1;
          if (
            mapping.notificationCandidate &&
            notifyRemoteOrderEvent({
              remoteEvent,
              importedEventId: imported.id,
              orderId,
              externalOrderId: references.orderId
            })
          ) {
            summary.notificationsTriggered += 1;
          }
        } catch (error) {
          summary.errors.push(error instanceof Error ? error.message : "Falha ao importar evento remoto.");
        }
      }

      summary.status = summary.errors.length > 0 ? "partial" : "synced";
      webhookServerSettingsService.saveLastSyncSummary(summary);
      webhookServerSettingsService.markSyncResult(
        summary.status,
        summary.finishedAt,
        remoteEvents.at(-1)?.receivedAt ?? null,
        summary.errors[0] ?? null
      );
      eventService.createInternal({
        source: "webhook_server",
        type: "integration.webhook_server.sync_completed",
        severity: summary.status === "partial" ? "warning" : "success",
        title: summary.status === "partial" ? "Sync Webhook Server parcial" : "Sync Webhook Server concluida",
        message: `${summary.eventsImported} evento(s) importado(s) de ${summary.eventsFound} recebido(s).`,
        actorUserId,
        rawPayload: summary
      });

      return summary;
    } catch (error) {
      const safeError = toWebhookServerSafeError(error);
      const summary = makeFailedSummary(startedAt, safeError.safeMessage);
      webhookServerSettingsService.saveLastSyncSummary(summary);
      webhookServerSettingsService.markSyncResult("error", null, null, safeError.safeMessage);
      eventService.createInternal({
        source: "webhook_server",
        type: "integration.webhook_server.sync_failed",
        severity: "critical",
        title: "Sync Webhook Server falhou",
        message: safeError.safeMessage,
        actorUserId,
        rawPayload: safeError
      });

      return summary;
    }
  }
};
