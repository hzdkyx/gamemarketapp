export type GameMarketRawPayload = unknown;

export interface GameMarketIntegrationStatus {
  configured: boolean;
  documentationLoaded: boolean;
  reason: string;
}

export const gameMarketIntegrationStatus: GameMarketIntegrationStatus = {
  configured: false,
  documentationLoaded: false,
  reason: "Official GameMarket API documentation is required before implementation."
};
