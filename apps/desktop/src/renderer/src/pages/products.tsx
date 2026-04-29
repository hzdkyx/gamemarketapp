import { calculateProductFinancials, formatCurrencyBRL, formatPercent } from "@hzdk/shared";
import {
  Archive,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Layers3,
  PackageX,
  Plus,
  Search,
  Trash2,
  TrendingUp
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { Table, Td, Th } from "@renderer/components/ui/table";
import { ProductVariantsPanel } from "@renderer/components/products/product-variants-panel";
import { useAuth } from "@renderer/lib/auth-context";
import { downloadCsv } from "@renderer/lib/csv";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import type {
  DeliveryType,
  ProductCreateInput,
  ProductListInput,
  ProductListResult,
  ProductRecord,
  ProductStatus
} from "../../../shared/contracts";
import { deliveryTypeValues, productStatusValues } from "../../../shared/contracts";

type BadgeTone = "success" | "warning" | "danger" | "purple" | "neutral" | "cyan";

interface ProductFormState {
  internalCode: string;
  name: string;
  category: string;
  game: string;
  platform: string;
  listingUrl: string;
  salePrice: string;
  unitCost: string;
  feePercent: string;
  stockCurrent: string;
  stockMin: string;
  status: ProductStatus;
  deliveryType: DeliveryType;
  supplierId: string;
  notes: string;
}

const productStatusLabels: Record<ProductStatus, string> = {
  active: "Ativo",
  paused: "Pausado",
  out_of_stock: "Sem estoque",
  on_demand: "Sob demanda",
  archived: "Arquivado"
};

const deliveryTypeLabels: Record<DeliveryType, string> = {
  manual: "Manual",
  automatic: "Automática",
  on_demand: "Sob demanda",
  service: "Serviço"
};

const productStatusTone: Record<ProductStatus, BadgeTone> = {
  active: "success",
  paused: "warning",
  out_of_stock: "danger",
  on_demand: "purple",
  archived: "neutral"
};

const defaultFilters: ProductListInput = {
  search: null,
  status: "all",
  category: null,
  stock: "all",
  sortBy: "name",
  sortDirection: "asc"
};

const emptyForm: ProductFormState = {
  internalCode: "",
  name: "",
  category: "",
  game: "",
  platform: "",
  listingUrl: "",
  salePrice: "0",
  unitCost: "0",
  feePercent: "13",
  stockCurrent: "0",
  stockMin: "1",
  status: "active",
  deliveryType: "manual",
  supplierId: "",
  notes: ""
};

const parseNumber = (value: string): number => {
  const normalized = value.replace(",", ".").trim();
  return normalized.length > 0 ? Number(normalized) : 0;
};

const parseInteger = (value: string): number => Math.max(0, Math.trunc(parseNumber(value)));

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const productToForm = (product: ProductRecord): ProductFormState => ({
  internalCode: product.internalCode,
  name: product.name,
  category: product.category,
  game: product.game ?? "",
  platform: product.platform ?? "",
  listingUrl: product.listingUrl ?? "",
  salePrice: String(product.salePrice),
  unitCost: String(product.unitCost),
  feePercent: String(product.feePercent),
  stockCurrent: String(product.stockCurrent),
  stockMin: String(product.stockMin),
  status: product.status,
  deliveryType: product.deliveryType,
  supplierId: product.supplierId ?? "",
  notes: product.notes ?? ""
});

const formToPayload = (form: ProductFormState): ProductCreateInput => ({
  internalCode: toNullable(form.internalCode),
  name: form.name.trim(),
  category: toNullable(form.category),
  game: toNullable(form.game),
  platform: toNullable(form.platform),
  listingUrl: toNullable(form.listingUrl),
  salePrice: parseNumber(form.salePrice),
  unitCost: parseNumber(form.unitCost),
  feePercent: parseNumber(form.feePercent) || 13,
  stockCurrent: parseInteger(form.stockCurrent),
  stockMin: parseInteger(form.stockMin),
  status: form.status,
  deliveryType: form.deliveryType,
  supplierId: toNullable(form.supplierId),
  notes: toNullable(form.notes)
});

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

const ProductForm = ({
  mode,
  form,
  setForm,
  onClose,
  onSubmit,
  saving,
  error
}: {
  mode: "create" | "edit" | "duplicate";
  form: ProductFormState;
  setForm: (form: ProductFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
}): JSX.Element => {
  const financials = useMemo(
    () =>
      calculateProductFinancials({
        salePrice: parseNumber(form.salePrice),
        unitCost: parseNumber(form.unitCost),
        feePercent: parseNumber(form.feePercent) || 13
      }),
    [form.feePercent, form.salePrice, form.unitCost]
  );
  const stockCurrent = parseInteger(form.stockCurrent);
  const stockMin = parseInteger(form.stockMin);
  const suggestsOutOfStock = stockCurrent <= 0 && form.status !== "out_of_stock";
  const lowStock = stockCurrent > 0 && stockCurrent <= stockMin;

  const update = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]): void => {
    setForm({ ...form, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-4xl overflow-y-auto border-l border-line bg-background shadow-premium">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-background/95 px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
              {mode === "edit" ? "Editar produto" : mode === "duplicate" ? "Duplicar produto" : "Novo produto"}
            </div>
            <h2 className="mt-1 text-xl font-bold text-white">Catálogo e precificação</h2>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} type="button">
              Cancelar
            </Button>
            <Button variant="primary" onClick={onSubmit} disabled={saving || form.name.trim().length === 0} type="button">
              {saving ? "Salvando..." : "Salvar produto"}
            </Button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

          <div className="grid gap-4 lg:grid-cols-3">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">ID interno</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.internalCode}
                onChange={(event) => update("internalCode", event.target.value)}
                placeholder="Gerado automaticamente"
              />
            </label>
            <label className="space-y-2 lg:col-span-2">
              <span className="text-xs font-semibold text-slate-400">Nome obrigatório</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Conta Smurf LoL BR"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Categoria</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.category}
                onChange={(event) => update("category", event.target.value)}
                placeholder="Contas"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Jogo</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.game}
                onChange={(event) => update("game", event.target.value)}
                placeholder="League of Legends"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Plataforma</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.platform}
                onChange={(event) => update("platform", event.target.value)}
                placeholder="BR / Steam / Mobile"
              />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1fr]">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Preço de venda</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="number"
                min="0"
                step="0.01"
                value={form.salePrice}
                onChange={(event) => update("salePrice", event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Custo unitário</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="number"
                min="0"
                step="0.01"
                value={form.unitCost}
                onChange={(event) => update("unitCost", event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Taxa GameMarket %</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="number"
                min="0"
                max="99"
                step="0.01"
                value={form.feePercent}
                onChange={(event) => update("feePercent", event.target.value)}
              />
            </label>
            <div className="rounded-md border border-line bg-panel p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan">
                <TrendingUp size={14} />
                Lucro automático
              </div>
              <div className="mt-2 text-lg font-bold text-emerald-300">
                {formatCurrencyBRL(financials.estimatedProfit)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <div className="rounded-md border border-line bg-panel p-3">
              <div className="text-xs text-slate-500">Valor líquido</div>
              <div className="mt-1 font-bold text-cyan">{formatCurrencyBRL(financials.netValue)}</div>
            </div>
            <div className="rounded-md border border-line bg-panel p-3">
              <div className="text-xs text-slate-500">Margem sobre venda</div>
              <div className="mt-1 font-bold text-white">{formatPercent(financials.marginPercent)}</div>
            </div>
            <div className="rounded-md border border-line bg-panel p-3">
              <div className="text-xs text-slate-500">Preço mínimo</div>
              <div className="mt-1 font-bold text-slate-200">{formatCurrencyBRL(financials.minimumPrice)}</div>
            </div>
            <div className="rounded-md border border-line bg-panel p-3">
              <div className="text-xs text-slate-500">Taxa aplicada</div>
              <div className="mt-1 font-bold text-slate-200">{form.feePercent || "13"}%</div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Estoque atual</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="number"
                min="0"
                step="1"
                value={form.stockCurrent}
                onChange={(event) => update("stockCurrent", event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Estoque mínimo</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="number"
                min="0"
                step="1"
                value={form.stockMin}
                onChange={(event) => update("stockMin", event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Status</span>
              <select
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.status}
                onChange={(event) => update("status", event.target.value as ProductStatus)}
              >
                {productStatusValues.map((status) => (
                  <option key={status} value={status}>
                    {productStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Entrega</span>
              <select
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.deliveryType}
                onChange={(event) => update("deliveryType", event.target.value as DeliveryType)}
              >
                {deliveryTypeValues.map((deliveryType) => (
                  <option key={deliveryType} value={deliveryType}>
                    {deliveryTypeLabels[deliveryType]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {(suggestsOutOfStock || lowStock) && (
            <div className="flex items-center justify-between gap-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-amber-200">
              <span>
                {suggestsOutOfStock
                  ? "Estoque zerado. O status sem estoque é recomendado, mas a decisão fica manual."
                  : "Produto abaixo do estoque mínimo configurado."}
              </span>
              {suggestsOutOfStock && (
                <Button size="sm" variant="ghost" type="button" onClick={() => update("status", "out_of_stock")}>
                  Usar sem estoque
                </Button>
              )}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Fornecedor</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.supplierId}
                onChange={(event) => update("supplierId", event.target.value)}
                placeholder="Fornecedor ou ID interno"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Link do anúncio</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.listingUrl}
                onChange={(event) => update("listingUrl", event.target.value)}
                placeholder="https://..."
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-semibold text-slate-400">Observações</span>
            <textarea
              className="focus-ring min-h-28 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
              placeholder="Notas internas do produto"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export const ProductsPage = (): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const { session } = useAuth();
  const canEditProducts = session?.permissions.canEditProducts ?? false;
  const canExportCsv = session?.permissions.canExportCsv ?? false;
  const [filters, setFilters] = useState<ProductListInput>(defaultFilters);
  const [data, setData] = useState<ProductListResult>({
    items: [],
    summary: {
      total: 0,
      active: 0,
      outOfStock: 0,
      lowStock: 0,
      averageEstimatedProfit: 0
    },
    categories: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit" | "duplicate">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [variantsProduct, setVariantsProduct] = useState<ProductRecord | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      setData(await api.products.list(filters));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar produtos.");
    } finally {
      setLoading(false);
    }
  }, [api, filters]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProducts();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadProducts]);

  const openCreate = (): void => {
    setFormMode("create");
    setEditingId(null);
    setForm(emptyForm);
  };

  const openEdit = (product: ProductRecord): void => {
    setFormMode("edit");
    setEditingId(product.id);
    setForm(productToForm(product));
  };

  const openDuplicate = (product: ProductRecord): void => {
    setFormMode("duplicate");
    setEditingId(null);
    setForm({
      ...productToForm(product),
      internalCode: `${product.internalCode}-COPY`,
      name: `${product.name} cópia`
    });
  };

  const closeForm = (): void => {
    setForm(null);
    setEditingId(null);
    setError(null);
  };

  const saveProduct = async (): Promise<void> => {
    if (!form) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = formToPayload(form);
      if (editingId) {
        await api.products.update({ id: editingId, data: payload });
      } else {
        await api.products.create(payload);
      }

      closeForm();
      await loadProducts();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar produto.");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (product: ProductRecord): Promise<void> => {
    if (!window.confirm(`Excluir o produto "${product.name}"? Itens de estoque vinculados ficarão sem produto.`)) {
      return;
    }

    await api.products.delete(product.id);
    await loadProducts();
  };

  const archiveProduct = async (product: ProductRecord): Promise<void> => {
    await api.products.update({ id: product.id, data: { status: "archived" } });
    await loadProducts();
  };

  const exportProducts = async (): Promise<void> => {
    const csv = await api.products.exportCsv(filters);
    downloadCsv(csv.filename, csv.content);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-5">
        <Metric label="Total" value={String(data.summary.total)} helper="Produtos cadastrados" tone="cyan" />
        <Metric label="Ativos" value={String(data.summary.active)} helper="Visíveis para operação" tone="success" />
        <Metric label="Sem estoque" value={String(data.summary.outOfStock)} helper="Estoque atual zerado" tone="danger" />
        <Metric label="Estoque baixo" value={String(data.summary.lowStock)} helper="Acima de zero e no mínimo" tone="warning" />
        <Metric
          label="Lucro médio"
          value={formatCurrencyBRL(data.summary.averageEstimatedProfit)}
          helper="Estimativa por produto"
          tone="purple"
        />
      </div>

      <Card>
        <CardHeader className="items-start">
          <div>
            <CardTitle>Produtos</CardTitle>
            <div className="mt-1 text-sm text-slate-400">CRUD local com taxa GameMarket de 13% recalculada no main process.</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => void exportProducts()} disabled={!canExportCsv}>
              <Download size={16} />
              Exportar CSV
            </Button>
            <Button variant="primary" onClick={openCreate} disabled={!canEditProducts}>
              <Plus size={16} />
              Novo produto
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.8fr_0.6fr]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panelSoft pl-9 pr-3 text-sm text-white"
                value={filters.search ?? ""}
                onChange={(event) => setFilters({ ...filters, search: event.target.value || null })}
                placeholder="Buscar nome, jogo, categoria ou status"
              />
            </label>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value as ProductListInput["status"] })}
            >
              <option value="all">Todos os status</option>
              {productStatusValues.map((status) => (
                <option key={status} value={status}>
                  {productStatusLabels[status]}
                </option>
              ))}
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.category ?? ""}
              onChange={(event) => setFilters({ ...filters, category: event.target.value || null })}
            >
              <option value="">Todas categorias/jogos</option>
              {data.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.stock}
              onChange={(event) => setFilters({ ...filters, stock: event.target.value as ProductListInput["stock"] })}
            >
              <option value="all">Todo estoque</option>
              <option value="low">Estoque baixo</option>
              <option value="out">Sem estoque</option>
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.sortBy}
              onChange={(event) => setFilters({ ...filters, sortBy: event.target.value as ProductListInput["sortBy"] })}
            >
              <option value="name">Ordenar por nome</option>
              <option value="price">Ordenar por preço</option>
              <option value="profit">Ordenar por lucro</option>
              <option value="stock">Ordenar por estoque</option>
              <option value="status">Ordenar por status</option>
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.sortDirection}
              onChange={(event) =>
                setFilters({ ...filters, sortDirection: event.target.value as ProductListInput["sortDirection"] })
              }
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>

          {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

          <Table>
            <thead>
              <tr>
                <Th>ID interno</Th>
                <Th>Produto</Th>
                <Th>Jogo/Categoria</Th>
                <Th>Venda</Th>
                <Th>Líquido</Th>
                <Th>Lucro</Th>
                <Th>Estoque</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((product) => {
                const lowStock = product.stockCurrent <= product.stockMin;
                return (
                  <tr key={product.id} className="hover:bg-slate-900/45">
                    <Td className="font-mono text-xs text-slate-400">{product.internalCode}</Td>
                    <Td>
                      <div className="font-semibold text-white">{product.name}</div>
                      <div className="mt-1 max-w-[260px] truncate text-xs text-slate-500">{product.notes ?? product.platform ?? "-"}</div>
                    </Td>
                    <Td>
                      <div className="text-slate-200">{product.game ?? product.category}</div>
                      <div className="mt-1 text-xs text-slate-500">{product.category}</div>
                    </Td>
                    <Td>{formatCurrencyBRL(product.salePrice)}</Td>
                    <Td className="font-semibold text-cyan">{formatCurrencyBRL(product.netValue)}</Td>
                    <Td>
                      <div className={product.estimatedProfit >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>
                        {formatCurrencyBRL(product.estimatedProfit)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{formatPercent(product.marginPercent)}</div>
                    </Td>
                    <Td>
                      <span className={lowStock ? "font-semibold text-amber-300" : "text-slate-200"}>
                        {product.stockCurrent}/{product.stockMin}
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={productStatusTone[product.status]}>{productStatusLabels[product.status]}</Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" title="Editar" disabled={!canEditProducts} onClick={() => openEdit(product)}>
                          <Edit3 size={15} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Variações"
                          onClick={() => setVariantsProduct(product)}
                        >
                          <Layers3 size={15} />
                        </Button>
                        <Button size="icon" variant="ghost" title="Duplicar" disabled={!canEditProducts} onClick={() => openDuplicate(product)}>
                          <Copy size={15} />
                        </Button>
                        {product.listingUrl && (
                          <Button size="icon" variant="ghost" title="Abrir anúncio" asChild>
                            <a href={product.listingUrl} target="_blank" rel="noreferrer">
                              <ExternalLink size={15} />
                            </a>
                          </Button>
                        )}
                        {product.status !== "archived" && (
                          <Button size="icon" variant="ghost" title="Arquivar" disabled={!canEditProducts} onClick={() => void archiveProduct(product)}>
                            <Archive size={15} />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" title="Excluir" disabled={!canEditProducts} onClick={() => void deleteProduct(product)}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          {!loading && data.items.length === 0 && (
            <div className="grid place-items-center rounded-lg border border-dashed border-line bg-panelSoft py-12 text-center">
              <PackageX className="text-slate-600" size={34} />
              <div className="mt-3 font-semibold text-white">Nenhum produto encontrado</div>
              <div className="mt-1 text-sm text-slate-400">Crie um produto ou limpe os filtros atuais.</div>
            </div>
          )}
        </CardContent>
      </Card>

      {form && (
        <ProductForm
          mode={formMode}
          form={form}
          setForm={setForm}
          onClose={closeForm}
          onSubmit={() => void saveProduct()}
          saving={saving}
          error={error}
        />
      )}

      {variantsProduct && (
        <ProductVariantsPanel
          product={variantsProduct}
          canEditProducts={canEditProducts}
          canExportCsv={canExportCsv}
          onClose={() => setVariantsProduct(null)}
        />
      )}
    </div>
  );
};
