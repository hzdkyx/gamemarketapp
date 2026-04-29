import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BellRing,
  Database,
  Edit3,
  FileText,
  KeyRound,
  LockKeyhole,
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
  NotificationSettings,
  UserRecord,
  UserRole,
  UserStatus
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
  "system.notification_test": "Teste de notificação"
};

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

export const SettingsPage = (): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null);
  const [appMeta, setAppMeta] = useState<AppMeta | null>(null);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
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
      setDatabaseStatus(dbStatus);
      setAppMeta(meta);
      setSettings(notificationSettings);
      setUsers(userList);
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

  return (
    <div className="grid gap-6 xl:grid-cols-2">
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
          <div className="overflow-hidden rounded-lg border border-line">
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
          <CardTitle>Integração GameMarket</CardTitle>
          <Badge tone="warning">Fase futura</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <FileText size={16} className="text-amber-300" />
              Documentação oficial
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              Arquivos oficiais permanecem em <span className="font-mono text-slate-200">docs/gamemarket-api/</span>.
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Server size={16} className="text-purple" />
              Backend público
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              <span className="font-mono text-slate-200">apps/webhook-server/</span> segue preparado, sem webhooks reais nesta fase.
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <LockKeyhole size={16} className="text-cyan" />
              Secrets locais
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-400">
              Pedidos e eventos não exportam senhas nem payloads com chaves sem mascaramento.
            </div>
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
