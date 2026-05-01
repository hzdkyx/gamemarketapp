import { formatCurrencyBRL } from "@hzdk/shared";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  CircleDollarSign,
  PackageX,
  RefreshCw,
  ReceiptText,
  TrendingUp,
  TriangleAlert
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { MetricCard } from "@renderer/components/ui/metric-card";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import type { DashboardSummary, EventSeverity, OrderStatus } from "../../../shared/contracts";

const emptySummary: DashboardSummary = {
  salesToday: 0,
  salesMonth: 0,
  grossRevenueMonth: 0,
  netRevenueMonth: 0,
  estimatedProfitMonth: 0,
  pendingActionOrders: 0,
  problemOrMediationOrders: 0,
  lowStockProducts: 0,
  outOfStockProducts: 0,
  unreadNewSales: 0,
  deliveredAwaitingRelease: 0,
  waitingReleaseCount: 0,
  waitingReleaseGross: 0,
  waitingReleaseNet: 0,
  waitingReleaseProfit: 0,
  gameMarketApiConfigured: false,
  gameMarketPollingActive: false,
  gameMarketLastCheckedAt: null,
  gameMarketNextRunAt: null,
  gameMarketLastPollingStatus: "not_configured",
  gameMarketLastPollingMessage: null,
  latestEvents: [],
  salesByDay: [],
  profitByCategory: [],
  statusBreakdown: []
};

const statusLabels: Record<OrderStatus, string> = {
  draft: "Rascunho",
  pending_payment: "Pgto pendente",
  payment_confirmed: "Confirmado",
  awaiting_delivery: "Aguardando",
  delivered: "Entregue",
  completed: "Concluído",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  mediation: "Mediação",
  problem: "Problema",
  archived: "Arquivado"
};

const severityTone = (severity: EventSeverity): "neutral" | "success" | "warning" | "danger" => {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  if (severity === "success") return "success";
  return "neutral";
};

const pieColors = ["#27d7f2", "#8b5cf6", "#25d366", "#f6b73c", "#ff4d5e", "#4f8bff"];

export const DashboardPage = (): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [pollingBusy, setPollingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      setSummary(await api.dashboard.getSummary());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar dashboard.");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSummary();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSummary]);

  const checkGameMarketNow = async (): Promise<void> => {
    setPollingBusy(true);
    setError(null);

    try {
      await api.gamemarket.pollNow();
      await loadSummary();
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : "Falha ao verificar GameMarket.");
    } finally {
      setPollingBusy(false);
    }
  };

  const hasSalesChart = summary.salesByDay.some((day) => day.orders > 0 || day.gross > 0 || day.profit !== 0);
  const hasCategoryChart = summary.profitByCategory.length > 0;
  const hasStatusChart = summary.statusBreakdown.length > 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200 shadow-[0_0_24px_rgba(255,77,94,0.08)]">
          {error}
        </div>
      )}

      {(!summary.gameMarketApiConfigured || !summary.gameMarketPollingActive) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4 shadow-insetPanel">
          <div>
            <div className="text-sm font-semibold text-amber-200">Atenção GameMarket</div>
            <div className="mt-1 text-sm text-slate-300">
              {!summary.gameMarketApiConfigured
                ? "API GameMarket sem configuração pronta para leitura."
                : "Polling automático de backup está desativado."}
            </div>
          </div>
          <Button variant="secondary" disabled={pollingBusy} onClick={() => void checkGameMarketNow()}>
            <RefreshCw size={16} className={pollingBusy ? "motion-safe:animate-spin" : undefined} />
            {pollingBusy ? "Verificando..." : "Verificar agora"}
          </Button>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="Novas vendas não vistas"
          value={String(summary.unreadNewSales)}
          helper="Notificações locais pendentes"
          icon={<BellRing size={18} />}
          tone="cyan"
          loading={loading}
        />
        <MetricCard
          label="Entregues aguardando liberação"
          value={String(summary.waitingReleaseCount)}
          helper="Delivered sem completed"
          icon={<PackageX size={18} />}
          tone="warning"
          loading={loading}
        />
        <MetricCard
          label="Bruto aguardando liberação"
          value={formatCurrencyBRL(summary.waitingReleaseGross)}
          helper="Independente do mês atual"
          icon={<CircleDollarSign size={18} />}
          tone="success"
          loading={loading}
        />
        <MetricCard
          label="A receber / aguardando liberação"
          value={formatCurrencyBRL(summary.waitingReleaseNet)}
          helper="Líquido dos delivered pendentes"
          icon={<ArrowUpRight size={18} />}
          tone="cyan"
          loading={loading}
        />
        <MetricCard
          label="Lucro previsto a liberar"
          value={formatCurrencyBRL(summary.waitingReleaseProfit)}
          helper="Lucro dos delivered pendentes"
          icon={<TrendingUp size={18} />}
          tone="success"
          loading={loading}
        />
        <Card className="min-h-[128px] overflow-hidden">
          <div className="h-px bg-gradient-to-r from-cyan/50 via-cyan/20 to-transparent" />
          <CardContent className="flex h-full flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Última verificação GameMarket
              </div>
              <Badge
                tone={summary.gameMarketPollingActive ? "success" : "warning"}
                className={pollingBusy ? "status-pulse" : undefined}
              >
                {summary.gameMarketPollingActive ? "ativo" : "inativo"}
              </Badge>
            </div>
            <div>
              <div className="mt-5 text-sm font-semibold text-white">
                {summary.gameMarketLastCheckedAt
                  ? new Date(summary.gameMarketLastCheckedAt).toLocaleString("pt-BR")
                  : "Sem verificação"}
              </div>
              <div className="mt-1 text-xs font-medium text-slate-400">
                {summary.gameMarketNextRunAt
                  ? `Próxima: ${new Date(summary.gameMarketNextRunAt).toLocaleString("pt-BR")}`
                  : summary.gameMarketLastPollingMessage ?? summary.gameMarketLastPollingStatus}
              </div>
              <Button className="mt-3" size="sm" variant="secondary" disabled={pollingBusy} onClick={() => void checkGameMarketNow()}>
                <RefreshCw size={14} className={pollingBusy ? "motion-safe:animate-spin" : undefined} />
                {pollingBusy ? "Verificando..." : "Verificar agora"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-9">
        <MetricCard
          label="Vendas hoje"
          value={String(summary.salesToday)}
          helper={loading ? "Carregando SQLite" : "Pedidos confirmados ou finalizados"}
          icon={<TrendingUp size={18} />}
          tone="cyan"
          loading={loading}
        />
        <MetricCard
          label="Vendas mês atual"
          value={String(summary.salesMonth)}
          helper="Mês atual"
          icon={<ReceiptText size={18} />}
          tone="purple"
          loading={loading}
        />
        <MetricCard
          label="Bruto mês atual"
          value={formatCurrencyBRL(summary.grossRevenueMonth)}
          helper="Antes da taxa"
          icon={<CircleDollarSign size={18} />}
          tone="success"
          loading={loading}
        />
        <MetricCard
          label="Líquido mês atual"
          value={formatCurrencyBRL(summary.netRevenueMonth)}
          helper="Estimado com 87%"
          icon={<ArrowUpRight size={18} />}
          tone="cyan"
          loading={loading}
        />
        <MetricCard
          label="Lucro mês atual"
          value={formatCurrencyBRL(summary.estimatedProfitMonth)}
          helper="Snapshot dos pedidos"
          icon={<TrendingUp size={18} />}
          tone="success"
          loading={loading}
        />
        <MetricCard
          label="Ação pendente"
          value={String(summary.pendingActionOrders)}
          helper="Entrega, mediação ou revisão"
          icon={<AlertTriangle size={18} />}
          tone="warning"
          loading={loading}
        />
        <MetricCard
          label="Mediação/problema"
          value={String(summary.problemOrMediationOrders)}
          helper="Pedidos destacados"
          icon={<TriangleAlert size={18} />}
          tone="danger"
          loading={loading}
        />
        <MetricCard
          label="Estoque baixo"
          value={String(summary.lowStockProducts)}
          helper="Produtos/variações operacionais"
          icon={<PackageX size={18} />}
          tone="warning"
          loading={loading}
        />
        <MetricCard
          label="Sem estoque"
          value={String(summary.outOfStockProducts)}
          helper="Produtos/variações operacionais"
          icon={<PackageX size={18} />}
          tone="danger"
          loading={loading}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle>Vendas por dia</CardTitle>
            <Badge tone="cyan">7 dias</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[330px]">
              {hasSalesChart ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={summary.salesByDay} margin={{ left: 4, right: 12, top: 12, bottom: 0 }}>
                    <CartesianGrid stroke="#202a3a" vertical={false} />
                    <XAxis dataKey="day" stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "#0b1018",
                        border: "1px solid #202a3a",
                        borderRadius: 8,
                        color: "#e2e8f0"
                      }}
                      formatter={(value, name) =>
                        name === "orders" ? [String(value), "Pedidos"] : [formatCurrencyBRL(Number(value)), String(name)]
                      }
                    />
                    <Bar dataKey="gross" fill="#27d7f2" radius={[6, 6, 0, 0]} opacity={0.72} />
                    <Line type="monotone" dataKey="profit" stroke="#8b5cf6" strokeWidth={3} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Sem vendas recentes"
                  helper="Crie pedidos e eventos para popular este painel."
                  icon={<TrendingUp size={24} />}
                  className="h-full min-h-[260px]"
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Últimos eventos</CardTitle>
            <BellRing size={18} className="text-cyan" />
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.latestEvents.map((event) => (
              <div key={event.id} className="rounded-lg border border-line bg-panelSoft p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone={severityTone(event.severity)}>{event.severity}</Badge>
                  {!event.readAt && <span className="h-2 w-2 rounded-full bg-cyan" />}
                </div>
                <div className="mt-3 text-sm font-semibold text-white">{event.title}</div>
                <div className="mt-1 font-mono text-xs text-slate-500">{event.type}</div>
                <div className="mt-1 text-xs text-slate-500">{new Date(event.createdAt).toLocaleString("pt-BR")}</div>
              </div>
            ))}
            {summary.latestEvents.length === 0 && (
              <div className="rounded-lg border border-dashed border-line bg-panelSoft p-6 text-center text-sm text-slate-400">
                Nenhum evento registrado ainda.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lucro por categoria/jogo</CardTitle>
            <Badge tone="purple">mês</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {hasCategoryChart ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={summary.profitByCategory} margin={{ left: 4, right: 12, top: 12, bottom: 0 }}>
                    <CartesianGrid stroke="#202a3a" vertical={false} />
                    <XAxis dataKey="category" stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "#0b1018",
                        border: "1px solid #202a3a",
                        borderRadius: 8,
                        color: "#e2e8f0"
                      }}
                      formatter={(value) => formatCurrencyBRL(Number(value))}
                    />
                    <Bar dataKey="profit" fill="#8b5cf6" radius={[6, 6, 0, 0]} opacity={0.78} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Sem lucro por categoria"
                  helper="Crie pedidos e eventos para popular este painel."
                  icon={<TrendingUp size={24} />}
                  className="h-full min-h-[260px]"
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status dos pedidos</CardTitle>
            <Button size="sm" variant="ghost" asChild>
              <Link to="/orders">Ver pedidos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {hasStatusChart ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.statusBreakdown.map((row) => ({
                        ...row,
                        label: statusLabels[row.status]
                      }))}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={70}
                      outerRadius={112}
                      paddingAngle={2}
                    >
                      {summary.statusBreakdown.map((row, index) => (
                        <Cell key={row.status} fill={pieColors[index % pieColors.length] ?? "#27d7f2"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#0b1018",
                        border: "1px solid #202a3a",
                        borderRadius: 8,
                        color: "#e2e8f0"
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Sem pedidos para status"
                  helper="Crie pedidos e eventos para popular este painel."
                  icon={<ReceiptText size={24} />}
                  className="h-full min-h-[260px]"
                />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
