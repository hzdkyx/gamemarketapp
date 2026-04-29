import type { GameMarketOrderListResponse, GameMarketProductListResponse } from "./gamemarket-contracts";

export const gamemarketProductListFixture: GameMarketProductListResponse = {
  success: true,
  data: [
    {
      id: 1,
      title: "Conta Valorant Radiante",
      description: "Conta com todas as skins...",
      price: 15000,
      game: "valorant",
      category: "account",
      featured: true,
      warrantyPeriod: 7,
      listingType: "single",
      isAutoDelivery: false,
      isApproved: true,
      needsApproval: false,
      isActive: true,
      rejectionReason: null,
      status: "ativo",
      createdAt: "2025-01-01T00:00:00Z"
    }
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 1,
    totalPages: 1
  }
};

export const gamemarketOrderListFixture: GameMarketOrderListResponse = {
  success: true,
  data: [
    {
      id: 1,
      productId: 1,
      buyerName: "joao_gamer",
      sellerName: "maria_vendedora",
      price: 15000,
      quantity: 1,
      status: "completed",
      createdAt: "2025-01-05T10:30:00Z"
    }
  ],
  pagination: {
    page: 1,
    limit: 20,
    total: 1,
    totalPages: 1
  }
};
