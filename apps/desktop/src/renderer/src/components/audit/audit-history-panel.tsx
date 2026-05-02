import { Clock3, History, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import type {
  AuditEntityType,
  AuditHistoryEntry,
  AuditSource,
  ListAuditHistoryResult,
} from "../../../../shared/contracts";

type SourceFilter = AuditSource | "all";

const sourceOptions: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "manual", label: "Manual" },
  { value: "cloud_sync", label: "Cloud" },
  { value: "gamemarket_api", label: "GameMarket" },
  { value: "webhook", label: "Webhook" },
  { value: "system", label: "Sistema" },
];

const sourceTone: Record<AuditSource, "success" | "warning" | "danger" | "purple" | "neutral" | "cyan"> = {
  manual: "cyan",
  cloud_sync: "purple",
  gamemarket_api: "success",
  webhook: "warning",
  backup_restore: "neutral",
  system: "neutral",
  migration: "neutral",
  local_auth: "neutral",
  unknown: "neutral",
};

const emptyResult = (limit: number, offset: number): ListAuditHistoryResult => ({
  items: [],
  total: 0,
  limit,
  offset,
  nextOffset: null,
  sources: [],
});

const formatAuditValue = (value: string | number | boolean | null): string => {
  if (value === null) {
    return "indisponível";
  }

  if (typeof value === "boolean") {
    return value ? "Sim" : "Não";
  }

  return String(value);
};

const AuditEntryCard = ({ entry }: { entry: AuditHistoryEntry }): JSX.Element => {
  const visibleChanges = entry.changes.slice(0, 8);

  return (
    <div className="relative border-l border-cyan/35 pb-5 pl-4 last:pb-0">
      <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border border-cyan/70 bg-background shadow-glowCyan" />
      <div className="rounded-md border border-line bg-panelSoft p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-white">{entry.title}</div>
              <Badge tone={sourceTone[entry.source]}>{entry.sourceLabel}</Badge>
            </div>
            {entry.message && (
              <div className="mt-1 text-xs leading-5 text-slate-400">{entry.message}</div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
            <Clock3 size={13} />
            {new Date(entry.createdAt).toLocaleString("pt-BR")}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>Ator: {entry.actorName ?? "Indisponível"}</span>
          <span className="font-mono">{entry.eventType}</span>
        </div>

        {entry.detailUnavailable ? (
          <div className="mt-3 rounded-md border border-dashed border-line bg-panel px-3 py-2 text-xs text-slate-400">
            Detalhe antigo indisponível.
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            {visibleChanges.map((change) => (
              <div key={`${entry.id}:${change.field}`} className="rounded-md border border-line bg-panel p-2">
                <div className="text-xs font-semibold text-slate-300">{change.label}</div>
                {change.sensitive ? (
                  <div className="mt-1 text-xs text-amber-300">Campo sensível alterado</div>
                ) : (
                  <div className="mt-1 grid gap-2 text-xs md:grid-cols-[1fr_auto_1fr]">
                    <div className="min-w-0 rounded bg-background/70 px-2 py-1 text-slate-400">
                      {formatAuditValue(change.before)}
                    </div>
                    <div className="self-center text-cyan">→</div>
                    <div className="min-w-0 rounded bg-cyan/10 px-2 py-1 text-cyan">
                      {formatAuditValue(change.after)}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {entry.changes.length > visibleChanges.length && (
              <div className="text-xs text-slate-500">
                +{entry.changes.length - visibleChanges.length} alteração(ões) adicionais.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const AuditHistoryPanel = ({
  entityType,
  entityId,
  title = "Histórico",
  compact = false,
}: {
  entityType: AuditEntityType;
  entityId: string;
  title?: string;
  compact?: boolean;
}): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const limit = compact ? 10 : 20;
  const [source, setSource] = useState<SourceFilter>("all");
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<ListAuditHistoryResult>(() => emptyResult(limit, 0));
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (offset: number, append = false): Promise<void> => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const payload = {
          entityId,
          source,
          search: search.trim() || null,
          limit,
          offset,
        };
        const next =
          entityType === "product"
            ? await api.audit.listProductHistory(payload)
            : entityType === "variant"
              ? await api.audit.listVariantHistory(payload)
              : entityType === "order"
                ? await api.audit.listOrderHistory(payload)
                : await api.audit.listEntityHistory({ ...payload, entityType });

        setResult((current) =>
          append
            ? {
                ...next,
                items: [...current.items, ...next.items],
              }
            : next,
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Falha ao carregar histórico.",
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [api, entityId, entityType, limit, search, source],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadHistory(0);
    }, 160);

    return () => window.clearTimeout(timeoutId);
  }, [loadHistory]);

  return (
    <div className={compact ? "space-y-3" : "rounded-lg border border-line bg-panel/60 p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <History size={16} className="text-cyan" />
            {title}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {result.total} evento(s) auditável(is)
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {sourceOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                source === option.value
                  ? "rounded-md border border-cyan/40 bg-cyan/15 px-2.5 py-1 text-xs font-semibold text-cyan"
                  : "rounded-md border border-line bg-panelSoft px-2.5 py-1 text-xs text-slate-400 hover:text-white"
              }
              onClick={() => setSource(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
        <input
          className="focus-ring h-9 w-full rounded-md border border-line bg-panelSoft pl-9 pr-3 text-sm text-white"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por campo, evento ou ator"
        />
      </label>

      {error && (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-md border border-line bg-panelSoft p-4 text-sm text-slate-400">
          Carregando histórico...
        </div>
      ) : result.items.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-panelSoft p-4 text-sm text-slate-400">
          Nenhum histórico registrado para este item ainda. Novas alterações serão auditadas automaticamente.
        </div>
      ) : (
        <div className="space-y-0">
          {result.items.map((entry) => (
            <AuditEntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {result.nextOffset !== null && (
        <Button
          variant="secondary"
          size="sm"
          type="button"
          disabled={loadingMore}
          onClick={() => void loadHistory(result.nextOffset ?? 0, true)}
        >
          {loadingMore ? "Carregando..." : "Mostrar mais"}
        </Button>
      )}
    </div>
  );
};
