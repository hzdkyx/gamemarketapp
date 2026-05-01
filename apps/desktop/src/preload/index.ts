import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type {
  CsvExportResult,
  AppNotificationListInput,
  AppNotificationListResult,
  AppNotificationRecord,
  AuthBootstrap,
  AuthChangePasswordInput,
  AuthLoginInput,
  AuthSession,
  AuthSetupAdminInput,
  CloudSyncBootstrapOwnerInput,
  CloudSyncAutoSyncStatus,
  CloudSyncInviteUserInput,
  CloudSyncLoginInput,
  CloudSyncSettingsUpdateInput,
  CloudSyncSettingsView,
  CloudSyncSummary,
  CloudSyncUpdateMemberInput,
  CloudWorkspaceMemberView,
  DashboardSummary,
  EventCreateManualInput,
  EventListInput,
  EventListResult,
  EventRecord,
  GameMarketConnectionTestResult,
  GameMarketPollingStatus,
  GameMarketRevealTokenInput,
  GameMarketSettingsUpdateInput,
  GameMarketSettingsView,
  GameMarketSyncSummary,
  InventoryCreateInput,
  InventoryListInput,
  InventoryListResult,
  InventoryRecord,
  InventoryRevealSecretInput,
  InventoryUpdateInput,
  NotificationSettings,
  NotificationSettingsUpdateInput,
  OrderChangeStatusInput,
  OrderCreateInput,
  OrderDetailResult,
  OrderLinkInventoryItemInput,
  OrderListInput,
  OrderListResult,
  OrderRecord,
  OrderUpdateInput,
  ProfitListInput,
  ProfitListResult,
  ProductCreateInput,
  ProductListInput,
  ProductListResult,
  ProductRecord,
  ProductVariantCreateInput,
  ProductVariantListResult,
  ProductVariantRecord,
  ProductVariantUpdateInput,
  ProductUpdateInput,
  UserCreateInput,
  UserRecord,
  UserResetPasswordInput,
  UserUpdateInput,
  WebhookServerConnectionTestResult,
  WebhookServerRevealTokenInput,
  WebhookServerSettingsUpdateInput,
  WebhookServerSettingsView,
  WebhookServerSyncSummary,
  WebhookServerTestEventResult,
} from "../shared/contracts";

const api = {
  getAppMeta: () =>
    ipcRenderer.invoke("app:get-meta") as Promise<{
      name: string;
      version: string;
      platform: NodeJS.Platform;
    }>,
  getDatabaseStatus: () =>
    ipcRenderer.invoke("database:get-status") as Promise<{
      path: string;
      connected: boolean;
      appliedMigrations: string[];
    }>,
  showNotification: (payload: { title: string; body: string }) =>
    ipcRenderer.invoke("notifications:show", payload) as Promise<{
      shown: boolean;
      reason?: string;
    }>,
  startup: {
    markRendererReady: (name: "login_rendered" | "initial_setup_rendered" | "authenticated_shell_rendered") => {
      ipcRenderer.send("startup:renderer-mark", { name });
    },
  },
  notifications: {
    onCreated: (
      handler: (payload: {
        notification: AppNotificationRecord;
        showToast: boolean;
        playSound: boolean;
        soundVolume: number;
      }) => void,
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: {
          notification: AppNotificationRecord;
          showToast: boolean;
          playSound: boolean;
          soundVolume: number;
        },
      ): void => handler(payload);
      ipcRenderer.on("notifications:created", listener);
      return () => {
        ipcRenderer.removeListener("notifications:created", listener);
      };
    },
    onOpenOrder: (handler: (payload: { orderId: string }) => void) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: { orderId: string },
      ): void => handler(payload);
      ipcRenderer.on("notifications:open-order", listener);
      return () => {
        ipcRenderer.removeListener("notifications:open-order", listener);
      };
    },
    onFallback: (
      handler: (payload: {
        title: string;
        body: string;
        severity?: EventRecord["severity"];
      }) => void,
    ) => {
      const listener = (
        _event: IpcRendererEvent,
        payload: {
          title: string;
          body: string;
          severity?: EventRecord["severity"];
        },
      ): void => handler(payload);
      ipcRenderer.on("notifications:fallback", listener);
      return () => {
        ipcRenderer.removeListener("notifications:fallback", listener);
      };
    },
  },
  appNotifications: {
    list: (payload?: AppNotificationListInput) =>
      ipcRenderer.invoke(
        "appNotifications:list",
        payload,
      ) as Promise<AppNotificationListResult>,
    markRead: (id: string) =>
      ipcRenderer.invoke(
        "appNotifications:markRead",
        { id },
      ) as Promise<AppNotificationRecord>,
    markAllRead: () =>
      ipcRenderer.invoke("appNotifications:markAllRead") as Promise<{
        updated: number;
      }>,
    testNotification: () =>
      ipcRenderer.invoke("appNotifications:testNotification") as Promise<{
        shown: boolean;
        reason?: string;
      }>,
  },
  auth: {
    getBootstrap: () =>
      ipcRenderer.invoke("auth:getBootstrap") as Promise<AuthBootstrap>,
    setupAdmin: (payload: AuthSetupAdminInput) =>
      ipcRenderer.invoke("auth:setupAdmin", payload) as Promise<UserRecord>,
    login: (payload: AuthLoginInput) =>
      ipcRenderer.invoke("auth:login", payload) as Promise<AuthSession>,
    logout: () =>
      ipcRenderer.invoke("auth:logout") as Promise<{ loggedOut: boolean }>,
    getSession: () =>
      ipcRenderer.invoke("auth:getSession") as Promise<AuthSession | null>,
    changeOwnPassword: (payload: AuthChangePasswordInput) =>
      ipcRenderer.invoke(
        "auth:changeOwnPassword",
        payload,
      ) as Promise<AuthSession>,
  },
  users: {
    list: () => ipcRenderer.invoke("users:list") as Promise<UserRecord[]>,
    create: (payload: UserCreateInput) =>
      ipcRenderer.invoke("users:create", payload) as Promise<UserRecord>,
    update: (payload: UserUpdateInput) =>
      ipcRenderer.invoke("users:update", payload) as Promise<UserRecord>,
    resetPassword: (payload: UserResetPasswordInput) =>
      ipcRenderer.invoke("users:resetPassword", payload) as Promise<UserRecord>,
  },
  products: {
    list: (payload?: ProductListInput) =>
      ipcRenderer.invoke(
        "products:list",
        payload,
      ) as Promise<ProductListResult>,
    get: (id: string) =>
      ipcRenderer.invoke("products:get", { id }) as Promise<ProductRecord>,
    create: (payload: ProductCreateInput) =>
      ipcRenderer.invoke("products:create", payload) as Promise<ProductRecord>,
    update: (payload: ProductUpdateInput) =>
      ipcRenderer.invoke("products:update", payload) as Promise<ProductRecord>,
    delete: (id: string) =>
      ipcRenderer.invoke("products:delete", { id }) as Promise<{
        deleted: boolean;
      }>,
    exportCsv: (payload?: ProductListInput) =>
      ipcRenderer.invoke(
        "products:exportCsv",
        payload,
      ) as Promise<CsvExportResult>,
  },
  productVariants: {
    listByProduct: (productId: string) =>
      ipcRenderer.invoke("productVariants:listByProduct", {
        productId,
      }) as Promise<ProductVariantListResult>,
    get: (id: string) =>
      ipcRenderer.invoke("productVariants:get", {
        id,
      }) as Promise<ProductVariantRecord>,
    create: (payload: ProductVariantCreateInput) =>
      ipcRenderer.invoke(
        "productVariants:create",
        payload,
      ) as Promise<ProductVariantRecord>,
    update: (payload: ProductVariantUpdateInput) =>
      ipcRenderer.invoke(
        "productVariants:update",
        payload,
      ) as Promise<ProductVariantRecord>,
    duplicate: (id: string) =>
      ipcRenderer.invoke("productVariants:duplicate", {
        id,
      }) as Promise<ProductVariantRecord>,
    archive: (id: string) =>
      ipcRenderer.invoke("productVariants:archive", {
        id,
      }) as Promise<ProductVariantRecord>,
    markNeedsReview: (id: string) =>
      ipcRenderer.invoke("productVariants:markNeedsReview", {
        id,
      }) as Promise<ProductVariantRecord>,
    delete: (id: string) =>
      ipcRenderer.invoke("productVariants:delete", { id }) as Promise<{
        deleted: boolean;
      }>,
    exportCsv: (productId: string) =>
      ipcRenderer.invoke("productVariants:exportCsv", {
        productId,
      }) as Promise<CsvExportResult>,
  },
  inventory: {
    list: (payload?: InventoryListInput) =>
      ipcRenderer.invoke(
        "inventory:list",
        payload,
      ) as Promise<InventoryListResult>,
    get: (id: string) =>
      ipcRenderer.invoke("inventory:get", { id }) as Promise<InventoryRecord>,
    create: (payload: InventoryCreateInput) =>
      ipcRenderer.invoke(
        "inventory:create",
        payload,
      ) as Promise<InventoryRecord>,
    update: (payload: InventoryUpdateInput) =>
      ipcRenderer.invoke(
        "inventory:update",
        payload,
      ) as Promise<InventoryRecord>,
    delete: (id: string) =>
      ipcRenderer.invoke("inventory:delete", { id }) as Promise<{
        deleted: boolean;
      }>,
    revealSecret: (payload: InventoryRevealSecretInput) =>
      ipcRenderer.invoke("inventory:revealSecret", payload) as Promise<{
        field: InventoryRevealSecretInput["field"];
        value: string;
      }>,
    exportCsv: (payload?: InventoryListInput) =>
      ipcRenderer.invoke(
        "inventory:exportCsv",
        payload,
      ) as Promise<CsvExportResult>,
  },
  orders: {
    list: (payload?: OrderListInput) =>
      ipcRenderer.invoke("orders:list", payload) as Promise<OrderListResult>,
    get: (id: string) =>
      ipcRenderer.invoke("orders:get", { id }) as Promise<OrderDetailResult>,
    create: (payload: OrderCreateInput) =>
      ipcRenderer.invoke("orders:create", payload) as Promise<OrderRecord>,
    update: (payload: OrderUpdateInput) =>
      ipcRenderer.invoke("orders:update", payload) as Promise<OrderRecord>,
    delete: (id: string) =>
      ipcRenderer.invoke("orders:delete", { id }) as Promise<{
        deleted: boolean;
      }>,
    archive: (id: string) =>
      ipcRenderer.invoke("orders:archive", { id }) as Promise<OrderRecord>,
    changeStatus: (payload: OrderChangeStatusInput) =>
      ipcRenderer.invoke(
        "orders:changeStatus",
        payload,
      ) as Promise<OrderRecord>,
    linkInventoryItem: (payload: OrderLinkInventoryItemInput) =>
      ipcRenderer.invoke(
        "orders:linkInventoryItem",
        payload,
      ) as Promise<OrderRecord>,
    unlinkInventoryItem: (orderId: string) =>
      ipcRenderer.invoke("orders:unlinkInventoryItem", {
        orderId,
      }) as Promise<OrderRecord>,
    exportCsv: (payload?: OrderListInput) =>
      ipcRenderer.invoke(
        "orders:exportCsv",
        payload,
      ) as Promise<CsvExportResult>,
  },
  events: {
    list: (payload?: EventListInput) =>
      ipcRenderer.invoke("events:list", payload) as Promise<EventListResult>,
    get: (id: string) =>
      ipcRenderer.invoke("events:get", { id }) as Promise<EventRecord>,
    markRead: (id: string) =>
      ipcRenderer.invoke("events:markRead", { id }) as Promise<EventRecord>,
    markAllRead: () =>
      ipcRenderer.invoke("events:markAllRead") as Promise<{ updated: number }>,
    createManual: (payload: EventCreateManualInput) =>
      ipcRenderer.invoke(
        "events:createManual",
        payload,
      ) as Promise<EventRecord>,
    exportCsv: (payload?: EventListInput) =>
      ipcRenderer.invoke(
        "events:exportCsv",
        payload,
      ) as Promise<CsvExportResult>,
  },
  profit: {
    list: (payload?: ProfitListInput) =>
      ipcRenderer.invoke("profit:list", payload) as Promise<ProfitListResult>,
    exportCsv: (payload?: ProfitListInput) =>
      ipcRenderer.invoke(
        "profit:exportCsv",
        payload,
      ) as Promise<CsvExportResult>,
  },
  dashboard: {
    getSummary: () =>
      ipcRenderer.invoke("dashboard:getSummary") as Promise<DashboardSummary>,
  },
  settings: {
    getNotificationSettings: () =>
      ipcRenderer.invoke(
        "settings:getNotificationSettings",
      ) as Promise<NotificationSettings>,
    updateNotificationSettings: (payload: NotificationSettingsUpdateInput) =>
      ipcRenderer.invoke(
        "settings:updateNotificationSettings",
        payload,
      ) as Promise<NotificationSettings>,
  },
  gamemarket: {
    getSettings: () =>
      ipcRenderer.invoke(
        "gamemarket:getSettings",
      ) as Promise<GameMarketSettingsView>,
    updateSettings: (payload: GameMarketSettingsUpdateInput) =>
      ipcRenderer.invoke(
        "gamemarket:updateSettings",
        payload,
      ) as Promise<GameMarketSettingsView>,
    revealToken: (payload: GameMarketRevealTokenInput) =>
      ipcRenderer.invoke("gamemarket:revealToken", payload) as Promise<{
        token: string;
        tokenMasked: string | null;
      }>,
    testConnection: () =>
      ipcRenderer.invoke(
        "gamemarket:testConnection",
        {},
      ) as Promise<GameMarketConnectionTestResult>,
    syncNow: () =>
      ipcRenderer.invoke(
        "gamemarket:syncNow",
        {},
      ) as Promise<GameMarketSyncSummary>,
    pollNow: () =>
      ipcRenderer.invoke(
        "gamemarket:pollNow",
        {},
      ) as Promise<GameMarketPollingStatus>,
    getPollingStatus: () =>
      ipcRenderer.invoke(
        "gamemarket:getPollingStatus",
        {},
      ) as Promise<GameMarketPollingStatus>,
    getLastSyncSummary: () =>
      ipcRenderer.invoke(
        "gamemarket:getLastSyncSummary",
        {},
      ) as Promise<GameMarketSyncSummary | null>,
  },
  webhookServer: {
    getSettings: () =>
      ipcRenderer.invoke(
        "webhookServer:getSettings",
      ) as Promise<WebhookServerSettingsView>,
    updateSettings: (payload: WebhookServerSettingsUpdateInput) =>
      ipcRenderer.invoke(
        "webhookServer:updateSettings",
        payload,
      ) as Promise<WebhookServerSettingsView>,
    revealToken: (payload: WebhookServerRevealTokenInput) =>
      ipcRenderer.invoke("webhookServer:revealToken", payload) as Promise<{
        token: string;
        tokenMasked: string | null;
      }>,
    testConnection: () =>
      ipcRenderer.invoke(
        "webhookServer:testConnection",
        {},
      ) as Promise<WebhookServerConnectionTestResult>,
    sendTestEvent: () =>
      ipcRenderer.invoke(
        "webhookServer:sendTestEvent",
        {},
      ) as Promise<WebhookServerTestEventResult>,
    syncEventsNow: () =>
      ipcRenderer.invoke(
        "webhookServer:syncEventsNow",
        {},
      ) as Promise<WebhookServerSyncSummary>,
    getLastSyncSummary: () =>
      ipcRenderer.invoke(
        "webhookServer:getLastSyncSummary",
        {},
      ) as Promise<WebhookServerSyncSummary | null>,
  },
  cloudSync: {
    getSettings: () =>
      ipcRenderer.invoke("cloudSync:getSettings") as Promise<CloudSyncSettingsView>,
    updateSettings: (payload: CloudSyncSettingsUpdateInput) =>
      ipcRenderer.invoke("cloudSync:updateSettings", payload) as Promise<CloudSyncSettingsView>,
    testConnection: () =>
      ipcRenderer.invoke("cloudSync:testConnection", {}) as Promise<{
        ok: boolean;
        safeMessage: string;
      }>,
    bootstrapOwner: (payload: CloudSyncBootstrapOwnerInput) =>
      ipcRenderer.invoke("cloudSync:bootstrapOwner", payload) as Promise<CloudSyncSettingsView>,
    login: (payload: CloudSyncLoginInput) =>
      ipcRenderer.invoke("cloudSync:login", payload) as Promise<CloudSyncSettingsView>,
    logout: () =>
      ipcRenderer.invoke("cloudSync:logout", {}) as Promise<CloudSyncSettingsView>,
    refreshAccount: () =>
      ipcRenderer.invoke("cloudSync:refreshAccount", {}) as Promise<CloudSyncSettingsView>,
    listMembers: () =>
      ipcRenderer.invoke("cloudSync:listMembers", {}) as Promise<CloudWorkspaceMemberView[]>,
    inviteUser: (payload: CloudSyncInviteUserInput) =>
      ipcRenderer.invoke("cloudSync:inviteUser", payload) as Promise<CloudWorkspaceMemberView>,
    updateMember: (payload: CloudSyncUpdateMemberInput) =>
      ipcRenderer.invoke("cloudSync:updateMember", payload) as Promise<CloudWorkspaceMemberView>,
    publishLocalData: () =>
      ipcRenderer.invoke("cloudSync:publishLocalData", {}) as Promise<CloudSyncSummary>,
    downloadWorkspace: () =>
      ipcRenderer.invoke("cloudSync:downloadWorkspace", {}) as Promise<CloudSyncSummary>,
    syncNow: () =>
      ipcRenderer.invoke("cloudSync:syncNow", {}) as Promise<CloudSyncSummary>,
    getLastSyncSummary: () =>
      ipcRenderer.invoke("cloudSync:getLastSyncSummary", {}) as Promise<CloudSyncSummary | null>,
    getAutoSyncStatus: () =>
      ipcRenderer.invoke("cloudSync:getAutoSyncStatus", {}) as Promise<CloudSyncAutoSyncStatus>,
    pauseAutoSync: () =>
      ipcRenderer.invoke("cloudSync:pauseAutoSync", {}) as Promise<CloudSyncAutoSyncStatus>,
    resumeAutoSync: () =>
      ipcRenderer.invoke("cloudSync:resumeAutoSync", {}) as Promise<CloudSyncAutoSyncStatus>,
  },
};

contextBridge.exposeInMainWorld("hzdk", api);

export type HzdKyxDesktopApi = typeof api;
