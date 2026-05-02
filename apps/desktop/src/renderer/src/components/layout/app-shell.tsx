import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BellRing,
  CheckCheck,
  CheckCircle2,
  LogOut,
  PackageOpen,
  UserCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { navItems } from "./nav-items";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { useAuth } from "@renderer/lib/auth-context";
import { BRAND_ASSETS } from "@renderer/lib/branding";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import { playSaleAlertSound } from "@renderer/lib/notification-sound";
import { cn } from "@renderer/lib/utils";
import type {
  AppNotificationListResult,
  AppNotificationRecord,
} from "../../../../shared/contracts";

const titles: Record<string, { title: string; eyebrow: string }> = {
  "/": { title: "Dashboard", eyebrow: "Operação GameMarket" },
  "/products": { title: "Produtos", eyebrow: "Catálogo e precificação" },
  "/inventory": { title: "Estoque", eyebrow: "Contas, fornecedores e status" },
  "/orders": { title: "Pedidos", eyebrow: "Fila operacional" },
  "/events": { title: "Eventos", eyebrow: "Auditoria e notificações" },
  "/profit": {
    title: "Lucro",
    eyebrow: "Análise financeira por produto, variação e margem",
  },
  "/settings": { title: "Configurações", eyebrow: "Sistema e segurança" },
};

export const AppShell = (): JSX.Element => {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const current = titles[location.pathname] ?? titles["/"]!;
  const api = useMemo(() => getDesktopApi(), []);
  const [fallbackNotification, setFallbackNotification] = useState<{
    title: string;
    body: string;
    severity?: "info" | "success" | "warning" | "critical";
  } | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationData, setNotificationData] = useState<AppNotificationListResult>({
    items: [],
    summary: {
      total: 0,
      unread: 0,
      unreadNewSales: 0,
      criticalUnread: 0,
    },
  });
  const [toast, setToast] = useState<AppNotificationRecord | null>(null);

  const visibleNavItems = useMemo(
    () =>
      navItems.filter((item) => {
        if (item.path === "/inventory") {
          return session?.user.role !== "viewer";
        }

        if (item.path === "/settings") {
          return session?.permissions.canManageSettings;
        }

        return true;
      }),
    [session],
  );

  const initials = useMemo(() => {
    const name = session?.user.name ?? "";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "");
  }, [session]);

  useEffect(() => {
    const loadNotifications = async (): Promise<void> => {
      try {
        setNotificationData(await api.appNotifications.list({ limit: 20, unreadOnly: false }));
      } catch {
        setNotificationData((currentValue) => currentValue);
      }
    };

    const unsubscribeCreated = api.notifications.onCreated((payload) => {
      void loadNotifications();
      if (payload.playSound) {
        void playSaleAlertSound(payload.soundVolume);
      }
      if (payload.showToast) {
        setToast(payload.notification);
        window.setTimeout(() => setToast(null), 7000);
      }
    });
    const unsubscribeOpenOrder = api.notifications.onOpenOrder((payload) => {
      navigate(`/orders?orderId=${encodeURIComponent(payload.orderId)}`);
    });
    const unsubscribeFallback = api.notifications.onFallback((payload) => {
      setFallbackNotification(payload);
      window.setTimeout(() => setFallbackNotification(null), 6000);
    });
    void loadNotifications();

    return () => {
      unsubscribeCreated();
      unsubscribeOpenOrder();
      unsubscribeFallback();
    };
  }, [api, navigate]);

  const openOrder = async (notification: AppNotificationRecord): Promise<void> => {
    if (notification.orderId) {
      await api.appNotifications.markRead(notification.id);
      setNotificationData(await api.appNotifications.list({ limit: 20, unreadOnly: false }));
      navigate(`/orders?orderId=${encodeURIComponent(notification.orderId)}`);
      setNotificationsOpen(false);
    }
  };

  const markNotificationRead = async (id: string): Promise<void> => {
    await api.appNotifications.markRead(id);
    setNotificationData(await api.appNotifications.list({ limit: 20, unreadOnly: false }));
  };

  const markAllNotificationsRead = async (): Promise<void> => {
    await api.appNotifications.markAllRead();
    setNotificationData(await api.appNotifications.list({ limit: 20, unreadOnly: false }));
  };

  const navBadge = (path: string): number => {
    if (path === "/orders") {
      return notificationData.summary.unreadNewSales;
    }

    if (path === "/events") {
      return notificationData.summary.unread;
    }

    return 0;
  };

  return (
    <div className="premium-grid grid h-screen grid-cols-[268px_1fr] bg-background text-slate-100">
      <aside className="flex min-h-0 flex-col border-r border-line/80 bg-slate-950/[0.82] shadow-[10px_0_46px_rgba(0,0,0,0.24)]">
        <div className="border-b border-line/80 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-purple/35 bg-slate-950 shadow-[0_0_26px_rgba(139,92,246,0.18)]">
              <img
                className="h-full w-full object-cover"
                src={BRAND_ASSETS.logoMark}
                alt=""
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold tracking-wide text-white">
                HzdKyx
              </div>
              <div className="text-xs font-medium text-slate-400">
                GameMarket Manager
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                cn(
                  "focus-ring group relative flex h-11 items-center gap-3 overflow-hidden rounded-md px-3 text-sm font-semibold motion-safe:transition-all motion-safe:duration-200",
                  isActive
                    ? "bg-cyan/10 text-cyan ring-1 ring-cyan/25 shadow-glowCyan"
                    : "text-slate-400 hover:bg-slate-900/80 hover:text-slate-100",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-cyan transition-opacity",
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50",
                    )}
                  />
                  <item.icon size={18} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {navBadge(item.path) > 0 && (
                    <span className="status-pulse rounded-full bg-cyan px-2 py-0.5 text-[11px] font-bold text-slate-950">
                      {navBadge(item.path)}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line/80 p-4">
          <div className="rounded-lg border border-line/80 bg-panelSoft/75 p-3 shadow-insetPanel">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <Activity size={14} />
              Base local ativa
            </div>
            <div className="mt-2 text-xs leading-5 text-slate-400">
              Integração oficial configurável em Configurações.
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex h-20 shrink-0 items-center justify-between border-b border-line/80 bg-background/[0.92] px-8 shadow-[0_12px_46px_rgba(0,0,0,0.18)] backdrop-blur">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
              {current.eyebrow}
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white">
              {current.title}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-md border border-line/80 bg-panel/90 px-3 py-2 text-slate-300 shadow-insetPanel">
              Taxa GameMarket{" "}
              <span className="font-semibold text-white">13%</span>
            </div>
            <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 font-semibold text-emerald-300 shadow-glowGreen">
              Líquido 87%
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              title="Notificações"
              onClick={() => setNotificationsOpen((currentValue) => !currentValue)}
            >
              <BellRing size={17} />
              {notificationData.summary.unread > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-cyan px-1.5 text-[10px] font-bold text-slate-950">
                  {notificationData.summary.unread}
                </span>
              )}
            </Button>
            <div className="flex items-center gap-3 rounded-md border border-line/80 bg-panel/90 px-3 py-2 shadow-insetPanel">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-cyan/10 text-xs font-bold text-cyan">
                {initials.toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1 text-sm font-semibold text-white">
                  <UserCircle size={14} className="text-slate-500" />
                  {session?.user.name}
                </div>
                <div className="text-xs text-slate-500">
                  {session?.user.role}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut size={16} />
              Sair
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          <div key={location.pathname} className="page-transition h-full min-h-0 overflow-y-auto px-8 py-6">
            <Outlet />
          </div>
        </main>
      </div>

      {notificationsOpen && (
        <div className="modal-panel fixed right-6 top-24 z-40 w-[420px] rounded-lg border border-line bg-panel shadow-premium">
          <div className="flex items-start justify-between gap-4 border-b border-line p-4">
            <div>
              <div className="text-sm font-semibold text-white">Notificações recentes</div>
              <div className="mt-1 text-xs text-slate-500">
                {notificationData.summary.unread} não vista(s)
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={notificationData.summary.unread === 0}
              onClick={() => void markAllNotificationsRead()}
            >
              <CheckCheck size={14} />
              Marcar todas
            </Button>
          </div>
          <div className="max-h-[560px] space-y-3 overflow-y-auto p-4">
            {notificationData.items.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  "rounded-lg border p-3",
                  notification.readAt
                    ? "border-line bg-panelSoft"
                    : "border-cyan/25 bg-cyan/10",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">
                      {notification.title}
                    </div>
                    <div className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-400">
                      {notification.message}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">
                      {new Date(notification.createdAt).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  {!notification.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cyan" />}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {notification.orderId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void openOrder(notification)}
                    >
                      <PackageOpen size={14} />
                      Abrir pedido
                    </Button>
                  )}
                  {!notification.readAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void markNotificationRead(notification.id)}
                    >
                      <CheckCircle2 size={14} />
                      Marcar como visto
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {notificationData.items.length === 0 && (
              <div className="rounded-lg border border-dashed border-line bg-panelSoft p-6 text-center text-sm text-slate-400">
                Nenhuma notificação local registrada.
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="modal-panel fixed bottom-5 right-5 z-50 w-[380px] rounded-lg border border-cyan/25 bg-panel shadow-premium">
          <div className="flex items-start justify-between gap-3 border-b border-line p-4">
            <div className="text-sm font-semibold text-white">{toast.title}</div>
            <Badge tone={toast.severity === "warning" ? "warning" : toast.severity === "critical" ? "danger" : "cyan"}>
              local
            </Badge>
          </div>
          <div className="space-y-3 p-4">
            <div className="whitespace-pre-line text-sm leading-6 text-slate-300">{toast.message}</div>
            {toast.orderId && (
              <Button size="sm" variant="primary" onClick={() => void openOrder(toast)}>
                <PackageOpen size={14} />
                Abrir pedido
              </Button>
            )}
          </div>
        </div>
      )}

      {fallbackNotification && (
        <div className="modal-panel fixed bottom-5 right-5 z-50 w-[360px] rounded-lg border border-cyan/25 bg-panel shadow-premium">
          <div className="flex items-start justify-between gap-3 border-b border-line p-4">
            <div className="text-sm font-semibold text-white">
              {fallbackNotification.title}
            </div>
            <Badge
              tone={
                fallbackNotification.severity === "critical"
                  ? "danger"
                  : fallbackNotification.severity === "warning"
                    ? "warning"
                    : fallbackNotification.severity === "success"
                      ? "success"
                      : "cyan"
              }
            >
              local
            </Badge>
          </div>
          <div className="p-4 text-sm leading-6 text-slate-300">
            {fallbackNotification.body}
          </div>
        </div>
      )}
    </div>
  );
};
