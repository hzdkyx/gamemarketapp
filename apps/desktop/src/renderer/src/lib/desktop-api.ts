import type { HzdKyxDesktopApi } from "../../../preload";

const unavailable = async (): Promise<never> => {
  throw new Error("Electron preload indisponível no preview web.");
};

const fallbackApi: HzdKyxDesktopApi = {
  getAppMeta: async () => ({
    name: "HzdKyx GameMarket Manager",
    version: "0.1.0",
    platform: "win32"
  }),
  getDatabaseStatus: async () => ({
    path: "Electron preload indisponível no preview web.",
    connected: false,
    appliedMigrations: []
  }),
  showNotification: async () => ({
    shown: false,
    reason: "Notificações desktop exigem execução no Electron."
  }),
  notifications: {
    onFallback: () => () => undefined
  },
  auth: {
    getBootstrap: async () => ({
      hasAdmin: true,
      session: null
    }),
    setupAdmin: unavailable,
    login: unavailable,
    logout: async () => ({ loggedOut: true }),
    getSession: async () => null,
    changeOwnPassword: unavailable
  },
  users: {
    list: async () => [],
    create: unavailable,
    update: unavailable,
    resetPassword: unavailable
  },
  products: {
    list: async () => ({
      items: [],
      summary: {
        total: 0,
        active: 0,
        outOfStock: 0,
        lowStock: 0,
        averageEstimatedProfit: 0
      },
      categories: []
    }),
    get: unavailable,
    create: unavailable,
    update: unavailable,
    delete: unavailable,
    exportCsv: async () => ({
      filename: "hzdk-products.csv",
      content: ""
    })
  },
  inventory: {
    list: async () => ({
      items: [],
      summary: {
        available: 0,
        sold: 0,
        problem: 0,
        totalCost: 0,
        potentialProfit: 0
      },
      products: [],
      suppliers: [],
      categories: []
    }),
    get: unavailable,
    create: unavailable,
    update: unavailable,
    delete: unavailable,
    revealSecret: unavailable,
    exportCsv: async () => ({
      filename: "hzdk-inventory.csv",
      content: ""
    })
  },
  orders: {
    list: async () => ({
      items: [],
      summary: {
        total: 0,
        pendingAction: 0,
        problemOrMediation: 0,
        grossRevenue: 0,
        netRevenue: 0,
        estimatedProfit: 0
      },
      products: [],
      inventoryItems: [],
      categories: []
    }),
    get: unavailable,
    create: unavailable,
    update: unavailable,
    delete: unavailable,
    archive: unavailable,
    changeStatus: unavailable,
    linkInventoryItem: unavailable,
    unlinkInventoryItem: unavailable,
    exportCsv: async () => ({
      filename: "hzdk-orders.csv",
      content: ""
    })
  },
  events: {
    list: async () => ({
      items: [],
      summary: {
        total: 0,
        unread: 0,
        critical: 0,
        warnings: 0
      },
      types: []
    }),
    get: unavailable,
    markRead: unavailable,
    markAllRead: async () => ({ updated: 0 }),
    createManual: unavailable,
    exportCsv: async () => ({
      filename: "hzdk-events.csv",
      content: ""
    })
  },
  dashboard: {
    getSummary: async () => ({
      salesToday: 0,
      salesMonth: 0,
      grossRevenueMonth: 0,
      netRevenueMonth: 0,
      estimatedProfitMonth: 0,
      pendingActionOrders: 0,
      problemOrMediationOrders: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0,
      latestEvents: [],
      salesByDay: [],
      profitByCategory: [],
      statusBreakdown: []
    })
  },
  settings: {
    getNotificationSettings: async () => ({
      desktopEnabled: true,
      soundEnabled: false,
      enabledEventTypes: {}
    }),
    updateNotificationSettings: async (payload) => ({
      desktopEnabled: payload.desktopEnabled ?? true,
      soundEnabled: payload.soundEnabled ?? false,
      enabledEventTypes: payload.enabledEventTypes ?? {}
    })
  }
};

export const getDesktopApi = (): HzdKyxDesktopApi => window.hzdk ?? fallbackApi;
