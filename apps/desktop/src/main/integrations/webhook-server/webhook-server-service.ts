import type {
  WebhookServerConnectionTestResult,
  WebhookServerRevealTokenInput,
  WebhookServerSettingsUpdateInput,
  WebhookServerSettingsView,
  WebhookServerSyncSummary,
  WebhookServerTestEventResult
} from "../../../shared/contracts";
import { eventService } from "../../services/event-service";
import { WebhookServerClient } from "./webhook-server-client";
import { toWebhookServerSafeError } from "./webhook-server-errors";
import { webhookServerPollingService } from "./webhook-server-polling-service";
import { webhookServerSettingsService } from "./webhook-server-settings-service";
import { webhookServerSyncService } from "./webhook-server-sync-service";

export const webhookServerService = {
  getSettings(): WebhookServerSettingsView {
    return webhookServerSettingsService.getSettings();
  },

  updateSettings(
    input: WebhookServerSettingsUpdateInput,
    actorUserId: string | null = null
  ): WebhookServerSettingsView {
    const settings = webhookServerSettingsService.updateSettings(input);
    webhookServerPollingService.refresh();
    eventService.createInternal({
      source: "webhook_server",
      type: "integration.webhook_server.settings_updated",
      severity: "info",
      title: "Configuração Webhook Server atualizada",
      message: "Configuração local do backend em tempo real foi atualizada.",
      actorUserId,
      rawPayload: {
        backendUrl: settings.backendUrl,
        pollingEnabled: settings.pollingEnabled,
        pollingIntervalSeconds: settings.pollingIntervalSeconds,
        tokenChanged: Boolean(input.appSyncToken || input.clearToken)
      }
    });

    return settings;
  },

  revealToken(_input: WebhookServerRevealTokenInput, actorUserId: string | null = null): {
    token: string;
    tokenMasked: string | null;
  } {
    const token = webhookServerSettingsService.revealToken();
    const settings = webhookServerSettingsService.getSettings();
    eventService.createInternal({
      source: "webhook_server",
      type: "integration.webhook_server.token_revealed",
      severity: "warning",
      title: "App Sync Token revelado",
      message: "Token do Webhook Server foi revelado explicitamente por um admin.",
      actorUserId,
      rawPayload: {
        tokenRevealed: true
      }
    });

    return {
      token,
      tokenMasked: settings.tokenMasked
    };
  },

  async testConnection(actorUserId: string | null = null): Promise<WebhookServerConnectionTestResult> {
    const checkedAt = new Date().toISOString();
    const settings = webhookServerSettingsService.getSettings();

    try {
      const token = webhookServerSettingsService.getTokenForRequest();
      if (!token) {
        throw new Error("App Sync Token não configurado.");
      }

      const client = new WebhookServerClient({
        baseUrl: settings.backendUrl,
        appSyncToken: token
      });
      await client.health();
      webhookServerSettingsService.markConnectionResult("connected", null);
      eventService.createInternal({
        source: "webhook_server",
        type: "integration.webhook_server.connection_tested",
        severity: "success",
        title: "Webhook Server validado",
        message: "Teste de conexão com o backend em tempo real concluído.",
        actorUserId,
        rawPayload: {
          endpoint: "GET /health",
          backendUrl: settings.backendUrl
        }
      });

      return {
        ok: true,
        status: "connected",
        checkedAt,
        endpoint: "GET /health",
        safeMessage: "Webhook Server respondeu ao healthcheck."
      };
    } catch (error) {
      const safeError = toWebhookServerSafeError(error);
      webhookServerSettingsService.markConnectionResult("error", safeError.safeMessage);
      eventService.createInternal({
        source: "webhook_server",
        type: "integration.webhook_server.connection_failed",
        severity: "warning",
        title: "Falha no Webhook Server",
        message: safeError.safeMessage,
        actorUserId,
        rawPayload: {
          endpoint: "GET /health",
          error: safeError
        }
      });

      return {
        ok: false,
        status: "error",
        checkedAt,
        endpoint: "GET /health",
        safeMessage: safeError.safeMessage
      };
    }
  },

  async sendTestEvent(actorUserId: string | null = null): Promise<WebhookServerTestEventResult> {
    const settings = webhookServerSettingsService.getSettings();
    const token = webhookServerSettingsService.getTokenForRequest();
    if (!token) {
      throw new Error("App Sync Token não configurado.");
    }

    const client = new WebhookServerClient({
      baseUrl: settings.backendUrl,
      appSyncToken: token
    });
    const result = await client.sendTestEvent("gamemarket.order.sale_confirmed");
    eventService.createInternal({
      source: "webhook_server",
      type: "integration.webhook_server.test_event_sent",
      severity: "info",
      title: "Evento de teste enviado",
      message: "Evento de teste criado no Webhook Server.",
      actorUserId,
      rawPayload: {
        remoteEventId: result.id,
        eventType: result.eventType
      }
    });

    return {
      ok: true,
      ...result
    };
  },

  syncEventsNow(actorUserId: string | null = null): Promise<WebhookServerSyncSummary> {
    return webhookServerSyncService.syncNow(actorUserId);
  },

  getLastSyncSummary(): WebhookServerSyncSummary | null {
    return webhookServerSettingsService.getLastSyncSummary<WebhookServerSyncSummary>();
  }
};
