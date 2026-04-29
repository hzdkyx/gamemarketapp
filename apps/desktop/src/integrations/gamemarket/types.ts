export type GameMarketRawPayload = unknown;

export interface GameMarketIntegrationStatus {
  configured: boolean;
  documentationLoaded: boolean;
  reason: string;
}

export const gameMarketIntegrationStatus: GameMarketIntegrationStatus = {
  configured: true,
  documentationLoaded: true,
  reason: "Runtime integration lives in apps/desktop/src/main/integrations/gamemarket."
};
