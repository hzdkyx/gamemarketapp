import { formatCurrencyBRL, formatPercent } from "@hzdk/shared";
import {
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  Filter,
  PackageSearch,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ProductVariantsPanel } from "@renderer/components/products/product-variants-panel";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renderer/components/ui/card";
import { Table, Td, Th } from "@renderer/components/ui/table";
import { useAuth } from "@renderer/lib/auth-context";
import { downloadCsv } from "@renderer/lib/csv";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import {
  buildProfitCsv,
  emptyProfitListResult,
  normalizeProfitListResult,
} from "../../../shared/profit-analysis";
import type {
  DeliveryType,
  ProductRecord,
  ProfitAnalysisRow,
  ProfitAnalysisStatus,
  ProfitListInput,
  ProfitListResult,
} from "../../../shared/contracts";
import {
  profitMarginFilterValues,
  profitReviewFilterValues,
  profitSortValues,
} from "../../../shared/contracts";

type BadgeTone =
  | "success"
  | "warning"
  | "danger"
  | "purple"
  | "neutral"
  | "cyan";

const defaultFilters: ProfitListInput = {
  search: null,
  category: null,
  deliveryType: "all",
  status: "all",
  review: "all",
  margin: "all",
  sortBy: "profit_desc",
};

const deliveryTypeLabels: Record<DeliveryType, string> = {
  manual: "Manual",
  automatic: "Automática",
  on_demand: "Sob demanda",
  service: "Serviço",
};

const statusLabels: Record<ProfitAnalysisStatus, string> = {
  active: "Ativo",
  paused: "Pausado",
  out_of_stock: "Sem estoque",
  on_demand: "Sob demanda",
  archived: "Arquivado",
};

const statusTone: Record<ProfitAnalysisStatus, BadgeTone> = {
  active: "success",
  paused: "warning",
  out_of_stock: "danger",
  on_demand: "purple",
  archived: "neutral",
};

const profitSortLabels: Record<ProfitListInput["sortBy"], string> = {
  profit_desc: "Maior lucro",
  profit_asc: "Menor lucro",
  margin_desc: "Maior margem",
  margin_asc: "Menor margem",
  sale_desc: "Maior venda",
  cost_desc: "Maior custo",
  stock_desc: "Estoque",
  name_asc: "Nome",
};

const reviewLabels: Record<ProfitListInput["review"], string> = {
  all: "Todas revisões",
  needs_review: "Precisa revisar",
  ok: "OK",
};

const marginLabels: Record<ProfitListInput["margin"], string> = {
  all: "Todas margens",
  low_margin: "Margem baixa",
  medium_margin: "Margem média",
  high_margin: "Margem alta",
  negative_profit: "Lucro negativo",
};

const Metric = ({
  label,
  value,
  helper,
  tone = "cyan",
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
    cyan: "border-cyan/25 bg-cyan/10 text-cyan",
  };

  return (
    <Card className="min-h-[128px]">
      <CardContent className="flex h-full flex-col justify-between">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </div>
        <div>
          <div
            className={`inline-flex rounded-md border px-2.5 py-1 text-xl font-bold ${toneClass[tone]}`}
          >
            {value}
          </div>
          <div className="mt-3 text-xs text-slate-400">{helper}</div>
        </div>
      </CardContent>
    </Card>
  );
};

const marginTone = (row: ProfitAnalysisRow): string =>
  row.profit < 0
    ? "font-semibold text-red-300"
    : row.marginPercent < 0.2
      ? "font-semibold text-amber-300"
      : "font-semibold text-emerald-300";

const stockLabel = (row: ProfitAnalysisRow): JSX.Element => {
  if (row.deliveryType === "service") {
    return <span className="text-cyan">Serviço</span>;
  }

  if (row.deliveryType === "on_demand") {
    return <span className="text-violet-200">Sob demanda</span>;
  }

  return (
    <span>
      {row.stockCurrent}/{row.stockMin}
    </span>
  );
};

export const ProfitPage = (): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const { session } = useAuth();
  const canEditProducts = session?.permissions.canEditProducts ?? false;
  const canExportCsv = session?.permissions.canExportCsv ?? false;
  const [filters, setFilters] = useState<ProfitListInput>(defaultFilters);
  const [data, setData] = useState<ProfitListResult>(emptyProfitListResult);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [variantPanel, setVariantPanel] = useState<{
    product: ProductRecord;
    initialVariantId: string | null;
  } | null>(null);

  const loadProfit = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.profit.list(filters);
      setData(normalizeProfitListResult(response));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar análise de lucro.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, filters]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProfit();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadProfit]);

  const exportProfit = async (): Promise<void> => {
    downloadCsv("hzdk-profit-analysis.csv", buildProfitCsv(rows));
  };

  const editVariant = async (row: ProfitAnalysisRow): Promise<void> => {
    const product = await api.products.get(row.productId);
    setVariantPanel({
      product,
      initialVariantId: row.productVariantId,
    });
  };

  const markReviewed = async (row: ProfitAnalysisRow): Promise<void> => {
    if (!row.productVariantId) {
      return;
    }

    await api.productVariants.update({
      id: row.productVariantId,
      data: {
        needsReview: false,
      },
    });
    await loadProfit();
  };

  const rows = data?.list ?? [];
  const groups = data?.groups ?? [];
  const summary = data?.summary ?? emptyProfitListResult.summary;
  const filterOptions = data?.filters ?? emptyProfitListResult.filters;
  const deliveryTypeOptions = filterOptions.deliveryTypes.includes(
    filters.deliveryType as DeliveryType,
  )
    ? filterOptions.deliveryTypes
    : filters.deliveryType === "all"
      ? filterOptions.deliveryTypes
      : [...filterOptions.deliveryTypes, filters.deliveryType as DeliveryType];
  const statusOptions = filterOptions.statuses.includes(
    filters.status as ProfitAnalysisStatus,
  )
    ? filterOptions.statuses
    : filters.status === "all"
      ? filterOptions.statuses
      : [...filterOptions.statuses, filters.status as ProfitAnalysisStatus];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-5">
        <Metric
          label="Lucro potencial total"
          value={formatCurrencyBRL(summary.potentialProfitTotal)}
          helper="Manual/automático com estoque real"
          tone="success"
        />
        <Metric
          label="Lucro médio por venda"
          value={formatCurrencyBRL(summary.averageProfitPerSale)}
          helper="Itens ativos por venda"
          tone="purple"
        />
        <Metric
          label="Maior margem"
          value={
            summary.highestMargin
              ? formatPercent(summary.highestMargin.marginPercent)
              : "-"
          }
          helper={summary.highestMargin?.label ?? "Sem venda calculável"}
          tone="success"
        />
        <Metric
          label="Menor margem"
          value={
            summary.lowestMargin
              ? formatPercent(summary.lowestMargin.marginPercent)
              : "-"
          }
          helper={summary.lowestMargin?.label ?? "Ignora venda zerada"}
          tone="warning"
        />
        <Metric
          label="Custo total em estoque"
          value={formatCurrencyBRL(summary.stockCostTotal)}
          helper="unitCost x stockCurrent"
          tone="warning"
        />
        <Metric
          label="Receita bruta potencial"
          value={formatCurrencyBRL(summary.grossPotential)}
          helper="Venda x estoque real"
          tone="cyan"
        />
        <Metric
          label="Líquido potencial"
          value={formatCurrencyBRL(summary.netPotential)}
          helper="Após taxa GameMarket"
          tone="cyan"
        />
        <Metric
          label="Custo pendente"
          value={String(summary.pendingCostCount)}
          helper="Custo 0 fora de serviço"
          tone="danger"
        />
        <Metric
          label="Itens para revisão"
          value={String(summary.needsReviewCount)}
          helper="needsReview ativo"
          tone="warning"
        />
        <Metric
          label="Linhas analisadas"
          value={String(summary.analyzedRows)}
          helper={`${summary.variantRows} variações · ${summary.parentOnlyRows} sem variação`}
          tone="neutral"
        />
      </div>

      <Card>
        <CardHeader className="items-start">
          <div>
            <CardTitle>Lucro</CardTitle>
            <div className="mt-1 max-w-3xl text-sm text-slate-400">
              Análise financeira por produto, variação e margem.
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setFilters({ ...filters, review: "needs_review" })}
            >
              <Filter size={16} />
              Needs review
            </Button>
            <Button variant="secondary" onClick={() => void loadProfit()}>
              <RefreshCw size={16} />
              Atualizar
            </Button>
            <Button
              variant="primary"
              onClick={() => void exportProfit()}
              disabled={!canExportCsv}
            >
              <Download size={16} />
              Exportar CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 2xl:grid-cols-[1.4fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr_0.9fr]">
            <label className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                size={16}
              />
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panelSoft pl-9 pr-3 text-sm text-white"
                value={filters.search ?? ""}
                onChange={(event) =>
                  setFilters({ ...filters, search: event.target.value || null })
                }
                placeholder="Buscar produto, variação, código, fornecedor ou categoria"
              />
            </label>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.category ?? ""}
              onChange={(event) =>
                setFilters({ ...filters, category: event.target.value || null })
              }
            >
              <option value="">Todos jogos/categorias</option>
              {filterOptions.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.deliveryType}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  deliveryType: event.target
                    .value as ProfitListInput["deliveryType"],
                })
              }
            >
              <option value="all">Todas entregas</option>
              {deliveryTypeOptions.map((deliveryType) => (
                <option key={deliveryType} value={deliveryType}>
                  {deliveryTypeLabels[deliveryType]}
                </option>
              ))}
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.status}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  status: event.target.value as ProfitListInput["status"],
                })
              }
            >
              <option value="all">Todos status</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.review}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  review: event.target.value as ProfitListInput["review"],
                })
              }
            >
              {profitReviewFilterValues.map((review) => (
                <option key={review} value={review}>
                  {reviewLabels[review]}
                </option>
              ))}
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.margin}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  margin: event.target.value as ProfitListInput["margin"],
                })
              }
            >
              {profitMarginFilterValues.map((margin) => (
                <option key={margin} value={margin}>
                  {marginLabels[margin]}
                </option>
              ))}
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.sortBy}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  sortBy: event.target.value as ProfitListInput["sortBy"],
                })
              }
            >
              {profitSortValues.map((sort) => (
                <option key={sort} value={sort}>
                  {profitSortLabels[sort]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Badge tone="cyan">{summary.variantRows} variação(ões)</Badge>
            <Badge tone="neutral">
              {summary.parentOnlyRows} produto(s) sem variação
            </Badge>
            <span className="inline-flex items-center gap-1">
              <SlidersHorizontal size={13} />
              Filtros aplicados no main process
            </span>
          </div>

          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  Resumo por produto pai
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Agrupamento das linhas filtradas.
                </div>
              </div>
              <Badge tone="neutral">{groups.length} produto(s)</Badge>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th>Variações</Th>
                  <Th>Lucro mínimo</Th>
                  <Th>Lucro médio</Th>
                  <Th>Lucro máximo</Th>
                  <Th>Custo médio</Th>
                  <Th>Maior margem</Th>
                  <Th>Revisão</Th>
                </tr>
              </thead>
              <tbody>
                {groups.slice(0, 8).map((group) => (
                  <tr key={group.productId} className="hover:bg-slate-900/45">
                    <Td>
                      <div className="font-semibold text-white">
                        {group.productName}
                      </div>
                      <div className="mt-1 font-mono text-xs text-slate-500">
                        {group.productInternalCode}
                      </div>
                    </Td>
                    <Td>
                      {group.variationCount > 0 ? (
                        group.variationCount
                      ) : (
                        <Badge tone="neutral">sem variação</Badge>
                      )}
                    </Td>
                    <Td
                      className={
                        group.minimumProfit >= 0
                          ? "font-semibold text-emerald-300"
                          : "font-semibold text-red-300"
                      }
                    >
                      {formatCurrencyBRL(group.minimumProfit)}
                    </Td>
                    <Td
                      className={
                        group.averageProfit >= 0
                          ? "font-semibold text-emerald-300"
                          : "font-semibold text-red-300"
                      }
                    >
                      {formatCurrencyBRL(group.averageProfit)}
                    </Td>
                    <Td
                      className={
                        group.maximumProfit >= 0
                          ? "font-semibold text-emerald-300"
                          : "font-semibold text-red-300"
                      }
                    >
                      {formatCurrencyBRL(group.maximumProfit)}
                    </Td>
                    <Td>{formatCurrencyBRL(group.averageCost)}</Td>
                    <Td>
                      <div>{group.highestMarginLabel}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatPercent(group.highestMarginPercent)}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {group.needsReviewCount > 0 ? (
                          <Badge tone="warning">
                            {group.needsReviewCount} revisar
                          </Badge>
                        ) : (
                          <Badge tone="success">ok</Badge>
                        )}
                        {group.pendingCostCount > 0 && (
                          <Badge tone="warning">custo pendente</Badge>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          <Table>
            <thead>
              <tr>
                <Th>Produto pai</Th>
                <Th>Código</Th>
                <Th>Nome da variação</Th>
                <Th>Jogo/Categoria</Th>
                <Th>Venda</Th>
                <Th>Taxa %</Th>
                <Th>Líquido</Th>
                <Th>Custo</Th>
                <Th>Lucro</Th>
                <Th>Margem %</Th>
                <Th>Preço mínimo</Th>
                <Th>Estoque atual</Th>
                <Th>Estoque mínimo</Th>
                <Th>Tipo</Th>
                <Th>Fornecedor</Th>
                <Th>Status</Th>
                <Th>Revisão</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-900/45">
                  <Td>
                    <div className="font-semibold text-white">
                      {row.productName}
                    </div>
                    <div className="mt-1 font-mono text-xs text-slate-500">
                      {row.productInternalCode}
                    </div>
                  </Td>
                  <Td className="font-mono text-xs text-slate-400">
                    {row.variantCode ?? "-"}
                  </Td>
                  <Td>
                    <div className="font-semibold text-cyan">
                      {row.variantName ?? "Produto pai"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {row.scope === "product" && (
                        <Badge tone="neutral">sem variação</Badge>
                      )}
                      {row.pendingCost && (
                        <Badge tone="warning">custo pendente</Badge>
                      )}
                    </div>
                    {row.pendingCost && (
                      <div className="mt-1 max-w-[220px] text-xs text-amber-300">
                        Edite a variação para alterar lucro real; enquanto estiver pendente, o lucro usa custo 0.
                      </div>
                    )}
                  </Td>
                  <Td>
                    <div>{row.game ?? row.productCategory}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {row.productCategory}
                    </div>
                  </Td>
                  <Td>{formatCurrencyBRL(row.salePrice)}</Td>
                  <Td>{row.feePercent}%</Td>
                  <Td className="font-semibold text-cyan">
                    {formatCurrencyBRL(row.netValue)}
                  </Td>
                  <Td>{formatCurrencyBRL(row.unitCost)}</Td>
                  <Td
                    className={
                      row.profit >= 0
                        ? "font-semibold text-emerald-300"
                        : "font-semibold text-red-300"
                    }
                  >
                    {formatCurrencyBRL(row.profit)}
                  </Td>
                  <Td className={marginTone(row)}>
                    {formatPercent(row.marginPercent)}
                  </Td>
                  <Td>{formatCurrencyBRL(row.breakEvenPrice)}</Td>
                  <Td>{stockLabel(row)}</Td>
                  <Td>
                    {row.deliveryType === "manual" ||
                    row.deliveryType === "automatic"
                      ? row.stockMin
                      : "-"}
                  </Td>
                  <Td>
                    <Badge
                      tone={
                        row.deliveryType === "service"
                          ? "cyan"
                          : row.deliveryType === "on_demand"
                            ? "purple"
                            : "neutral"
                      }
                    >
                      {deliveryTypeLabels[row.deliveryType]}
                    </Badge>
                  </Td>
                  <Td className="max-w-[180px] truncate">
                    {row.supplierName ?? "-"}
                  </Td>
                  <Td>
                    <Badge tone={statusTone[row.status]}>
                      {statusLabels[row.status]}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {row.needsReview ? (
                        <Badge tone="warning">revisar</Badge>
                      ) : (
                        <Badge tone="success">ok</Badge>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title={
                          row.scope === "variant"
                            ? "Editar variação"
                            : "Produto sem variação"
                        }
                        disabled={row.scope !== "variant" || !canEditProducts}
                        onClick={() => void editVariant(row)}
                      >
                        <Edit3 size={15} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Abrir produto pai"
                        asChild
                      >
                        <Link to="/products">
                          <ExternalLink size={15} />
                        </Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Marcar como revisado"
                        disabled={
                          !row.productVariantId ||
                          !row.needsReview ||
                          !canEditProducts
                        }
                        onClick={() => void markReviewed(row)}
                      >
                        <CheckCircle2 size={15} />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          {!loading && rows.length === 0 && (
            <div className="grid place-items-center rounded-lg border border-dashed border-line bg-panelSoft py-12 text-center">
              <PackageSearch className="text-slate-600" size={34} />
              <div className="mt-3 font-semibold text-white">
                Nenhum item financeiro encontrado
              </div>
              <div className="mt-1 text-sm text-slate-400">
                Ajuste os filtros ou importe produtos e variações.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {variantPanel && (
        <ProductVariantsPanel
          product={variantPanel.product}
          initialVariantId={variantPanel.initialVariantId}
          canEditProducts={canEditProducts}
          canExportCsv={canExportCsv}
          onClose={() => setVariantPanel(null)}
        />
      )}
    </div>
  );
};
