import { Bell, Check, CheckCheck, Download, Eye, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { Table, Td, Th } from "@renderer/components/ui/table";
import { useAuth } from "@renderer/lib/auth-context";
import { downloadCsv } from "@renderer/lib/csv";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import type { EventListInput, EventListResult, EventRecord, EventSeverity } from "../../../shared/contracts";

type BadgeTone = "success" | "warning" | "danger" | "purple" | "neutral" | "cyan";

const severityTone: Record<EventSeverity, BadgeTone> = {
  info: "neutral",
  success: "success",
  warning: "warning",
  critical: "danger"
};

const defaultFilters: EventListInput = {
  search: null,
  type: "all",
  severity: "all",
  orderId: null,
  productId: null,
  read: "all",
  dateFrom: null,
  dateTo: null
};

const Metric = ({
  label,
  value,
  helper,
  tone = "cyan"
}: {
  label: string;
  value: string;
  helper: string;
  tone?: BadgeTone;
}): JSX.Element => {
  const toneClass: Record<BadgeTone, string> = {
    success: "border-success/25 bg-success/10 text-emerald-300",
    warning: "border-warning/25 bg-warning/10 text-amber-300",
    danger: "border-danger/25 bg-danger/10 text-red-300",
    purple: "border-purple/25 bg-purple/10 text-violet-200",
    neutral: "border-slate-600/60 bg-slate-800/50 text-slate-200",
    cyan: "border-cyan/25 bg-cyan/10 text-cyan"
  };

  return (
    <Card className="min-h-[126px]">
      <CardContent className="flex h-full flex-col justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
        <div>
          <div className={`inline-flex rounded-md border px-2.5 py-1 text-2xl font-bold ${toneClass[tone]}`}>
            {value}
          </div>
          <div className="mt-3 text-xs text-slate-400">{helper}</div>
        </div>
      </CardContent>
    </Card>
  );
};

export const EventsPage = (): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const { session } = useAuth();
  const canEditEvents = session?.permissions.canEditOrders ?? false;
  const canExportCsv = session?.permissions.canExportCsv ?? false;
  const [filters, setFilters] = useState<EventListInput>(defaultFilters);
  const [data, setData] = useState<EventListResult>({
    items: [],
    summary: {
      total: 0,
      unread: 0,
      critical: 0,
      warnings: 0
    },
    types: []
  });
  const [selected, setSelected] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.events.list(filters);
      setData(result);
      if (!selected && result.items[0]) {
        setSelected(result.items[0]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar eventos.");
    } finally {
      setLoading(false);
    }
  }, [api, filters, selected]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadEvents();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadEvents]);

  const markRead = async (event: EventRecord): Promise<void> => {
    const updated = await api.events.markRead(event.id);
    setSelected(updated);
    await loadEvents();
  };

  const markAllRead = async (): Promise<void> => {
    await api.events.markAllRead();
    await loadEvents();
  };

  const exportEvents = async (): Promise<void> => {
    const csv = await api.events.exportCsv(filters);
    downloadCsv(csv.filename, csv.content);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-4">
        <Metric label="Eventos" value={String(data.summary.total)} helper="Base filtrada" tone="cyan" />
        <Metric label="Não lidos" value={String(data.summary.unread)} helper="Pendentes de leitura" tone="warning" />
        <Metric label="Críticos" value={String(data.summary.critical)} helper="Exigem atenção" tone="danger" />
        <Metric label="Warnings" value={String(data.summary.warnings)} helper="Avisos operacionais" tone="purple" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.85fr]">
        <Card>
          <CardHeader className="items-start">
            <div>
              <CardTitle>Eventos internos</CardTitle>
              <div className="mt-1 text-sm text-slate-400">
                Auditoria local. Estes nomes não representam eventos reais da GameMarket.
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => void markAllRead()} disabled={!canEditEvents}>
                <CheckCheck size={16} />
                Marcar todos
              </Button>
              <Button variant="secondary" onClick={() => void exportEvents()} disabled={!canExportCsv}>
                <Download size={16} />
                Exportar CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[1.3fr_1fr_0.7fr_0.7fr_0.8fr]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panelSoft pl-9 pr-3 text-sm text-white"
                  value={filters.search ?? ""}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value || null })}
                  placeholder="Buscar evento, pedido, produto ou mensagem"
                />
              </label>
              <select
                className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
                value={filters.type}
                onChange={(event) => setFilters({ ...filters, type: event.target.value as EventListInput["type"] })}
              >
                <option value="all">Todos tipos</option>
                {data.types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
                value={filters.severity}
                onChange={(event) => setFilters({ ...filters, severity: event.target.value as EventListInput["severity"] })}
              >
                <option value="all">Severidade</option>
                <option value="info">info</option>
                <option value="success">success</option>
                <option value="warning">warning</option>
                <option value="critical">critical</option>
              </select>
              <select
                className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
                value={filters.read}
                onChange={(event) => setFilters({ ...filters, read: event.target.value as EventListInput["read"] })}
              >
                <option value="all">Leitura</option>
                <option value="unread">Não lidos</option>
                <option value="read">Lidos</option>
              </select>
              <input
                className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
                type="date"
                value={filters.dateFrom?.slice(0, 10) ?? ""}
                onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value || null })}
              />
            </div>

            {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

            <Table>
              <thead>
                <tr>
                  <Th>Evento</Th>
                  <Th>Tipo</Th>
                  <Th>Origem</Th>
                  <Th>Severidade</Th>
                  <Th>Pedido</Th>
                  <Th>Produto</Th>
                  <Th>Data</Th>
                  <Th>Leitura</Th>
                  <Th>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((event) => (
                  <tr key={event.id} className="cursor-pointer hover:bg-slate-900/45" onClick={() => setSelected(event)}>
                    <Td>
                      <div className="font-semibold text-white">{event.title}</div>
                      <div className="mt-1 font-mono text-xs text-slate-500">{event.eventCode}</div>
                    </Td>
                    <Td className="font-mono text-xs text-slate-400">{event.type}</Td>
                    <Td>{event.source}</Td>
                    <Td>
                      <Badge tone={severityTone[event.severity]}>{event.severity}</Badge>
                    </Td>
                    <Td className="font-mono text-xs text-slate-400">{event.orderCode ?? event.orderId ?? "-"}</Td>
                    <Td>{event.productName ?? "-"}</Td>
                    <Td>{new Date(event.createdAt).toLocaleString("pt-BR")}</Td>
                    <Td>{event.readAt ? <Badge>lido</Badge> : <Badge tone="cyan">novo</Badge>}</Td>
                    <Td onClick={(clickEvent) => clickEvent.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" title="Ver" onClick={() => setSelected(event)}>
                          <Eye size={15} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Marcar lido"
                          disabled={Boolean(event.readAt) || !canEditEvents}
                          onClick={() => void markRead(event)}
                        >
                          <Check size={15} />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {!loading && data.items.length === 0 && (
              <div className="grid place-items-center rounded-lg border border-dashed border-line bg-panelSoft py-12 text-center">
                <Bell className="text-slate-600" size={34} />
                <div className="mt-3 font-semibold text-white">Nenhum evento encontrado</div>
                <div className="mt-1 text-sm text-slate-400">Ações em pedidos e estoque criarão eventos internos.</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Detalhes do evento</CardTitle>
            {selected ? <Badge tone={severityTone[selected.severity]}>{selected.severity}</Badge> : <Badge>vazio</Badge>}
          </CardHeader>
          <CardContent className="space-y-4">
            {selected ? (
              <>
                <div className="rounded-lg border border-line bg-panelSoft p-4">
                  <div className="font-semibold text-white">{selected.title}</div>
                  <div className="mt-1 font-mono text-xs text-slate-500">{selected.type}</div>
                  {selected.message && <div className="mt-3 text-sm leading-6 text-slate-300">{selected.message}</div>}
                </div>
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Pedido</span>
                    <span className="font-mono text-xs text-slate-300">{selected.orderCode ?? selected.orderId ?? "-"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Produto</span>
                    <span className="text-slate-300">{selected.productName ?? selected.productId ?? "-"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Estoque</span>
                    <span className="font-mono text-xs text-slate-300">{selected.inventoryCode ?? selected.inventoryItemId ?? "-"}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Criado</span>
                    <span className="text-slate-300">{new Date(selected.createdAt).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500">Usuário</span>
                    <span className="text-slate-300">{selected.actorUserName ?? selected.actorUserId ?? "-"}</span>
                  </div>
                </div>
                {selected.rawPayload && (
                  <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-slate-950/70 p-4 text-xs text-slate-300">
                    {selected.rawPayload}
                  </pre>
                )}
                {!selected.readAt && (
                  <Button variant="primary" disabled={!canEditEvents} onClick={() => void markRead(selected)}>
                    <Check size={16} />
                    Marcar como lido
                  </Button>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-panelSoft p-6 text-center text-sm text-slate-400">
                Selecione um evento para ver detalhes.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
