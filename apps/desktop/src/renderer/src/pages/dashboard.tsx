import { formatCurrencyBRL } from "@hzdk/shared";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  CircleDollarSign,
  PackageX,
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

interface MetricCardProps {
  label: string;
  value: string;
  helper: string;
  icon: JSX.Element;
  tone?: "cyan" | "purple" | "success" | "warning" | "danger";
}

const toneClass: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  cyan: "text-cyan bg-cyan/10 border-cyan/25",
  purple: "text-violet-300 bg-purple/10 border-purple/25",
  success: "text-emerald-300 bg-success/10 border-success/25",
  warning: "text-amber-300 bg-warning/10 border-warning/25",
  danger: "text-red-300 bg-danger/10 border-danger/25"
};

const pieColors = ["#22d3ee", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6"];

const MetricCard = ({ label, value, helper, icon, tone = "cyan" }: MetricCardProps): JSX.Element => (
  <Card className="min-h-[132px]">
    <CardContent className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between gap-4">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <div className={`rounded-md border p-2 ${toneClass[tone]}`}>{icon}</div>
      </div>
      <div>
        <div className="mt-5 text-2xl font-bold text-white">{value}</div>
        <div className="mt-1 text-xs font-medium text-slate-400">{helper}</div>
      </div>
    </CardContent>
  </Card>
);

const EmptyState = ({ label }: { label: string }): JSX.Element => (
  <div className="grid h-full min-h-[260px] place-items-center rounded-lg border border-dashed border-line bg-panelSoft text-center">
    <div>
      <TrendingUp className="mx-auto text-slate-600" size={34} />
      <div className="mt-3 font-semibold text-white">{label}</div>
      <div className="mt-1 text-sm text-slate-400">Crie pedidos e eventos para popular este painel.</div>
    </div>
  </div>
);

export const DashboardPage = (): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loading, setLoading] = useState(true);
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

  const hasSalesChart = summary.salesByDay.some((day) => day.orders > 0 || day.gross > 0 || day.profit !== 0);
  const hasCategoryChart = summary.profitByCategory.length > 0;
  const hasStatusChart = summary.statusBreakdown.length > 0;

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-9">
        <MetricCard
          label="Vendas hoje"
          value={String(summary.salesToday)}
          helper={loading ? "Carregando SQLite" : "Pedidos confirmados ou finalizados"}
          icon={<TrendingUp size={18} />}
          tone="cyan"
        />
        <MetricCard
          label="Vendas mês"
          value={String(summary.salesMonth)}
          helper="Mês atual"
          icon={<ReceiptText size={18} />}
          tone="purple"
        />
        <MetricCard
          label="Bruto mês"
          value={formatCurrencyBRL(summary.grossRevenueMonth)}
          helper="Antes da taxa"
          icon={<CircleDollarSign size={18} />}
          tone="success"
        />
        <MetricCard
          label="Líquido mês"
          value={formatCurrencyBRL(summary.netRevenueMonth)}
          helper="Estimado com 87%"
          icon={<ArrowUpRight size={18} />}
          tone="cyan"
        />
        <MetricCard
          label="Lucro mês"
          value={formatCurrencyBRL(summary.estimatedProfitMonth)}
          helper="Snapshot dos pedidos"
          icon={<TrendingUp size={18} />}
          tone="success"
        />
        <MetricCard
          label="Ação pendente"
          value={String(summary.pendingActionOrders)}
          helper="Entrega, mediação ou revisão"
          icon={<AlertTriangle size={18} />}
          tone="warning"
        />
        <MetricCard
          label="Mediação/problema"
          value={String(summary.problemOrMediationOrders)}
          helper="Pedidos destacados"
          icon={<TriangleAlert size={18} />}
          tone="danger"
        />
        <MetricCard
          label="Estoque baixo"
          value={String(summary.lowStockProducts)}
          helper="Produtos no limite"
          icon={<PackageX size={18} />}
          tone="warning"
        />
        <MetricCard
          label="Sem estoque"
          value={String(summary.outOfStockProducts)}
          helper="Produtos zerados"
          icon={<PackageX size={18} />}
          tone="danger"
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
                    <CartesianGrid stroke="#252b3a" vertical={false} />
                    <XAxis dataKey="day" stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "#10131d",
                        border: "1px solid #252b3a",
                        borderRadius: 8,
                        color: "#e2e8f0"
                      }}
                      formatter={(value, name) =>
                        name === "orders" ? [String(value), "Pedidos"] : [formatCurrencyBRL(Number(value)), String(name)]
                      }
                    />
                    <Bar dataKey="gross" fill="#22d3ee" radius={[6, 6, 0, 0]} opacity={0.72} />
                    <Line type="monotone" dataKey="profit" stroke="#8b5cf6" strokeWidth={3} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState label="Sem vendas recentes" />
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
                    <CartesianGrid stroke="#252b3a" vertical={false} />
                    <XAxis dataKey="category" stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "#10131d",
                        border: "1px solid #252b3a",
                        borderRadius: 8,
                        color: "#e2e8f0"
                      }}
                      formatter={(value) => formatCurrencyBRL(Number(value))}
                    />
                    <Bar dataKey="profit" fill="#8b5cf6" radius={[6, 6, 0, 0]} opacity={0.78} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState label="Sem lucro por categoria" />
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
                        <Cell key={row.status} fill={pieColors[index % pieColors.length] ?? "#22d3ee"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#10131d",
                        border: "1px solid #252b3a",
                        borderRadius: 8,
                        color: "#e2e8f0"
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState label="Sem pedidos para status" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
