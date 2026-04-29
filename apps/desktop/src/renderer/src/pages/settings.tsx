import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Database,
  Edit3,
  Eye,
  FileText,
  KeyRound,
  Link2,
  LockKeyhole,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  UserPlus,
  Volume2
} from "lucide-react";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import type {
  EventType,
  GameMarketEnvironment,
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

const gameMarketStatusLabel: Record<GameMarketSettingsView["connectionStatus"], string> = {
  not_configured: "Não configurado",
  configured: "Configurado",
  docs_missing: "Documentação ausente",
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

  if (status === "configured" || status === "connecting" || status === "syncing") {
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

export const SettingsPage = (): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
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
      const [loadedGameMarketSettings, syncSummary] = await Promise.all([
        api.gamemarket.getSettings(),
        api.gamemarket.getLastSyncSummary()
      ]);
      const [loadedWebhookServerSettings, webhookSyncSummary] = await Promise.all([
        api.webhookServer.getSettings(),
        api.webhookServer.getLastSyncSummary()
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
      setWebhookServerSettings(loadedWebhookServerSettings);
      setWebhookServerForm({
        backendUrl: loadedWebhookServerSettings.backendUrl,
        pollingEnabled: loadedWebhookServerSettings.pollingEnabled,
        pollingIntervalSeconds: loadedWebhookServerSettings.pollingIntervalSeconds
      });
      setWebhookServerSyncSummary(webhookSyncSummary);
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
      const event = await api.events.createManual({
        type: "system.notification_test",
        severity: "info",
        title: "Teste de notificação local",
        message: "Notificação desktop ou fallback visual funcionando.",
        orderId: null,
        productId: null,
        inventoryItemId: null
      });
      setNotificationResult(`Evento ${event.eventCode} criado`);
    } catch (testError) {
      setNotificationResult(testError instanceof Error ? testError.message : "Falha ao enviar teste.");
    }
  };

  const refreshGameMarketSettings = async (): Promise<void> => {
    const [loadedGameMarketSettings, syncSummary] = await Promise.all([
      api.gamemarket.getSettings(),
      api.gamemarket.getLastSyncSummary()
    ]);
    setGameMarketSettings(loadedGameMarketSettings);
    setLastSyncSummary(syncSummary);
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

  const gameMarketCanCallApi =
    gameMarketSettings?.documentation.status === "available" && Boolean(gameMarketSettings.hasToken);
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

  return (
    <div className="grid gap-6 pb-10 xl:grid-cols-2">
      {error && <div className="xl:col-span-2 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

      <Card className="xl:col-span-2">
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

      <Card>
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

      <Card>
        <CardHeader>
          <CardTitle>GameMarket API</CardTitle>
          <Badge tone={gameMarketStatusTone(gameMarketStatus)}>
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
                {gameMarketSettings?.documentation.message ?? "Carregando documentação."}
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

      <Card>
        <CardHeader>
          <CardTitle>Webhook Server / Tempo Real</CardTitle>
          <Badge tone={webhookServerStatusTone(webhookServerStatus)}>
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

      <Card className="xl:col-span-2">
        <CardHeader className="items-start">
          <div>
            <CardTitle>Notificações</CardTitle>
            <div className="mt-1 text-sm text-slate-400">Desktop local com fallback visual dentro do app.</div>
          </div>
          <Button variant="primary" onClick={() => void testNotification()}>
            <BellRing size={16} />
            Enviar teste
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <button
              className="focus-ring flex items-center justify-between rounded-lg border border-line bg-panelSoft p-4 text-left"
              type="button"
              onClick={() => settings && void updateSettings({ desktopEnabled: !settings.desktopEnabled })}
            >
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <BellRing size={16} className="text-cyan" />
                  Desktop
                </div>
                <div className="mt-1 text-xs text-slate-500">Ativar notificações do sistema</div>
              </div>
              <Badge tone={settings?.desktopEnabled ? "success" : "neutral"}>
                {settings?.desktopEnabled ? "ativo" : "off"}
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
                  Som
                </div>
                <div className="mt-1 text-xs text-slate-500">Controla o modo silencioso</div>
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

      {userForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6">
          <div className="w-full max-w-2xl rounded-lg border border-line bg-background shadow-premium">
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
          <div className="w-full max-w-md rounded-lg border border-line bg-background shadow-premium">
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
