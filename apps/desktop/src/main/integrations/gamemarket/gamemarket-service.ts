import type {
  GameMarketConnectionTestResult,
  GameMarketRevealTokenInput,
  GameMarketSettingsUpdateInput,
  GameMarketSettingsView,
  GameMarketSyncSummary
} from "../../../shared/contracts";
import { eventService } from "../../services/event-service";
import { GameMarketClient } from "./gamemarket-client";
import { gameMarketSettingsService } from "./gamemarket-settings-service";
import { GameMarketDocsMissingError, toGameMarketSafeError } from "./gamemarket-errors";
import { gameMarketSyncService } from "./gamemarket-sync-service";

const connectionTestEndpoint = "GET /api/v1/games";

export const gameMarketService = {
  getSettings(): GameMarketSettingsView {
    return gameMarketSettingsService.getSettings();
  },

  updateSettings(input: GameMarketSettingsUpdateInput, actorUserId: string | null = null): GameMarketSettingsView {
    const settings = gameMarketSettingsService.updateSettings(input);
    eventService.createInternal({
      source: "gamemarket_api",
      type: "integration.gamemarket.settings_updated",
      severity: "info",
      title: "Configuração GameMarket atualizada",
      message: "Configuração local da API GameMarket foi atualizada.",
      actorUserId,
      rawPayload: {
        apiBaseUrl: settings.apiBaseUrl,
        environment: settings.environment,
        integrationName: settings.integrationName,
        tokenChanged: Boolean(input.token || input.clearToken)
      }
    });

    return settings;
  },

  revealToken(_input: GameMarketRevealTokenInput, actorUserId: string | null = null): {
    token: string;
    tokenMasked: string | null;
  } {
    const token = gameMarketSettingsService.revealToken();
    const settings = gameMarketSettingsService.getSettings();
    eventService.createInternal({
      source: "gamemarket_api",
      type: "integration.gamemarket.token_revealed",
      severity: "warning",
      title: "Token GameMarket revelado",
      message: "Token da API GameMarket foi revelado explicitamente por um admin.",
      actorUserId,
      rawPayload: {
        tokenRevealed: true,
        tokenSource: settings.tokenSource
      }
    });

    return {
      token,
      tokenMasked: settings.tokenMasked
    };
  },

  async testConnection(actorUserId: string | null = null): Promise<GameMarketConnectionTestResult> {
    const checkedAt = new Date().toISOString();
    const settings = gameMarketSettingsService.getSettings();

    try {
      if (settings.documentation.status !== "available") {
        throw new GameMarketDocsMissingError({
          documentationStatus: settings.documentation.status,
          missing: settings.documentation.missing
        });
      }

      const token = gameMarketSettingsService.getTokenForRequest();
      if (!token) {
        throw new Error("Token GameMarket não configurado.");
      }

      const client = new GameMarketClient({
        baseUrl: settings.apiBaseUrl,
        apiKey: token
      });
      await client.listGames();
      gameMarketSettingsService.markConnectionResult("connected", null);
      eventService.createInternal({
        source: "gamemarket_api",
        type: "integration.gamemarket.connection_tested",
        severity: "success",
        title: "Conexão GameMarket validada",
        message: "Teste de conexão com a API GameMarket concluído.",
        actorUserId,
        rawPayload: {
          endpoint: connectionTestEndpoint,
          baseUrl: settings.apiBaseUrl
        }
      });

      return {
        ok: true,
        status: "connected",
        checkedAt,
        endpoint: connectionTestEndpoint,
        safeMessage: "Conexão validada com sucesso."
      };
    } catch (error) {
      const safeError = toGameMarketSafeError(error);
      const status = safeError.code === "GAMEMARKET_DOCS_MISSING" ? "unavailable" : "error";
      gameMarketSettingsService.markConnectionResult(status, safeError.safeMessage);
      eventService.createInternal({
        source: "gamemarket_api",
        type: "integration.gamemarket.connection_failed",
        severity: "warning",
        title: "Falha no teste GameMarket",
        message: safeError.safeMessage,
        actorUserId,
        rawPayload: {
          endpoint: connectionTestEndpoint,
          error: safeError
        }
      });

      return {
        ok: false,
        status,
        checkedAt,
        endpoint: settings.documentation.status === "available" ? connectionTestEndpoint : null,
        safeMessage: safeError.safeMessage
      };
    }
  },

  syncNow(actorUserId: string | null = null): Promise<GameMarketSyncSummary> {
    return gameMarketSyncService.syncNow(actorUserId);
  },

  getLastSyncSummary(): GameMarketSyncSummary | null {
    return gameMarketSettingsService.getLastSyncSummary<GameMarketSyncSummary>();
  }
};
