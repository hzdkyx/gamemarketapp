import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Activity, LogOut, ShieldCheck, UserCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { navItems } from "./nav-items";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { useAuth } from "@renderer/lib/auth-context";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import { cn } from "@renderer/lib/utils";

const titles: Record<string, { title: string; eyebrow: string }> = {
  "/": { title: "Dashboard", eyebrow: "Operação GameMarket" },
  "/products": { title: "Produtos", eyebrow: "Catálogo e precificação" },
  "/inventory": { title: "Estoque", eyebrow: "Contas, fornecedores e status" },
  "/orders": { title: "Pedidos", eyebrow: "Fila operacional" },
  "/events": { title: "Eventos", eyebrow: "Auditoria e notificações" },
  "/settings": { title: "Configurações", eyebrow: "Sistema e segurança" }
};

export const AppShell = (): JSX.Element => {
  const location = useLocation();
  const { session, logout } = useAuth();
  const current = titles[location.pathname] ?? titles["/"]!;
  const api = useMemo(() => getDesktopApi(), []);
  const [fallbackNotification, setFallbackNotification] = useState<{
    title: string;
    body: string;
    severity?: "info" | "success" | "warning" | "critical";
  } | null>(null);

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
    [session]
  );

  const initials = useMemo(() => {
    const name = session?.user.name ?? "";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "");
  }, [session]);

  useEffect(() => {
    const unsubscribe = api.notifications.onFallback((payload) => {
      setFallbackNotification(payload);
      window.setTimeout(() => setFallbackNotification(null), 6000);
    });

    return unsubscribe;
  }, [api]);

  return (
    <div className="grid h-screen grid-cols-[260px_1fr] bg-background text-slate-100">
      <aside className="flex min-h-0 flex-col border-r border-line bg-slate-950/75">
        <div className="border-b border-line p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg border border-cyan/30 bg-cyan/10 text-cyan">
              <ShieldCheck size={22} />
            </div>
            <div>
              <div className="text-sm font-bold tracking-wide text-white">HzdKyx</div>
              <div className="text-xs font-medium text-slate-400">GameMarket Manager</div>
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
                  "focus-ring flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition",
                  isActive
                    ? "bg-cyan/12 text-cyan ring-1 ring-cyan/25"
                    : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                )
              }
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-line p-4">
          <div className="rounded-lg border border-line bg-panelSoft p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
              <Activity size={14} />
              Base local ativa
            </div>
            <div className="mt-2 text-xs leading-5 text-slate-400">
              API real bloqueada até a documentação oficial estar disponível.
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-20 items-center justify-between border-b border-line bg-background/95 px-8">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan">
              {current.eyebrow}
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white">{current.title}</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="rounded-md border border-line bg-panel px-3 py-2 text-slate-300">
              Taxa GameMarket <span className="font-semibold text-white">13%</span>
            </div>
            <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 font-semibold text-emerald-300">
              Líquido 87%
            </div>
            <div className="flex items-center gap-3 rounded-md border border-line bg-panel px-3 py-2">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-cyan/10 text-xs font-bold text-cyan">
                {initials.toUpperCase()}
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1 text-sm font-semibold text-white">
                  <UserCircle size={14} className="text-slate-500" />
                  {session?.user.name}
                </div>
                <div className="text-xs text-slate-500">{session?.user.role}</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              <LogOut size={16} />
              Sair
            </Button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          <Outlet />
        </main>
      </div>

      {fallbackNotification && (
        <div className="fixed bottom-5 right-5 z-50 w-[360px] rounded-lg border border-cyan/25 bg-panel shadow-premium">
          <div className="flex items-start justify-between gap-3 border-b border-line p-4">
            <div className="text-sm font-semibold text-white">{fallbackNotification.title}</div>
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
          <div className="p-4 text-sm leading-6 text-slate-300">{fallbackNotification.body}</div>
        </div>
      )}
    </div>
  );
};
