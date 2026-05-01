import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Cloud,
  Database,
  DownloadCloud,
  Edit3,
  Eye,
  FileText,
  KeyRound,
  Link2,
  LockKeyhole,
  Pause,
  Play,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  UploadCloud,
  UserPlus,
  UsersRound,
  Volume2,
  type LucideIcon
} from "lucide-react";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import { playSaleAlertSound } from "@renderer/lib/notification-sound";
import type {
  EventType,
  CloudSyncAutoSyncStatus,
  CloudRole,
  CloudSyncSettingsView,
  CloudSyncSummary,
  CloudWorkspaceMemberView,
  GameMarketEnvironment,
  GameMarketPollingStatus,
  GameMarketSettingsView,
  GameMarketSyncSummary,
  NotificationSettings,
  UserRecord,
  UserRole,
  UserStatus,
  WebhookServerSettingsView,
  WebhookServerSyncSummary
} from "../../../shared/contracts";
import { eventTypeValues } from "../../../shared/contracts";
import {
  CLOUD_SYNC_INTERVAL_OPTIONS_SECONDS,
  CLOUD_SYNC_MIN_INTERVAL_SECONDS,
  normalizeCloudSyncIntervalSeconds
} from "../../../shared/cloud-sync-intervals";

interface DatabaseStatus {
  path: string;
  connected: boolean;
  appliedMigrations: string[];
}

interface AppMeta {
  name: string;
  version: string;
  platform: string;
}

const eventLabels: Record<EventType, string> = {
  "order.created": "Pedido criado",
  "order.payment_confirmed": "Pagamento confirmado",
  "order.awaiting_delivery": "Aguardando entrega",
  "order.delivered": "Pedido entregue",
  "order.completed": "Pedido concluído",
  "order.status_corrected": "Status de pedido corrigido",
  "order.cancelled": "Pedido cancelado",
  "order.refunded": "Pedido reembolsado",
  "order.mediation": "Mediação",
  "order.problem": "Problema",
  "inventory.reserved": "Estoque reservado",
  "inventory.released": "Estoque liberado",
  "inventory.sold": "Estoque vendido",
  "inventory.delivered": "Estoque entregue",
  "inventory.problem": "Estoque com problema",
  "product.low_stock": "Estoque baixo",
  "product.out_of_stock": "Produto sem estoque",
  "security.secret_revealed": "Segredo revelado",
  "integration.gamemarket.settings_updated": "Configuração GameMarket atualizada",
  "integration.gamemarket.connection_tested": "Conexão GameMarket testada",
  "integration.gamemarket.connection_failed": "Conexão GameMarket falhou",
  "integration.gamemarket.token_revealed": "Token GameMarket revelado",
  "integration.gamemarket.sync_started": "Sync GameMarket iniciada",
  "integration.gamemarket.sync_completed": "Sync GameMarket concluída",
  "integration.gamemarket.sync_failed": "Sync GameMarket falhou",
  "integration.gamemarket.order_imported": "Pedido GameMarket importado",
  "integration.gamemarket.order_updated": "Pedido GameMarket atualizado",
  "integration.gamemarket.product_imported": "Produto GameMarket importado",
  "integration.gamemarket.product_updated": "Produto GameMarket atualizado",
  "integration.webhook_server.settings_updated": "Configuração Webhook Server atualizada",
  "integration.webhook_server.connection_tested": "Conexão Webhook Server testada",
  "integration.webhook_server.connection_failed": "Conexão Webhook Server falhou",
  "integration.webhook_server.token_revealed": "Token Webhook Server revelado",
  "integration.webhook_server.sync_started": "Sync Webhook Server iniciada",
  "integration.webhook_server.sync_completed": "Sync Webhook Server concluída",
  "integration.webhook_server.sync_failed": "Sync Webhook Server falhou",
  "integration.webhook_server.test_event_sent": "Evento de teste Webhook Server",
  "integration.webhook_server.event_imported": "Evento Webhook Server importado",
  "integration.webhook_server.review_received": "Avaliação GameMarket recebida",
  "integration.webhook_server.variant_sold_out": "Variante GameMarket esgotada",
  "integration.webhook_server.unknown_event": "Evento GameMarket desconhecido",
  "system.notification_test": "Teste de notificação"
};

interface GameMarketFormState {
  apiBaseUrl: string;
  integrationName: string;
  environment: GameMarketEnvironment;
}

interface WebhookServerFormState {
  backendUrl: string;
  pollingEnabled: boolean;
  pollingIntervalSeconds: number;
}

interface CloudSyncFormState {
  backendUrl: string;
  mode: "local" | "cloud";
  workspaceId: string;
  autoSyncEnabled: boolean;
  syncIntervalSeconds: number;
}

interface CloudLoginFormState {
  identifier: string;
  password: string;
}

interface CloudOwnerFormState {
  name: string;
  email: string;
  username: string;
  password: string;
  workspaceName: string;
}

interface CloudInviteFormState {
  name: string;
  email: string;
  username: string;
  password: string;
  role: Exclude<CloudRole, "owner">;
}

interface UserFormState {
  id: string | null;
  name: string;
  username: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
  status: UserStatus;
  allowRevealSecrets: boolean;
  mustChangePassword: boolean;
}

const emptyUserForm: UserFormState = {
  id: null,
  name: "",
  username: "",
  password: "",
  confirmPassword: "",
  role: "operator",
  status: "active",
  allowRevealSecrets: false,
  mustChangePassword: true
};

const roleLabels: Record<UserRole, string> = {
  admin: "Admin",
  operator: "Operador",
  viewer: "Visualizador"
};

const statusLabels: Record<UserStatus, string> = {
  active: "Ativo",
  disabled: "Desativado"
};

const userToForm = (user: UserRecord): UserFormState => ({
  id: user.id,
  name: user.name,
  username: user.username,
  password: "",
  confirmPassword: "",
  role: user.role,
  status: user.status,
  allowRevealSecrets: user.allowRevealSecrets,
  mustChangePassword: user.mustChangePassword
});

const isUserLocked = (user: UserRecord): boolean =>
  Boolean(user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now());

const formatDateTime = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleString("pt-BR") : "-";

const isHttpUrl = (value: string | null | undefined): boolean => {
  if (!value?.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

const cloudSyncPresetValues = [...CLOUD_SYNC_INTERVAL_OPTIONS_SECONDS];

const formatRelativeSyncTime = (value: string | null | undefined): string => {
  if (!value) {
    return "-";
  }

  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) {
    return `há ${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  return `há ${minutes}min`;
};

const cloudRuntimeStatusLabel: Record<CloudSyncAutoSyncStatus["status"], string> = {
  idle: "Aguardando",
  scheduled: "Sincronização agendada",
  checking: "Verificando alterações",
  pushing: "Enviando alterações",
  pulling: "Baixando alterações",
  synced: "Sincronizado agora",
  failed: "Erro de sync",
  paused: "Sync pausado",
  disabled: "Sync automático desativado",
  not_configured: "Sem sessão cloud"
};

type LocalNotificationToggleKey =
  | "notifyNewSale"
  | "notifyMediationProblem"
  | "notifyOrderDelivered"
  | "notifyOrderCompleted";

const localNotificationToggles: Array<{ key: LocalNotificationToggleKey; label: string }> = [
  { key: "notifyNewSale", label: "Notificar nova venda" },
  { key: "notifyMediationProblem", label: "Notificar mediação/problema" },
  { key: "notifyOrderDelivered", label: "Notificar pedido entregue" },
  { key: "notifyOrderCompleted", label: "Notificar pedido concluído/liberado" }
];

const gameMarketStatusLabel: Record<GameMarketSettingsView["connectionStatus"], string> = {
  not_configured: "Não configurado",
  configured: "Configurado",
  docs_missing: "Configurado",
  connecting: "Conectando",
  connected: "Conectado",
  error: "Erro",
  syncing: "Sincronizando",
  synced: "Sincronizado",
  partial: "Sync parcial",
  unavailable: "API indisponível"
};

const gameMarketStatusTone = (status: GameMarketSettingsView["connectionStatus"]): "success" | "warning" | "danger" | "cyan" | "neutral" => {
  if (status === "connected" || status === "synced") {
    return "success";
  }

  if (status === "error" || status === "unavailable") {
    return "danger";
  }

  if (status === "configured" || status === "docs_missing" || status === "connecting" || status === "syncing") {
    return "cyan";
  }

  if (status === "not_configured") {
    return "neutral";
  }

  return "warning";
};

const webhookServerStatusLabel: Record<WebhookServerSettingsView["connectionStatus"], string> = {
  not_configured: "Não configurado",
  configured: "Configurado",
  connecting: "Conectando",
  connected: "Conectado",
  error: "Erro",
  syncing: "Sincronizando",
  synced: "Sincronizado",
  partial: "Sync parcial",
  unavailable: "Indisponível"
};

const webhookServerStatusTone = (
  status: WebhookServerSettingsView["connectionStatus"]
): "success" | "warning" | "danger" | "cyan" | "neutral" => {
  if (status === "connected" || status === "synced") {
    return "success";
  }

  if (status === "error" || status === "unavailable") {
    return "danger";
  }

  if (status === "configured" || status === "connecting" || status === "syncing") {
    return "cyan";
  }

  if (status === "not_configured") {
    return "neutral";
  }

  return "warning";
};

const cloudRoleLabels: Record<CloudRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
  viewer: "Viewer"
};

const cloudStatusLabel: Record<CloudSyncSettingsView["connectionStatus"], string> = {
  not_configured: "Não configurado",
  configured: "Configurado",
  auth_required: "Login necessário",
  connected: "Conectado",
  syncing: "Sincronizando",
  synced: "Sincronizado",
  partial: "Sync parcial",
  conflict: "Conflito",
  error: "Erro",
  unavailable: "Indisponível"
};

const cloudStatusTone = (
  status: CloudSyncSettingsView["connectionStatus"]
): "success" | "warning" | "danger" | "cyan" | "neutral" => {
  if (status === "connected" || status === "synced") {
    return "success";
  }
  if (status === "error" || status === "unavailable") {
    return "danger";
  }
  if (status === "conflict" || status === "partial") {
    return "warning";
  }
  if (status === "syncing" || status === "configured") {
    return "cyan";
  }
  return "neutral";
};

type SettingsSectionId = "users" | "cloud" | "system" | "gamemarket" | "webhook" | "notifications";

const settingsSections: Array<{ id: SettingsSectionId; panelId: string; label: string; icon: LucideIcon }> = [
  { id: "users", panelId: "settings-users", label: "Usuários e Acesso", icon: UsersRound },
  { id: "cloud", panelId: "settings-cloud", label: "Conta e Sync", icon: Cloud },
  { id: "system", panelId: "settings-system", label: "Sistema", icon: Database },
  { id: "gamemarket", panelId: "settings-gamemarket", label: "GameMarket API", icon: ShieldCheck },
  { id: "webhook", panelId: "settings-webhook", label: "Webhook Server", icon: Server },
  { id: "notifications", panelId: "settings-notifications", label: "Notificações", icon: BellRing }
];

export const SettingsPage = (): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>("users");
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null);
  const [appMeta, setAppMeta] = useState<AppMeta | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [gameMarketSettings, setGameMarketSettings] = useState<GameMarketSettingsView | null>(null);
  const [gameMarketForm, setGameMarketForm] = useState<GameMarketFormState>({
    apiBaseUrl: "https://gamemarket.com.br",
    integrationName: "HzdKyx Desktop",
    environment: "production"
  });
  const [gameMarketToken, setGameMarketToken] = useState("");
  const [gameMarketBusy, setGameMarketBusy] = useState<"saving" | "testing" | "syncing" | "revealing" | null>(null);
  const [gameMarketResult, setGameMarketResult] = useState("");
  const [revealedGameMarketToken, setRevealedGameMarketToken] = useState<string | null>(null);
  const [lastSyncSummary, setLastSyncSummary] = useState<GameMarketSyncSummary | null>(null);
  const [gameMarketPollingStatus, setGameMarketPollingStatus] = useState<GameMarketPollingStatus | null>(null);
  const [webhookServerSettings, setWebhookServerSettings] = useState<WebhookServerSettingsView | null>(null);
  const [webhookServerForm, setWebhookServerForm] = useState<WebhookServerFormState>({
    backendUrl: "http://localhost:3001",
    pollingEnabled: false,
    pollingIntervalSeconds: 60
  });
  const [webhookServerToken, setWebhookServerToken] = useState("");
  const [webhookServerBusy, setWebhookServerBusy] = useState<
    "saving" | "testing" | "syncing" | "revealing" | "sendingTest" | null
  >(null);
  const [webhookServerResult, setWebhookServerResult] = useState("");
  const [revealedWebhookServerToken, setRevealedWebhookServerToken] = useState<string | null>(null);
  const [webhookServerSyncSummary, setWebhookServerSyncSummary] = useState<WebhookServerSyncSummary | null>(null);
  const [cloudSyncSettings, setCloudSyncSettings] = useState<CloudSyncSettingsView | null>(null);
  const [cloudSyncForm, setCloudSyncForm] = useState<CloudSyncFormState>({
    backendUrl: "http://localhost:3001",
    mode: "local",
    workspaceId: "",
    autoSyncEnabled: false,
    syncIntervalSeconds: 30
  });
  const [cloudSyncCustomInterval, setCloudSyncCustomInterval] = useState(false);
  const [cloudAutoSyncStatus, setCloudAutoSyncStatus] = useState<CloudSyncAutoSyncStatus | null>(null);
  const [cloudLoginForm, setCloudLoginForm] = useState<CloudLoginFormState>({
    identifier: "",
    password: ""
  });
  const [cloudOwnerForm, setCloudOwnerForm] = useState<CloudOwnerFormState>({
    name: "",
    email: "",
    username: "",
    password: "",
    workspaceName: "HzdKyx GameMarket"
  });
  const [cloudInviteForm, setCloudInviteForm] = useState<CloudInviteFormState>({
    name: "",
    email: "",
    username: "",
    password: "",
    role: "manager"
  });
  const [cloudMembers, setCloudMembers] = useState<CloudWorkspaceMemberView[]>([]);
  const [cloudBusy, setCloudBusy] = useState<
    | "saving"
    | "testing"
    | "login"
    | "owner"
    | "syncing"
    | "publishing"
    | "downloading"
    | "inviting"
    | "pausing"
    | "resuming"
    | null
  >(null);
  const [cloudResult, setCloudResult] = useState("");
  const [cloudSyncSummary, setCloudSyncSummary] = useState<CloudSyncSummary | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [userForm, setUserForm] = useState<UserFormState | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<UserRecord | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [savingUser, setSavingUser] = useState(false);
  const [notificationResult, setNotificationResult] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const [dbStatus, meta, notificationSettings, userList] = await Promise.all([
        api.getDatabaseStatus(),
        api.getAppMeta(),
        api.settings.getNotificationSettings(),
        api.users.list()
      ]);
      const [loadedGameMarketSettings, syncSummary, pollingStatus] = await Promise.all([
        api.gamemarket.getSettings(),
        api.gamemarket.getLastSyncSummary(),
        api.gamemarket.getPollingStatus()
      ]);
      const [loadedWebhookServerSettings, webhookSyncSummary] = await Promise.all([
        api.webhookServer.getSettings(),
        api.webhookServer.getLastSyncSummary()
      ]);
      const [loadedCloudSyncSettings, loadedCloudSyncSummary, loadedCloudAutoSyncStatus] = await Promise.all([
        api.cloudSync.getSettings(),
        api.cloudSync.getLastSyncSummary(),
        api.cloudSync.getAutoSyncStatus()
      ]);
      setDatabaseStatus(dbStatus);
      setAppMeta(meta);
      setSettings(notificationSettings);
      setUsers(userList);
      setGameMarketSettings(loadedGameMarketSettings);
      setGameMarketForm({
        apiBaseUrl: loadedGameMarketSettings.apiBaseUrl,
        integrationName: loadedGameMarketSettings.integrationName,
        environment: loadedGameMarketSettings.environment
      });
      setLastSyncSummary(syncSummary);
      setGameMarketPollingStatus(pollingStatus);
      setWebhookServerSettings(loadedWebhookServerSettings);
      setWebhookServerForm({
        backendUrl: loadedWebhookServerSettings.backendUrl,
        pollingEnabled: loadedWebhookServerSettings.pollingEnabled,
        pollingIntervalSeconds: loadedWebhookServerSettings.pollingIntervalSeconds
      });
      setWebhookServerSyncSummary(webhookSyncSummary);
      setCloudSyncSettings(loadedCloudSyncSettings);
      setCloudSyncForm({
        backendUrl: loadedCloudSyncSettings.backendUrl,
        mode: loadedCloudSyncSettings.mode,
        workspaceId: loadedCloudSyncSettings.workspaceId ?? "",
        autoSyncEnabled: loadedCloudSyncSettings.autoSyncEnabled,
        syncIntervalSeconds: loadedCloudSyncSettings.syncIntervalSeconds
      });
      setCloudSyncSummary(loadedCloudSyncSummary);
      setCloudAutoSyncStatus(loadedCloudAutoSyncStatus);
      setCloudSyncCustomInterval(!cloudSyncPresetValues.includes(loadedCloudSyncSettings.syncIntervalSeconds as 10 | 30 | 60 | 300));
      if (loadedCloudSyncSettings.workspaceRole === "owner" || loadedCloudSyncSettings.workspaceRole === "admin") {
        try {
          setCloudMembers(await api.cloudSync.listMembers());
        } catch {
          setCloudMembers([]);
        }
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar configurações.");
    }
  }, [api]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSettings();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSettings]);

  const updateSettings = async (next: Partial<NotificationSettings>): Promise<void> => {
    const updated = await api.settings.updateNotificationSettings(next);
    setSettings(updated);
    try {
      setGameMarketPollingStatus(await api.gamemarket.getPollingStatus());
    } catch {
      setGameMarketPollingStatus((currentValue) => currentValue);
    }
  };

  const toggleEvent = async (type: EventType): Promise<void> => {
    if (!settings) {
      return;
    }

    await updateSettings({
      enabledEventTypes: {
        [type]: !(settings.enabledEventTypes[type] ?? false)
      }
    });
  };

  const testNotification = async (): Promise<void> => {
    try {
      const result = await api.appNotifications.testNotification();
      setNotificationResult(result.shown ? "Notificação enviada." : result.reason ?? "Fallback visual enviado.");
    } catch (testError) {
      setNotificationResult(testError instanceof Error ? testError.message : "Falha ao enviar teste.");
    }
  };

  const testSound = async (): Promise<void> => {
    const result = await playSaleAlertSound(settings?.soundVolume ?? 0.7);
    setNotificationResult(result.message);
  };

  const pollGameMarketNow = async (): Promise<void> => {
    setGameMarketBusy("syncing");
    setGameMarketResult("Verificando GameMarket...");
    setError(null);

    try {
      const status = await api.gamemarket.pollNow();
      setGameMarketPollingStatus(status);
      setGameMarketResult(status.lastResult ?? "Verificação concluída.");
      await refreshGameMarketSettings();
    } catch (pollError) {
      setGameMarketResult(pollError instanceof Error ? pollError.message : "Falha ao verificar GameMarket.");
    } finally {
      setGameMarketBusy(null);
    }
  };

  const refreshGameMarketSettings = async (): Promise<void> => {
    const [loadedGameMarketSettings, syncSummary, pollingStatus] = await Promise.all([
      api.gamemarket.getSettings(),
      api.gamemarket.getLastSyncSummary(),
      api.gamemarket.getPollingStatus()
    ]);
    setGameMarketSettings(loadedGameMarketSettings);
    setLastSyncSummary(syncSummary);
    setGameMarketPollingStatus(pollingStatus);
  };

  const saveGameMarketSettings = async (): Promise<void> => {
    setGameMarketBusy("saving");
    setGameMarketResult("");
    setError(null);

    try {
      const updated = await api.gamemarket.updateSettings({
        apiBaseUrl: gameMarketForm.apiBaseUrl,
        integrationName: gameMarketForm.integrationName,
        environment: gameMarketForm.environment,
        ...(gameMarketToken.trim() ? { token: gameMarketToken.trim() } : {})
      });
      setGameMarketSettings(updated);
      setGameMarketToken("");
      setRevealedGameMarketToken(null);
      setGameMarketResult("Configuração salva.");
    } catch (saveError) {
      setGameMarketResult(saveError instanceof Error ? saveError.message : "Falha ao salvar integração.");
    } finally {
      setGameMarketBusy(null);
    }
  };

  const testGameMarketConnection = async (): Promise<void> => {
    setGameMarketBusy("testing");
    setGameMarketResult("Testando conexão...");
    setError(null);

    try {
      const result = await api.gamemarket.testConnection();
      setGameMarketResult(result.safeMessage);
      await refreshGameMarketSettings();
    } catch (testError) {
      setGameMarketResult(testError instanceof Error ? testError.message : "Falha ao testar conexão.");
    } finally {
      setGameMarketBusy(null);
    }
  };

  const syncGameMarketNow = async (): Promise<void> => {
    setGameMarketBusy("syncing");
    setGameMarketResult("Sincronizando...");
    setError(null);

    try {
      const summary = await api.gamemarket.syncNow();
      setLastSyncSummary(summary);
      setGameMarketResult(
        summary.status === "failed"
          ? summary.errors[0] ?? "Sync falhou."
          : `${summary.productsFound} produto(s) e ${summary.ordersFound} pedido(s) lidos.`
      );
      await refreshGameMarketSettings();
    } catch (syncError) {
      setGameMarketResult(syncError instanceof Error ? syncError.message : "Falha ao sincronizar.");
    } finally {
      setGameMarketBusy(null);
    }
  };

  const revealGameMarketToken = async (): Promise<void> => {
    const confirmed = window.confirm("Revelar o token da GameMarket nesta tela?");
    if (!confirmed) {
      return;
    }

    setGameMarketBusy("revealing");
    setGameMarketResult("");

    try {
      const result = await api.gamemarket.revealToken({ confirm: true });
      setRevealedGameMarketToken(result.token);
      setGameMarketResult("Token revelado nesta sessão.");
      await refreshGameMarketSettings();
    } catch (revealError) {
      setGameMarketResult(revealError instanceof Error ? revealError.message : "Falha ao revelar token.");
    } finally {
      setGameMarketBusy(null);
    }
  };

  const refreshWebhookServerSettings = async (): Promise<void> => {
    const [loadedWebhookServerSettings, syncSummary] = await Promise.all([
      api.webhookServer.getSettings(),
      api.webhookServer.getLastSyncSummary()
    ]);
    setWebhookServerSettings(loadedWebhookServerSettings);
    setWebhookServerSyncSummary(syncSummary);
  };

  const saveWebhookServerSettings = async (): Promise<void> => {
    setWebhookServerBusy("saving");
    setWebhookServerResult("");
    setError(null);

    try {
      const updated = await api.webhookServer.updateSettings({
        backendUrl: webhookServerForm.backendUrl,
        pollingEnabled: webhookServerForm.pollingEnabled,
        pollingIntervalSeconds: webhookServerForm.pollingIntervalSeconds,
        ...(webhookServerToken.trim() ? { appSyncToken: webhookServerToken.trim() } : {})
      });
      setWebhookServerSettings(updated);
      setWebhookServerToken("");
      setRevealedWebhookServerToken(null);
      setWebhookServerResult("Configuração salva.");
    } catch (saveError) {
      setWebhookServerResult(saveError instanceof Error ? saveError.message : "Falha ao salvar Webhook Server.");
    } finally {
      setWebhookServerBusy(null);
    }
  };

  const testWebhookServerConnection = async (): Promise<void> => {
    setWebhookServerBusy("testing");
    setWebhookServerResult("Testando backend...");
    setError(null);

    try {
      const result = await api.webhookServer.testConnection();
      setWebhookServerResult(result.safeMessage);
      await refreshWebhookServerSettings();
    } catch (testError) {
      setWebhookServerResult(testError instanceof Error ? testError.message : "Falha ao testar backend.");
    } finally {
      setWebhookServerBusy(null);
    }
  };

  const sendWebhookServerTestEvent = async (): Promise<void> => {
    setWebhookServerBusy("sendingTest");
    setWebhookServerResult("Criando evento de teste...");
    setError(null);

    try {
      const result = await api.webhookServer.sendTestEvent();
      setWebhookServerResult(`Evento remoto ${result.id} criado.`);
      await refreshWebhookServerSettings();
    } catch (testError) {
      setWebhookServerResult(testError instanceof Error ? testError.message : "Falha ao criar evento de teste.");
    } finally {
      setWebhookServerBusy(null);
    }
  };

  const syncWebhookServerNow = async (): Promise<void> => {
    setWebhookServerBusy("syncing");
    setWebhookServerResult("Buscando eventos...");
    setError(null);

    try {
      const summary = await api.webhookServer.syncEventsNow();
      setWebhookServerSyncSummary(summary);
      setWebhookServerResult(
        summary.status === "failed"
          ? summary.errors[0] ?? "Sync falhou."
          : `${summary.eventsImported} evento(s) importado(s) de ${summary.eventsFound} recebido(s).`
      );
      await refreshWebhookServerSettings();
    } catch (syncError) {
      setWebhookServerResult(syncError instanceof Error ? syncError.message : "Falha ao buscar eventos.");
    } finally {
      setWebhookServerBusy(null);
    }
  };

  const revealWebhookServerToken = async (): Promise<void> => {
    const confirmed = window.confirm("Revelar o App Sync Token nesta tela?");
    if (!confirmed) {
      return;
    }

    setWebhookServerBusy("revealing");
    setWebhookServerResult("");

    try {
      const result = await api.webhookServer.revealToken({ confirm: true });
      setRevealedWebhookServerToken(result.token);
      setWebhookServerResult("Token revelado nesta sessão.");
      await refreshWebhookServerSettings();
    } catch (revealError) {
      setWebhookServerResult(revealError instanceof Error ? revealError.message : "Falha ao revelar token.");
    } finally {
      setWebhookServerBusy(null);
    }
  };

  const refreshCloudSyncSettings = async (): Promise<void> => {
    const [loadedCloudSyncSettings, loadedCloudSummary, loadedCloudAutoSyncStatus] = await Promise.all([
      api.cloudSync.getSettings(),
      api.cloudSync.getLastSyncSummary(),
      api.cloudSync.getAutoSyncStatus()
    ]);
    setCloudSyncSettings(loadedCloudSyncSettings);
    setCloudSyncSummary(loadedCloudSummary);
    setCloudSyncForm({
      backendUrl: loadedCloudSyncSettings.backendUrl,
      mode: loadedCloudSyncSettings.mode,
      workspaceId: loadedCloudSyncSettings.workspaceId ?? "",
      autoSyncEnabled: loadedCloudSyncSettings.autoSyncEnabled,
      syncIntervalSeconds: loadedCloudSyncSettings.syncIntervalSeconds
    });
    setCloudAutoSyncStatus(loadedCloudAutoSyncStatus);
    setCloudSyncCustomInterval(!cloudSyncPresetValues.includes(loadedCloudSyncSettings.syncIntervalSeconds as 10 | 30 | 60 | 300));

    if (loadedCloudSyncSettings.workspaceRole === "owner" || loadedCloudSyncSettings.workspaceRole === "admin") {
      try {
        setCloudMembers(await api.cloudSync.listMembers());
      } catch {
        setCloudMembers([]);
      }
    } else {
      setCloudMembers([]);
    }
  };

  const saveCloudSyncSettings = async (): Promise<void> => {
    setCloudBusy("saving");
    setCloudResult("");
    setError(null);

    try {
      const updated = await api.cloudSync.updateSettings({
        backendUrl: cloudSyncForm.backendUrl,
        mode: cloudSyncForm.mode,
        workspaceId: cloudSyncForm.workspaceId || null,
        autoSyncEnabled: cloudSyncForm.autoSyncEnabled,
        syncIntervalSeconds: normalizeCloudSyncIntervalSeconds(cloudSyncForm.syncIntervalSeconds)
      });
      setCloudSyncSettings(updated);
      setCloudResult("Configuração cloud salva.");
      await refreshCloudSyncSettings();
    } catch (saveError) {
      setCloudResult(saveError instanceof Error ? saveError.message : "Falha ao salvar sync cloud.");
    } finally {
      setCloudBusy(null);
    }
  };

  const testCloudSyncConnection = async (): Promise<void> => {
    setCloudBusy("testing");
    setCloudResult("Testando backend cloud...");
    setError(null);

    try {
      const result = await api.cloudSync.testConnection();
      setCloudResult(result.safeMessage);
      await refreshCloudSyncSettings();
    } catch (testError) {
      setCloudResult(testError instanceof Error ? testError.message : "Falha ao testar backend cloud.");
    } finally {
      setCloudBusy(null);
    }
  };

  const bootstrapCloudOwner = async (): Promise<void> => {
    setCloudBusy("owner");
    setCloudResult("");
    setError(null);

    try {
      const updated = await api.cloudSync.bootstrapOwner({
        name: cloudOwnerForm.name,
        email: cloudOwnerForm.email || null,
        username: cloudOwnerForm.username || null,
        password: cloudOwnerForm.password,
        workspaceName: cloudOwnerForm.workspaceName
      });
      setCloudSyncSettings(updated);
      setCloudOwnerForm({
        name: "",
        email: "",
        username: "",
        password: "",
        workspaceName: "HzdKyx GameMarket"
      });
      setCloudResult("Owner e workspace criados. Sessão cloud ativa.");
      await refreshCloudSyncSettings();
    } catch (ownerError) {
      setCloudResult(ownerError instanceof Error ? ownerError.message : "Falha ao criar owner cloud.");
    } finally {
      setCloudBusy(null);
    }
  };

  const loginCloud = async (): Promise<void> => {
    setCloudBusy("login");
    setCloudResult("");
    setError(null);

    try {
      const updated = await api.cloudSync.login({
        identifier: cloudLoginForm.identifier,
        password: cloudLoginForm.password
      });
      setCloudLoginForm({ identifier: "", password: "" });
      setCloudSyncSettings(updated);
      setCloudResult("Login cloud concluído.");
      await refreshCloudSyncSettings();
    } catch (loginError) {
      setCloudResult(loginError instanceof Error ? loginError.message : "Falha ao entrar no workspace.");
    } finally {
      setCloudBusy(null);
    }
  };

  const logoutCloud = async (): Promise<void> => {
    setCloudBusy("login");
    setCloudResult("");
    setError(null);

    try {
      const updated = await api.cloudSync.logout();
      setCloudSyncSettings(updated);
      setCloudMembers([]);
      setCloudResult("Sessão cloud encerrada neste desktop.");
      await refreshCloudSyncSettings();
    } catch (logoutError) {
      setCloudResult(logoutError instanceof Error ? logoutError.message : "Falha ao sair da conta cloud.");
    } finally {
      setCloudBusy(null);
    }
  };

  const syncCloudNow = async (): Promise<void> => {
    setCloudBusy("syncing");
    setCloudResult("Sincronizando workspace...");
    setError(null);

    try {
      const summary = await api.cloudSync.syncNow();
      setCloudSyncSummary(summary);
      setCloudResult(
        summary.status === "failed"
          ? summary.errors[0] ?? "Sync cloud falhou."
          : summary.pushed === 0 && summary.pulled === 0 && summary.applied === 0 && summary.conflicts === 0
            ? "Nenhuma alteração pendente. Sincronização concluída."
          : `${summary.pushed} envio(s), ${summary.applied} aplicação(ões), ${summary.conflicts} conflito(s), ${summary.ignored ?? 0} campo(s) seguro(s) ignorado(s).`
      );
      await refreshCloudSyncSettings();
    } catch (syncError) {
      setCloudResult(syncError instanceof Error ? syncError.message : "Falha ao sincronizar workspace.");
    } finally {
      setCloudBusy(null);
    }
  };

  const pauseCloudAutoSync = async (): Promise<void> => {
    setCloudBusy("pausing");
    setCloudResult("");
    setError(null);

    try {
      const status = await api.cloudSync.pauseAutoSync();
      setCloudAutoSyncStatus(status);
      setCloudResult("Sync automático pausado.");
      await refreshCloudSyncSettings();
    } catch (pauseError) {
      setCloudResult(pauseError instanceof Error ? pauseError.message : "Falha ao pausar sync.");
    } finally {
      setCloudBusy(null);
    }
  };

  const resumeCloudAutoSync = async (): Promise<void> => {
    setCloudBusy("resuming");
    setCloudResult("");
    setError(null);

    try {
      const status = await api.cloudSync.resumeAutoSync();
      setCloudAutoSyncStatus(status);
      setCloudResult("Sync automático retomado.");
      await refreshCloudSyncSettings();
    } catch (resumeError) {
      setCloudResult(resumeError instanceof Error ? resumeError.message : "Falha ao retomar sync.");
    } finally {
      setCloudBusy(null);
    }
  };

  const publishLocalData = async (): Promise<void> => {
    const confirmed = window.confirm(
      "Enviar os dados locais seguros deste desktop para o workspace cloud atual? Segredos protegidos não serão enviados."
    );
    if (!confirmed) {
      return;
    }

    setCloudBusy("publishing");
    setCloudResult("Enviando dados locais seguros...");
    setError(null);

    try {
      const summary = await api.cloudSync.publishLocalData();
      setCloudSyncSummary(summary);
      setCloudResult(
        summary.status === "failed"
          ? summary.errors[0] ?? "Upload inicial falhou."
          : `Dados locais enviados com sucesso: ${summary.pushed} entidades. Coletadas: ${summary.collected ?? summary.pushed}. Ignoradas por segurança: ${summary.ignored ?? 0}.`
      );
      await refreshCloudSyncSettings();
    } catch (publishError) {
      setCloudResult(publishError instanceof Error ? publishError.message : "Falha no upload inicial.");
    } finally {
      setCloudBusy(null);
    }
  };

  const downloadCloudWorkspace = async (): Promise<void> => {
    const confirmed = window.confirm(
      "Baixar os dados do workspace cloud para este desktop? Conflitos locais serão registrados antes de aplicar last-write-wins."
    );
    if (!confirmed) {
      return;
    }

    setCloudBusy("downloading");
    setCloudResult("Baixando workspace...");
    setError(null);

    try {
      const summary = await api.cloudSync.downloadWorkspace();
      setCloudSyncSummary(summary);
      setCloudResult(
        summary.status === "failed"
          ? summary.errors[0] ?? "Download do workspace falhou."
          : `${summary.applied} registro(s) aplicado(s) neste desktop.`
      );
      await refreshCloudSyncSettings();
    } catch (downloadError) {
      setCloudResult(downloadError instanceof Error ? downloadError.message : "Falha ao baixar workspace.");
    } finally {
      setCloudBusy(null);
    }
  };

  const inviteCloudUser = async (): Promise<void> => {
    setCloudBusy("inviting");
    setCloudResult("");
    setError(null);

    try {
      await api.cloudSync.inviteUser({
        name: cloudInviteForm.name,
        email: cloudInviteForm.email || null,
        username: cloudInviteForm.username || null,
        password: cloudInviteForm.password,
        role: cloudInviteForm.role
      });
      setCloudInviteForm({
        name: "",
        email: "",
        username: "",
        password: "",
        role: "manager"
      });
      setCloudResult("Usuário cloud criado no workspace.");
      await refreshCloudSyncSettings();
    } catch (inviteError) {
      setCloudResult(inviteError instanceof Error ? inviteError.message : "Falha ao criar usuário cloud.");
    } finally {
      setCloudBusy(null);
    }
  };

  const openNewUser = (): void => {
    setUserForm(emptyUserForm);
  };

  const saveUser = async (): Promise<void> => {
    if (!userForm) {
      return;
    }

    setSavingUser(true);
    setError(null);

    try {
      if (userForm.id) {
        await api.users.update({
          id: userForm.id,
          data: {
            name: userForm.name,
            username: userForm.username,
            role: userForm.role,
            status: userForm.status,
            allowRevealSecrets: userForm.allowRevealSecrets,
            mustChangePassword: userForm.mustChangePassword
          }
        });
      } else {
        await api.users.create({
          name: userForm.name,
          username: userForm.username,
          password: userForm.password,
          confirmPassword: userForm.confirmPassword,
          role: userForm.role,
          status: userForm.status,
          allowRevealSecrets: userForm.allowRevealSecrets,
          mustChangePassword: userForm.mustChangePassword
        });
      }

      setUserForm(null);
      await loadSettings();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar usuário.");
    } finally {
      setSavingUser(false);
    }
  };

  const updateUserStatus = async (user: UserRecord, status: UserStatus): Promise<void> => {
    try {
      await api.users.update({ id: user.id, data: { status } });
      await loadSettings();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Falha ao atualizar usuário.");
    }
  };

  const forcePasswordChange = async (user: UserRecord): Promise<void> => {
    try {
      await api.users.update({ id: user.id, data: { mustChangePassword: true } });
      await loadSettings();
    } catch (forceError) {
      setError(forceError instanceof Error ? forceError.message : "Falha ao exigir troca de senha.");
    }
  };

  const saveResetPassword = async (): Promise<void> => {
    if (!resetPasswordUser) {
      return;
    }

    setSavingUser(true);
    setError(null);

    try {
      await api.users.resetPassword({
        id: resetPasswordUser.id,
        password: resetPassword,
        confirmPassword: resetConfirmPassword,
        mustChangePassword: true
      });
      setResetPasswordUser(null);
      setResetPassword("");
      setResetConfirmPassword("");
      await loadSettings();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Falha ao resetar senha.");
    } finally {
      setSavingUser(false);
    }
  };

  const gameMarketCanCallApi = Boolean(
    gameMarketSettings?.hasToken && isHttpUrl(gameMarketSettings.apiBaseUrl)
  );
  const gameMarketStatus =
    gameMarketBusy === "testing"
      ? "connecting"
      : gameMarketBusy === "syncing"
        ? "syncing"
        : gameMarketSettings?.connectionStatus ?? "not_configured";
  const webhookServerCanCallApi = Boolean(webhookServerSettings?.backendUrl && webhookServerSettings.hasToken);
  const webhookServerStatus =
    webhookServerBusy === "testing"
      ? "connecting"
      : webhookServerBusy === "syncing" || webhookServerBusy === "sendingTest"
        ? "syncing"
        : webhookServerSettings?.connectionStatus ?? "not_configured";
  const cloudStatus =
    cloudBusy === "syncing" || cloudBusy === "publishing" || cloudBusy === "downloading" || cloudBusy === "testing"
      ? "syncing"
      : cloudSyncSettings?.connectionStatus ?? "not_configured";
  const cloudRuntimeMessage =
    cloudAutoSyncStatus?.lastResult ||
    (cloudSyncSettings?.lastSyncAt
      ? `Sincronizado ${formatRelativeSyncTime(cloudSyncSettings.lastSyncAt)}`
      : "Sem sincronização automática registrada.");
  const cloudRuntimeLabel = cloudAutoSyncStatus
    ? cloudRuntimeStatusLabel[cloudAutoSyncStatus.status]
    : cloudStatusLabel[cloudStatus];
  const cloudIntervalPreset = cloudSyncCustomInterval
    ? "custom"
    : cloudSyncPresetValues.includes(cloudSyncForm.syncIntervalSeconds as 10 | 30 | 60 | 300)
      ? String(cloudSyncForm.syncIntervalSeconds)
      : "custom";
  const cloudCanUseWorkspace = Boolean(
    cloudSyncSettings?.hasSession && (cloudSyncForm.workspaceId || cloudSyncSettings?.workspaceId)
  );
  const cloudCanManageUsers =
    cloudSyncSettings?.workspaceRole === "owner" || cloudSyncSettings?.workspaceRole === "admin";

  return (
    <div className="space-y-6">
      <nav className="sticky top-0 z-20 rounded-lg border border-line/80 bg-background/[0.86] p-2 shadow-premium backdrop-blur">
        <div className="flex flex-wrap gap-2">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSettingsSection === section.id;
            return (
              <Button
                key={section.id}
                type="button"
                size="sm"
                variant={isActive ? "primary" : "secondary"}
                aria-controls={section.panelId}
                aria-pressed={isActive}
                onClick={() => setActiveSettingsSection(section.id)}
                className={isActive ? "shadow-glowCyan" : "text-slate-300"}
              >
                <Icon size={14} />
                {section.label}
              </Button>
            );
          })}
        </div>
      </nav>

      <div className="grid gap-6 pb-10 xl:grid-cols-2">
      {error && <div className="xl:col-span-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

      {activeSettingsSection === "users" && (
      <Card id="settings-users" className="scroll-mt-28 xl:col-span-2">
        <CardHeader className="items-start">
          <div>
            <CardTitle>Usuários e Acesso</CardTitle>
            <div className="mt-1 text-sm text-slate-400">Gerencie contas locais, papéis e permissões operacionais.</div>
          </div>
          <Button variant="primary" onClick={openNewUser}>
            <UserPlus size={16} />
            Novo usuário
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-panelSoft text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Usuário</th>
                  <th className="px-4 py-3">Papel</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Último login</th>
                  <th className="px-4 py-3">Acesso sensível</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-panel/40">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-900/45">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{user.name}</div>
                      <div className="mt-1 font-mono text-xs text-slate-500">{user.username}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={user.role === "admin" ? "cyan" : user.role === "operator" ? "purple" : "neutral"}>
                        {roleLabels[user.role]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={user.status === "active" ? "success" : "neutral"}>
                          {statusLabels[user.status]}
                        </Badge>
                        {isUserLocked(user) && <Badge tone="warning">bloqueado</Badge>}
                        {user.mustChangePassword && <Badge tone="warning">troca senha</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("pt-BR") : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={user.role === "admin" || user.allowRevealSecrets ? "success" : "neutral"}>
                        {user.role === "admin" || user.allowRevealSecrets ? "permitido" : "bloqueado"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setUserForm(userToForm(user))}>
                          <Edit3 size={14} />
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setResetPasswordUser(user)}>
                          <KeyRound size={14} />
                          Resetar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void forcePasswordChange(user)}>
                          Exigir troca
                        </Button>
                        <Button
                          size="sm"
                          variant={user.status === "active" ? "danger" : "secondary"}
                          onClick={() => void updateUserStatus(user, user.status === "active" ? "disabled" : "active")}
                        >
                          {user.status === "active" ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )}

      {activeSettingsSection === "cloud" && (
      <Card id="settings-cloud" className="scroll-mt-28 xl:col-span-2">
        <CardHeader className="items-start">
          <div>
            <CardTitle>Conta e Sincronização</CardTitle>
            <div className="mt-1 text-sm text-slate-400">Workspace cloud compartilhado para operação em mais de um desktop.</div>
          </div>
          <Badge tone={cloudStatusTone(cloudStatus)} className={cloudBusy ? "status-pulse" : undefined}>
            {cloudStatusLabel[cloudStatus]}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Cloud size={16} className="text-cyan" />
                Status atual
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {cloudRuntimeLabel}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {cloudRuntimeMessage}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="text-sm font-semibold text-white">Conta cloud</div>
              <div className="mt-2 text-sm text-slate-400">
                {cloudSyncSettings?.currentUser?.name ?? "Sem login"}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500">
                {cloudSyncSettings?.currentUser?.email ?? cloudSyncSettings?.currentUser?.username ?? "-"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="text-sm font-semibold text-white">Workspace</div>
              <div className="mt-2 text-sm text-slate-400">
                {cloudSyncSettings?.workspaceName ?? "Nenhum selecionado"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {cloudSyncSettings?.workspaceRole ? cloudRoleLabels[cloudSyncSettings.workspaceRole] : "-"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="text-sm font-semibold text-white">Última sync</div>
              <div className="mt-2 text-sm text-slate-400">{formatDateTime(cloudSyncSettings?.lastSyncAt)}</div>
              <div className="mt-1 text-xs text-slate-500">
                {cloudSyncSettings?.lastSyncAt ? formatRelativeSyncTime(cloudSyncSettings.lastSyncAt) : "Sem registro"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="text-sm font-semibold text-white">Próxima sync</div>
              <div className="mt-2 text-sm text-slate-400">{formatDateTime(cloudAutoSyncStatus?.nextRunAt)}</div>
              <div className="mt-1 text-xs text-slate-500">
                {cloudAutoSyncStatus?.backoffSeconds
                  ? `Backoff ${cloudAutoSyncStatus.backoffSeconds}s`
                  : `${cloudAutoSyncStatus?.intervalSeconds ?? cloudSyncForm.syncIntervalSeconds}s configurado(s)`}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="text-sm font-semibold text-white">Pendências</div>
              <div className="mt-2 text-sm text-slate-400">
                {cloudAutoSyncStatus?.pendingChanges ?? cloudSyncSettings?.pendingChanges ?? 0} alteração(ões)
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {cloudSyncSettings?.conflictCount ?? 0} conflito(s)
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Configuração do workspace</div>
                <div className="mt-1 text-xs text-slate-500">Token de sessão fica criptografado no main process e não é revelado no renderer.</div>
              </div>
              <Badge tone={cloudSyncSettings?.hasSession ? "success" : "neutral"}>
                {cloudSyncSettings?.hasSession ? "sessão ativa" : "sem sessão"}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2 xl:col-span-2">
                <span className="text-xs font-semibold text-slate-400">Backend URL</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={cloudSyncForm.backendUrl}
                  onChange={(event) => setCloudSyncForm({ ...cloudSyncForm, backendUrl: event.target.value })}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Modo</span>
                <select
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={cloudSyncForm.mode}
                  onChange={(event) =>
                    setCloudSyncForm({ ...cloudSyncForm, mode: event.target.value as CloudSyncFormState["mode"] })
                  }
                >
                  <option value="local">local</option>
                  <option value="cloud">cloud</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Intervalo automático</span>
                <select
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={cloudIntervalPreset}
                  onChange={(event) => {
                    if (event.target.value === "custom") {
                      setCloudSyncCustomInterval(true);
                      return;
                    }
                    setCloudSyncCustomInterval(false);
                    setCloudSyncForm({ ...cloudSyncForm, syncIntervalSeconds: Number(event.target.value) });
                  }}
                >
                  <option value="10">10 segundos</option>
                  <option value="30">30 segundos</option>
                  <option value="60">1 minuto</option>
                  <option value="300">5 minutos</option>
                  <option value="custom">personalizado</option>
                </select>
              </label>
              {cloudSyncCustomInterval && (
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">Intervalo customizado em segundos</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    type="number"
                    min={CLOUD_SYNC_MIN_INTERVAL_SECONDS}
                    max={86400}
                    value={cloudSyncForm.syncIntervalSeconds}
                    onChange={(event) =>
                      setCloudSyncForm({
                        ...cloudSyncForm,
                        syncIntervalSeconds: normalizeCloudSyncIntervalSeconds(Number(event.target.value))
                      })
                    }
                  />
                </label>
              )}
              <label className="space-y-2 xl:col-span-2">
                <span className="text-xs font-semibold text-slate-400">Workspace atual</span>
                <select
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={cloudSyncForm.workspaceId}
                  onChange={(event) => setCloudSyncForm({ ...cloudSyncForm, workspaceId: event.target.value })}
                >
                  <option value="">Selecionar após login</option>
                  {cloudSyncSettings?.workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name} ({cloudRoleLabels[workspace.role]})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between rounded-lg border border-line bg-panel p-3 xl:col-span-2">
                <span className="text-sm font-semibold text-white">Ativar sincronização automática</span>
                <input
                  className="h-5 w-5 accent-cyan"
                  type="checkbox"
                  checked={cloudSyncForm.autoSyncEnabled}
                  onChange={(event) =>
                    setCloudSyncForm({ ...cloudSyncForm, autoSyncEnabled: event.target.checked })
                  }
                />
              </label>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="mb-3 text-sm font-semibold text-white">Entrar em workspace existente</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">E-mail ou usuário</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    value={cloudLoginForm.identifier}
                    autoComplete="username"
                    onChange={(event) => setCloudLoginForm({ ...cloudLoginForm, identifier: event.target.value })}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">Senha</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    type="password"
                    value={cloudLoginForm.password}
                    autoComplete="current-password"
                    onChange={(event) => setCloudLoginForm({ ...cloudLoginForm, password: event.target.value })}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" disabled={cloudBusy !== null} onClick={() => void loginCloud()}>
                  <Cloud size={16} />
                  {cloudBusy === "login" ? "Entrando..." : "Entrar"}
                </Button>
                <Button variant="ghost" disabled={cloudBusy !== null || !cloudSyncSettings?.hasSession} onClick={() => void logoutCloud()}>
                  Sair
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="mb-3 text-sm font-semibold text-white">Criar owner e workspace inicial</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">Nome</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    value={cloudOwnerForm.name}
                    onChange={(event) => setCloudOwnerForm({ ...cloudOwnerForm, name: event.target.value })}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">E-mail</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    value={cloudOwnerForm.email}
                    autoComplete="email"
                    onChange={(event) => setCloudOwnerForm({ ...cloudOwnerForm, email: event.target.value })}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">Usuário</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    value={cloudOwnerForm.username}
                    autoComplete="username"
                    onChange={(event) => setCloudOwnerForm({ ...cloudOwnerForm, username: event.target.value })}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">Senha</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    type="password"
                    value={cloudOwnerForm.password}
                    autoComplete="new-password"
                    onChange={(event) => setCloudOwnerForm({ ...cloudOwnerForm, password: event.target.value })}
                  />
                </label>
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-xs font-semibold text-slate-400">Nome do workspace</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    value={cloudOwnerForm.workspaceName}
                    onChange={(event) => setCloudOwnerForm({ ...cloudOwnerForm, workspaceName: event.target.value })}
                  />
                </label>
              </div>
              <div className="mt-3">
                <Button variant="secondary" disabled={cloudBusy !== null} onClick={() => void bootstrapCloudOwner()}>
                  <UsersRound size={16} />
                  {cloudBusy === "owner" ? "Criando..." : "Criar workspace"}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={cloudBusy !== null} onClick={() => void saveCloudSyncSettings()}>
              <Save size={16} />
              {cloudBusy === "saving" ? "Salvando..." : "Salvar configuração"}
            </Button>
            <Button variant="secondary" disabled={cloudBusy !== null} onClick={() => void testCloudSyncConnection()}>
              <Server size={16} />
              {cloudBusy === "testing" ? "Testando..." : "Testar backend"}
            </Button>
            <Button variant="secondary" disabled={cloudBusy !== null || !cloudCanUseWorkspace} onClick={() => void syncCloudNow()}>
              <RefreshCw size={16} />
              {cloudBusy === "syncing" ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
            <Button
              variant="secondary"
              disabled={cloudBusy !== null || !cloudCanUseWorkspace || cloudAutoSyncStatus?.paused === true}
              onClick={() => void pauseCloudAutoSync()}
            >
              <Pause size={16} />
              {cloudBusy === "pausing" ? "Pausando..." : "Pausar sync"}
            </Button>
            <Button
              variant="secondary"
              disabled={cloudBusy !== null || !cloudCanUseWorkspace || cloudAutoSyncStatus?.paused === false}
              onClick={() => void resumeCloudAutoSync()}
            >
              <Play size={16} />
              {cloudBusy === "resuming" ? "Retomando..." : "Retomar sync"}
            </Button>
            <Button variant="secondary" disabled={cloudBusy !== null || !cloudCanUseWorkspace} onClick={() => void downloadCloudWorkspace()}>
              <DownloadCloud size={16} />
              {cloudBusy === "downloading" ? "Baixando..." : "Baixar workspace"}
            </Button>
            <Button variant="secondary" disabled={cloudBusy !== null || !cloudCanUseWorkspace} onClick={() => void publishLocalData()}>
              <UploadCloud size={16} />
              {cloudBusy === "publishing" ? "Enviando..." : "Enviar dados locais"}
            </Button>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <LockKeyhole size={16} className="text-cyan" />
              Último resultado seguro
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              {cloudResult || cloudSyncSettings?.lastError || "Sem erro registrado."}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="text-sm font-semibold text-white">Resumo da última sincronização cloud</div>
            {cloudSyncSummary ? (
              <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2 xl:grid-cols-4">
                <div>Enviados: {cloudSyncSummary.pushed}</div>
                <div>Coletados: {cloudSyncSummary.collected ?? cloudSyncSummary.pushed}</div>
                <div>Baixados: {cloudSyncSummary.pulled}</div>
                <div>Aplicados: {cloudSyncSummary.applied}</div>
                <div>Conflitos: {cloudSyncSummary.conflicts}</div>
                <div>Ignorados segurança: {cloudSyncSummary.ignored ?? 0}</div>
                <div>Duração: {cloudSyncSummary.durationMs} ms</div>
                <div>Status: {cloudSyncSummary.status}</div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-400">Nenhuma sincronização cloud registrada.</div>
            )}
          </div>

          {cloudCanManageUsers && (
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-white">Usuários do workspace</div>
                <Badge tone="cyan">{cloudMembers.length} membro(s)</Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-5">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">Nome</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    value={cloudInviteForm.name}
                    onChange={(event) => setCloudInviteForm({ ...cloudInviteForm, name: event.target.value })}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">E-mail</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    value={cloudInviteForm.email}
                    autoComplete="off"
                    onChange={(event) => setCloudInviteForm({ ...cloudInviteForm, email: event.target.value })}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">Usuário</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    value={cloudInviteForm.username}
                    autoComplete="off"
                    onChange={(event) => setCloudInviteForm({ ...cloudInviteForm, username: event.target.value })}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">Senha inicial</span>
                  <input
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    type="password"
                    value={cloudInviteForm.password}
                    autoComplete="new-password"
                    onChange={(event) => setCloudInviteForm({ ...cloudInviteForm, password: event.target.value })}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-400">Papel</span>
                  <select
                    className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                    value={cloudInviteForm.role}
                    onChange={(event) =>
                      setCloudInviteForm({
                        ...cloudInviteForm,
                        role: event.target.value as Exclude<CloudRole, "owner">
                      })
                    }
                  >
                    <option value="admin">admin</option>
                    <option value="manager">manager</option>
                    <option value="operator">operator</option>
                    <option value="viewer">viewer</option>
                  </select>
                </label>
              </div>
              <div className="mt-3">
                <Button variant="primary" disabled={cloudBusy !== null} onClick={() => void inviteCloudUser()}>
                  <UserPlus size={16} />
                  {cloudBusy === "inviting" ? "Criando..." : "Criar colaborador"}
                </Button>
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-panel text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Usuário</th>
                      <th className="px-4 py-3">Papel</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Criado em</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-panel/40">
                    {cloudMembers.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-900/45">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white">{member.name}</div>
                          <div className="mt-1 font-mono text-xs text-slate-500">
                            {member.email ?? member.username ?? member.id}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {member.role === "owner" ? (
                            <Badge tone="cyan">owner</Badge>
                          ) : (
                            <select
                              className="focus-ring h-9 rounded-md border border-line bg-panel px-2 text-xs text-white"
                              value={member.role}
                              disabled={cloudBusy !== null}
                              onChange={(event) =>
                                void api.cloudSync
                                  .updateMember({
                                    userId: member.id,
                                    role: event.target.value as Exclude<CloudRole, "owner">,
                                    status: member.status
                                  })
                                  .then(refreshCloudSyncSettings)
                                  .catch((updateError: unknown) =>
                                    setCloudResult(
                                      updateError instanceof Error
                                        ? updateError.message
                                        : "Falha ao atualizar membro."
                                    )
                                  )
                              }
                            >
                              <option value="admin">admin</option>
                              <option value="manager">manager</option>
                              <option value="operator">operator</option>
                              <option value="viewer">viewer</option>
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {member.role === "owner" ? (
                            <Badge tone={member.status === "active" ? "success" : "neutral"}>{member.status}</Badge>
                          ) : (
                            <select
                              className="focus-ring h-9 rounded-md border border-line bg-panel px-2 text-xs text-white"
                              value={member.status}
                              disabled={cloudBusy !== null}
                              onChange={(event) =>
                                void api.cloudSync
                                  .updateMember({
                                    userId: member.id,
                                    role: member.role as Exclude<CloudRole, "owner">,
                                    status: event.target.value as "active" | "disabled"
                                  })
                                  .then(refreshCloudSyncSettings)
                                  .catch((updateError: unknown) =>
                                    setCloudResult(
                                      updateError instanceof Error
                                        ? updateError.message
                                        : "Falha ao atualizar membro."
                                    )
                                  )
                              }
                            >
                              <option value="active">active</option>
                              <option value="disabled">disabled</option>
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{formatDateTime(member.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {activeSettingsSection === "system" && (
      <Card id="settings-system" className="scroll-mt-28 xl:col-span-2">
        <CardHeader>
          <CardTitle>Sistema</CardTitle>
          <Badge tone={databaseStatus?.connected ? "success" : "warning"}>
            {databaseStatus?.connected ? "SQLite ativo" : "Carregando"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Database size={16} className="text-cyan" />
                Banco local
              </div>
              <div className="mt-2 break-all font-mono text-xs text-slate-500">
                {databaseStatus?.path ?? "Inicializando"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck size={16} className="text-emerald-300" />
                App
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-400">
                {appMeta?.name ?? "HzdKyx GameMarket Manager"} v{appMeta?.version ?? "0.1.0"} em{" "}
                {appMeta?.platform ?? "Windows"}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="text-sm font-semibold text-white">Migrations aplicadas</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {databaseStatus?.appliedMigrations.map((migration) => (
                <Badge key={migration} tone="cyan">
                  {migration}
                </Badge>
              )) ?? <Badge>aguardando</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {activeSettingsSection === "gamemarket" && (
      <Card id="settings-gamemarket" className="scroll-mt-28 xl:col-span-2">
        <CardHeader>
          <CardTitle>GameMarket API</CardTitle>
          <Badge tone={gameMarketStatusTone(gameMarketStatus)} className={gameMarketBusy ? "status-pulse" : undefined}>
            {gameMarketStatusLabel[gameMarketStatus]}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Link2 size={16} className="text-cyan" />
                Status da conexão
              </div>
              <div className="mt-2 text-sm text-slate-400">{gameMarketStatusLabel[gameMarketStatus]}</div>
              <div className="mt-2 font-mono text-xs text-slate-500">
                {gameMarketSettings?.tokenMasked ?? "token não salvo"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <FileText size={16} className="text-amber-300" />
                Documentação
              </div>
              <div className="mt-2 text-sm text-slate-400">
                {gameMarketCanCallApi && gameMarketSettings?.documentation.status !== "available"
                  ? "GameMarket API configurada; documentação local ausente apenas como aviso."
                  : gameMarketSettings?.documentation.message ?? "Carregando documentação."}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {(gameMarketSettings?.documentation.files.length ?? 0) > 0
                  ? `${gameMarketSettings?.documentation.files.length} arquivo(s) encontrado(s)`
                  : "Nenhum arquivo carregado"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="text-sm font-semibold text-white">Última conexão</div>
              <div className="mt-2 text-sm text-slate-400">
                {formatDateTime(gameMarketSettings?.lastConnectionAt)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="text-sm font-semibold text-white">Última sincronização</div>
              <div className="mt-2 text-sm text-slate-400">
                {formatDateTime(gameMarketSettings?.lastSyncAt)}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Configuração local</div>
                <div className="mt-1 text-xs text-slate-500">
                  Autenticação documentada por header x-api-key. Permissões da chave atual: leitura.
                </div>
              </div>
              <Badge tone={gameMarketSettings?.permissions.read ? "success" : "warning"}>
                {gameMarketSettings?.permissions.read ? "read" : "sem leitura"}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">API Base URL</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={gameMarketForm.apiBaseUrl}
                  onChange={(event) =>
                    setGameMarketForm({ ...gameMarketForm, apiBaseUrl: event.target.value })
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Nome da integração</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={gameMarketForm.integrationName}
                  onChange={(event) =>
                    setGameMarketForm({ ...gameMarketForm, integrationName: event.target.value })
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Ambiente</span>
                <select
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={gameMarketForm.environment}
                  onChange={(event) =>
                    setGameMarketForm({
                      ...gameMarketForm,
                      environment: event.target.value as GameMarketEnvironment
                    })
                  }
                >
                  <option value="production">production</option>
                  <option value="sandbox">sandbox</option>
                  <option value="custom">custom</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">API Key / Token</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  type="password"
                  value={gameMarketToken}
                  placeholder={gameMarketSettings?.tokenMasked ?? "Cole a chave para salvar"}
                  autoComplete="off"
                  onChange={(event) => setGameMarketToken(event.target.value)}
                />
              </label>
            </div>

            {revealedGameMarketToken && (
              <div className="mt-4 rounded-md border border-amber-500/25 bg-amber-500/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                  Token revelado
                </div>
                <input
                  className="mt-2 w-full rounded-md border border-amber-500/25 bg-black/30 px-3 py-2 font-mono text-xs text-amber-100"
                  readOnly
                  value={revealedGameMarketToken}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={gameMarketBusy !== null}
              onClick={() => void saveGameMarketSettings()}
            >
              <Save size={16} />
              {gameMarketBusy === "saving" ? "Salvando..." : "Salvar configuração"}
            </Button>
            <Button
              variant="secondary"
              disabled={gameMarketBusy !== null || !gameMarketCanCallApi}
              onClick={() => void testGameMarketConnection()}
            >
              <Server size={16} />
              {gameMarketBusy === "testing" ? "Testando..." : "Testar conexão"}
            </Button>
            <Button
              variant="secondary"
              disabled={gameMarketBusy !== null || !gameMarketCanCallApi}
              onClick={() => void syncGameMarketNow()}
            >
              <RefreshCw size={16} />
              {gameMarketBusy === "syncing" ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
            <Button
              variant="ghost"
              disabled={gameMarketBusy !== null || !gameMarketSettings?.hasToken}
              onClick={() => void revealGameMarketToken()}
            >
              <Eye size={16} />
              Revelar token
            </Button>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <LockKeyhole size={16} className="text-cyan" />
              Último erro seguro
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              {gameMarketResult || gameMarketSettings?.lastError || "Sem erro registrado."}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="text-sm font-semibold text-white">Resumo da última sync</div>
            {lastSyncSummary ? (
              <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                <div>Produtos encontrados: {lastSyncSummary.productsFound}</div>
                <div>Pedidos encontrados: {lastSyncSummary.ordersFound}</div>
                <div>Produtos novos: {lastSyncSummary.productsNew}</div>
                <div>Produtos atualizados: {lastSyncSummary.productsUpdated}</div>
                <div>Pedidos novos: {lastSyncSummary.ordersNew}</div>
                <div>Pedidos atualizados: {lastSyncSummary.ordersUpdated}</div>
                <div>Duração: {lastSyncSummary.durationMs} ms</div>
                <div>Status: {lastSyncSummary.status}</div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-400">Nenhuma sincronização registrada.</div>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {activeSettingsSection === "webhook" && (
      <Card id="settings-webhook" className="scroll-mt-28 xl:col-span-2">
        <CardHeader>
          <CardTitle>Webhook Server / Tempo Real</CardTitle>
          <Badge tone={webhookServerStatusTone(webhookServerStatus)} className={webhookServerBusy ? "status-pulse" : undefined}>
            {webhookServerStatusLabel[webhookServerStatus]}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Server size={16} className="text-cyan" />
                Status da conexão
              </div>
              <div className="mt-2 text-sm text-slate-400">{webhookServerStatusLabel[webhookServerStatus]}</div>
              <div className="mt-2 font-mono text-xs text-slate-500">
                {webhookServerSettings?.tokenMasked ?? "token não salvo"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Link2 size={16} className="text-purple" />
                Backend público
              </div>
              <div className="mt-2 break-all font-mono text-xs text-slate-500">
                {webhookServerSettings?.backendUrl ?? "http://localhost:3001"}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="text-sm font-semibold text-white">Última verificação</div>
              <div className="mt-2 text-sm text-slate-400">
                {formatDateTime(webhookServerSettings?.lastCheckedAt)}
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="text-sm font-semibold text-white">Último evento recebido</div>
              <div className="mt-2 text-sm text-slate-400">
                {formatDateTime(webhookServerSettings?.lastEventReceivedAt)}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Configuração do backend</div>
                <div className="mt-1 text-xs text-slate-500">
                  App desktop busca eventos por Bearer token; webhook público usa segredo na URL do Railway.
                </div>
              </div>
              <Badge tone={webhookServerForm.pollingEnabled ? "success" : "neutral"}>
                {webhookServerForm.pollingEnabled ? "polling ativo" : "polling off"}
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Backend URL</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={webhookServerForm.backendUrl}
                  onChange={(event) =>
                    setWebhookServerForm({ ...webhookServerForm, backendUrl: event.target.value })
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">App Sync Token</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  type="password"
                  value={webhookServerToken}
                  placeholder={webhookServerSettings?.tokenMasked ?? "Cole o token para salvar"}
                  autoComplete="off"
                  onChange={(event) => setWebhookServerToken(event.target.value)}
                />
              </label>
              <label className="flex h-10 items-center justify-between rounded-md border border-line bg-panel px-3">
                <span className="text-xs font-semibold text-slate-400">Polling ativado</span>
                <input
                  className="h-5 w-5 accent-cyan"
                  type="checkbox"
                  checked={webhookServerForm.pollingEnabled}
                  onChange={(event) =>
                    setWebhookServerForm({ ...webhookServerForm, pollingEnabled: event.target.checked })
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Intervalo de polling (segundos)</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  type="number"
                  min={15}
                  max={3600}
                  value={webhookServerForm.pollingIntervalSeconds}
                  onChange={(event) =>
                    setWebhookServerForm({
                      ...webhookServerForm,
                      pollingIntervalSeconds: Number(event.target.value)
                    })
                  }
                />
              </label>
            </div>

            {revealedWebhookServerToken && (
              <div className="mt-4 rounded-md border border-amber-500/25 bg-amber-500/10 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
                  Token revelado
                </div>
                <input
                  className="mt-2 w-full rounded-md border border-amber-500/25 bg-black/30 px-3 py-2 font-mono text-xs text-amber-100"
                  readOnly
                  value={revealedWebhookServerToken}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={webhookServerBusy !== null}
              onClick={() => void saveWebhookServerSettings()}
            >
              <Save size={16} />
              {webhookServerBusy === "saving" ? "Salvando..." : "Salvar configuração"}
            </Button>
            <Button
              variant="secondary"
              disabled={webhookServerBusy !== null || !webhookServerCanCallApi}
              onClick={() => void testWebhookServerConnection()}
            >
              <Server size={16} />
              {webhookServerBusy === "testing" ? "Testando..." : "Testar backend"}
            </Button>
            <Button
              variant="secondary"
              disabled={webhookServerBusy !== null || !webhookServerCanCallApi}
              onClick={() => void sendWebhookServerTestEvent()}
            >
              <BellRing size={16} />
              {webhookServerBusy === "sendingTest" ? "Enviando..." : "Enviar evento de teste"}
            </Button>
            <Button
              variant="secondary"
              disabled={webhookServerBusy !== null || !webhookServerCanCallApi}
              onClick={() => void syncWebhookServerNow()}
            >
              <RefreshCw size={16} />
              {webhookServerBusy === "syncing" ? "Buscando..." : "Buscar eventos agora"}
            </Button>
            <Button
              variant="ghost"
              disabled={webhookServerBusy !== null || !webhookServerSettings?.hasToken}
              onClick={() => void revealWebhookServerToken()}
            >
              <Eye size={16} />
              Revelar token
            </Button>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <LockKeyhole size={16} className="text-cyan" />
              Último erro seguro
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              {webhookServerResult || webhookServerSettings?.lastError || "Sem erro registrado."}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="text-sm font-semibold text-white">Resumo da última busca</div>
            {webhookServerSyncSummary ? (
              <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                <div>Eventos encontrados: {webhookServerSyncSummary.eventsFound}</div>
                <div>Eventos importados: {webhookServerSyncSummary.eventsImported}</div>
                <div>Eventos confirmados: {webhookServerSyncSummary.eventsAcked}</div>
                <div>Duplicados ignorados: {webhookServerSyncSummary.duplicatesSkipped}</div>
                <div>Notificações candidatas: {webhookServerSyncSummary.notificationsTriggered}</div>
                <div>Duração: {webhookServerSyncSummary.durationMs} ms</div>
                <div>Status: {webhookServerSyncSummary.status}</div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-400">Nenhuma busca registrada.</div>
            )}
          </div>
        </CardContent>
      </Card>
      )}

      {activeSettingsSection === "notifications" && (
      <Card id="settings-notifications" className="scroll-mt-28 xl:col-span-2">
        <CardHeader className="items-start">
          <div>
            <CardTitle>Notificações Locais</CardTitle>
            <div className="mt-1 text-sm text-slate-400">Alertas nativos do Windows, toast interno e som de nova venda.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => void testNotification()}>
              <BellRing size={16} />
              Testar notificação
            </Button>
            <Button variant="secondary" onClick={() => void testSound()}>
              <Volume2 size={16} />
              Testar som
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <button
              className="focus-ring flex items-center justify-between rounded-lg border border-line bg-panelSoft p-4 text-left"
              type="button"
              onClick={() =>
                settings &&
                void updateSettings({
                  localNotificationsEnabled: !settings.localNotificationsEnabled
                })
              }
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <BellRing size={16} className="text-cyan" />
                  Ativar notificações locais
                </div>
                <div className="mt-1 text-xs text-slate-500">Ativar notificações do sistema</div>
              </div>
              <Badge tone={settings?.localNotificationsEnabled ? "success" : "neutral"}>
                {settings?.localNotificationsEnabled ? "ativo" : "off"}
              </Badge>
            </button>

            <button
              className="focus-ring flex items-center justify-between rounded-lg border border-line bg-panelSoft p-4 text-left"
              type="button"
              onClick={() => settings && void updateSettings({ soundEnabled: !settings.soundEnabled })}
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Volume2 size={16} className="text-purple" />
                  Tocar som em nova venda
                </div>
                <div className="mt-1 text-xs text-slate-500">Áudio curto emitido pelo renderer</div>
              </div>
              <Badge tone={settings?.soundEnabled ? "success" : "neutral"}>
                {settings?.soundEnabled ? "ativo" : "off"}
              </Badge>
            </button>

            <div className="rounded-lg border border-line bg-panelSoft p-4">
              <div className="text-sm font-semibold text-white">Último teste</div>
              <div className="mt-2 text-xs text-slate-500">{notificationResult || "Sem teste nesta sessão"}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2 rounded-lg border border-line bg-panelSoft p-4">
              <span className="text-xs font-semibold text-slate-400">Volume do som</span>
              <input
                className="w-full accent-cyan"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings?.soundVolume ?? 0.7}
                onChange={(event) => void updateSettings({ soundVolume: Number(event.target.value) })}
              />
              <div className="text-xs text-slate-500">{Math.round((settings?.soundVolume ?? 0.7) * 100)}%</div>
            </label>
            <label className="flex items-center justify-between rounded-lg border border-line bg-panelSoft p-4">
              <span className="text-sm font-semibold text-white">Mostrar mesmo minimizado</span>
              <input
                className="h-5 w-5 accent-cyan"
                type="checkbox"
                checked={settings?.showWhenMinimized ?? true}
                onChange={(event) => void updateSettings({ showWhenMinimized: event.target.checked })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-line bg-panelSoft p-4">
              <span className="text-sm font-semibold text-white">Ativar polling automático</span>
              <input
                className="h-5 w-5 accent-cyan"
                type="checkbox"
                checked={settings?.automaticPollingEnabled ?? true}
                onChange={(event) => void updateSettings({ automaticPollingEnabled: event.target.checked })}
              />
            </label>
            <label className="space-y-2 rounded-lg border border-line bg-panelSoft p-4">
              <span className="text-xs font-semibold text-slate-400">Intervalo de polling em segundos</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="number"
                min={15}
                max={3600}
                value={settings?.pollingIntervalSeconds ?? 60}
                onChange={(event) => void updateSettings({ pollingIntervalSeconds: Number(event.target.value) })}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {localNotificationToggles.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-panelSoft p-3">
                <span className="text-sm font-semibold text-white">{label}</span>
                <input
                  className="h-5 w-5 accent-cyan"
                  type="checkbox"
                  checked={Boolean(settings?.[key])}
                  onChange={(event) =>
                    void updateSettings({ [key]: event.target.checked } as Partial<NotificationSettings>)
                  }
                />
              </label>
            ))}
          </div>

          <div className="grid gap-4 rounded-lg border border-line bg-panelSoft p-4 md:grid-cols-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Polling GameMarket</div>
              <div className="mt-2 text-sm font-semibold text-white">
                {gameMarketPollingStatus?.active ? "Ativo" : "Inativo"}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Última verificação</div>
              <div className="mt-2 text-sm text-slate-300">{formatDateTime(gameMarketPollingStatus?.finishedAt)}</div>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500">Próxima verificação</div>
              <div className="mt-2 text-sm text-slate-300">{formatDateTime(gameMarketPollingStatus?.nextRunAt)}</div>
            </div>
            <div className="flex flex-col justify-between gap-3">
              <div className="text-xs text-slate-500">
                {gameMarketPollingStatus?.lastResult ?? "Sem verificação registrada."}
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={gameMarketBusy !== null || !gameMarketCanCallApi}
                onClick={() => void pollGameMarketNow()}
              >
                <RefreshCw size={14} />
                {gameMarketBusy === "syncing" ? "Verificando..." : "Verificar agora"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {eventTypeValues.map((type) => (
              <label key={type} className="flex items-center justify-between gap-4 rounded-lg border border-line bg-panelSoft p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{eventLabels[type]}</div>
                  <div className="mt-1 truncate font-mono text-xs text-slate-500">{type}</div>
                </div>
                <input
                  className="h-5 w-5 accent-cyan"
                  type="checkbox"
                  checked={settings?.enabledEventTypes[type] ?? false}
                  onChange={() => void toggleEvent(type)}
                />
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
      )}

      </div>

      {userForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6">
          <div className="modal-panel w-full max-w-2xl rounded-lg border border-line bg-background shadow-premium">
            <div className="flex items-center justify-between border-b border-line p-5">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
                  {userForm.id ? "Editar usuário" : "Novo usuário"}
                </div>
                <h2 className="mt-1 text-lg font-bold text-white">Usuário local</h2>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setUserForm(null)}>
                  Cancelar
                </Button>
                <Button variant="primary" disabled={savingUser} onClick={() => void saveUser()}>
                  {savingUser ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Nome</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={userForm.name}
                  onChange={(event) => setUserForm({ ...userForm, name: event.target.value })}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Usuário</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={userForm.username}
                  onChange={(event) => setUserForm({ ...userForm, username: event.target.value })}
                />
              </label>
              {!userForm.id && (
                <>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-slate-400">Senha</span>
                    <input
                      className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                      type="password"
                      value={userForm.password}
                      autoComplete="new-password"
                      onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                    />
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-semibold text-slate-400">Confirmar senha</span>
                    <input
                      className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                      type="password"
                      value={userForm.confirmPassword}
                      autoComplete="new-password"
                      onChange={(event) => setUserForm({ ...userForm, confirmPassword: event.target.value })}
                    />
                  </label>
                </>
              )}
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Papel</span>
                <select
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={userForm.role}
                  onChange={(event) => setUserForm({ ...userForm, role: event.target.value as UserRole })}
                >
                  <option value="admin">Admin</option>
                  <option value="operator">Operador</option>
                  <option value="viewer">Visualizador</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Status</span>
                <select
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={userForm.status}
                  onChange={(event) => setUserForm({ ...userForm, status: event.target.value as UserStatus })}
                >
                  <option value="active">Ativo</option>
                  <option value="disabled">Desativado</option>
                </select>
              </label>
              <label className="flex items-center justify-between rounded-lg border border-line bg-panelSoft p-3">
                <span className="text-sm font-semibold text-white">Permitir revelar dados sensíveis</span>
                <input
                  className="h-5 w-5 accent-cyan"
                  type="checkbox"
                  checked={userForm.allowRevealSecrets}
                  onChange={(event) => setUserForm({ ...userForm, allowRevealSecrets: event.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-line bg-panelSoft p-3">
                <span className="text-sm font-semibold text-white">Forçar troca de senha</span>
                <input
                  className="h-5 w-5 accent-cyan"
                  type="checkbox"
                  checked={userForm.mustChangePassword}
                  onChange={(event) => setUserForm({ ...userForm, mustChangePassword: event.target.checked })}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6">
          <div className="modal-panel w-full max-w-md rounded-lg border border-line bg-background shadow-premium">
            <div className="border-b border-line p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">Resetar senha</div>
              <h2 className="mt-1 text-lg font-bold text-white">{resetPasswordUser.name}</h2>
            </div>
            <div className="space-y-4 p-5">
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-400">Nova senha</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  type="password"
                  value={resetPassword}
                  autoComplete="new-password"
                  onChange={(event) => setResetPassword(event.target.value)}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-slate-400">Confirmar senha</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  type="password"
                  value={resetConfirmPassword}
                  autoComplete="new-password"
                  onChange={(event) => setResetConfirmPassword(event.target.value)}
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setResetPasswordUser(null)}>
                  Cancelar
                </Button>
                <Button variant="primary" disabled={savingUser} onClick={() => void saveResetPassword()}>
                  {savingUser ? "Salvando..." : "Resetar senha"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
