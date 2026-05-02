import { formatCurrencyBRL, formatPercent } from "@hzdk/shared";
import {
  Archive,
  Ban,
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  Link2,
  PackageCheck,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Unlink
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AuditHistoryPanel } from "@renderer/components/audit/audit-history-panel";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { MetricCard as Metric } from "@renderer/components/ui/metric-card";
import { Table, Td, Th } from "@renderer/components/ui/table";
import { useAuth } from "@renderer/lib/auth-context";
import { downloadCsv } from "@renderer/lib/csv";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import type {
  ManualOrderInitialStatus,
  OrderChangeStatusInput,
  OrderCreateInput,
  OrderDetailResult,
  OrderListInput,
  OrderListResult,
  OrderRecord,
  OrderStatus,
  OrderUpdateData
} from "../../../shared/contracts";
import { manualOrderInitialStatusValues, orderStatusValues } from "../../../shared/contracts";

type BadgeTone = "success" | "warning" | "danger" | "purple" | "neutral" | "cyan";

interface OrderFormState {
  orderCode: string;
  externalOrderId: string;
  productId: string;
  productVariantId: string;
  inventoryItemId: string;
  buyerName: string;
  buyerContact: string;
  salePrice: string;
  unitCost: string;
  feePercent: string;
  status: ManualOrderInitialStatus;
  marketplaceUrl: string;
  notes: string;
}

const statusLabels: Record<OrderStatus, string> = {
  draft: "Rascunho",
  pending_payment: "Pagamento pendente",
  payment_confirmed: "Pagamento confirmado",
  awaiting_delivery: "Aguardando entrega",
  delivered: "Entregue / aguardando liberação",
  completed: "Concluído",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  mediation: "Mediação",
  problem: "Problema",
  archived: "Arquivado"
};

const statusTone: Record<OrderStatus, BadgeTone> = {
  draft: "neutral",
  pending_payment: "warning",
  payment_confirmed: "success",
  awaiting_delivery: "warning",
  delivered: "cyan",
  completed: "success",
  cancelled: "danger",
  refunded: "purple",
  mediation: "warning",
  problem: "danger",
  archived: "neutral"
};

const canMarkOrderDelivered = (order: Pick<OrderRecord, "status">): boolean =>
  order.status === "payment_confirmed" || order.status === "awaiting_delivery";

const canCompleteOrderManually = (order: Pick<OrderRecord, "status">): boolean =>
  order.status === "delivered";

const defaultFilters: OrderListInput = {
  search: null,
  status: "all",
  productId: null,
  category: null,
  dateFrom: null,
  dateTo: null,
  actionRequired: "all",
  sortBy: "date",
  sortDirection: "desc"
};

const emptyForm: OrderFormState = {
  orderCode: "",
  externalOrderId: "",
  productId: "",
  productVariantId: "",
  inventoryItemId: "",
  buyerName: "",
  buyerContact: "",
  salePrice: "",
  unitCost: "",
  feePercent: "13",
  status: "draft",
  marketplaceUrl: "",
  notes: ""
};

const parseNumber = (value: string): number | undefined => {
  const normalized = value.replace(",", ".").trim();
  if (normalized.length === 0) {
    return undefined;
  }

  return Number(normalized);
};

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const orderToForm = (order: OrderRecord): OrderFormState => ({
  orderCode: order.orderCode,
  externalOrderId: order.externalOrderId ?? "",
  productId: order.productId,
  productVariantId: order.productVariantId ?? "",
  inventoryItemId: order.inventoryItemId ?? "",
  buyerName: order.buyerName ?? "",
  buyerContact: order.buyerContact ?? "",
  salePrice: String(order.salePrice),
  unitCost: String(order.unitCost),
  feePercent: String(order.feePercent),
  status: manualOrderInitialStatusValues.includes(order.status as ManualOrderInitialStatus)
    ? (order.status as ManualOrderInitialStatus)
    : "draft",
  marketplaceUrl: order.marketplaceUrl ?? "",
  notes: order.notes ?? ""
});

const formToCreatePayload = (form: OrderFormState): OrderCreateInput => {
  const salePrice = parseNumber(form.salePrice);
  const unitCost = parseNumber(form.unitCost);
  const payload: OrderCreateInput = {
    orderCode: toNullable(form.orderCode),
    externalOrderId: toNullable(form.externalOrderId),
    marketplace: "gamemarket",
    productId: form.productId,
    productVariantId: toNullable(form.productVariantId),
    inventoryItemId: toNullable(form.inventoryItemId),
    buyerName: toNullable(form.buyerName),
    buyerContact: toNullable(form.buyerContact),
    feePercent: parseNumber(form.feePercent) ?? 13,
    status: form.status,
    marketplaceUrl: toNullable(form.marketplaceUrl),
    notes: toNullable(form.notes)
  };

  if (salePrice !== undefined) {
    payload.salePrice = salePrice;
  }

  if (unitCost !== undefined) {
    payload.unitCost = unitCost;
  }

  return payload;
};

const OrderForm = ({
  mode,
  form,
  data,
  setForm,
  onProductSelect,
  onVariantSelect,
  onClose,
  onSubmit,
  saving,
  error
}: {
  mode: "create" | "edit";
  form: OrderFormState;
  data: OrderListResult;
  setForm: (form: OrderFormState) => void;
  onProductSelect: (productId: string) => void;
  onVariantSelect: (variantId: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
}): JSX.Element => {
  const update = <K extends keyof OrderFormState>(key: K, value: OrderFormState[K]): void => {
    setForm({ ...form, [key]: value });
  };
  const variantsForProduct = data.productVariants.filter(
    (variant) => variant.productId === form.productId && variant.status !== "archived"
  );
  const compatibleInventory = data.inventoryItems.filter(
    (item) =>
      item.productId === form.productId &&
      (form.productVariantId ? item.productVariantId === form.productVariantId : !item.productVariantId) &&
      (item.status === "available" || item.status === "reserved" || item.id === form.inventoryItemId)
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60">
      <div className="drawer-panel h-full w-full max-w-4xl overflow-y-auto border-l border-line bg-background shadow-premium">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-background/95 px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
              {mode === "edit" ? "Editar pedido" : "Novo pedido"}
            </div>
            <h2 className="mt-1 text-xl font-bold text-white">Pedido manual GameMarket</h2>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} type="button">
              Cancelar
            </Button>
            <Button variant="primary" onClick={onSubmit} disabled={saving || !form.productId} type="button">
              {saving ? "Salvando..." : "Salvar pedido"}
            </Button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

          <div className="grid gap-4 lg:grid-cols-3">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Código do pedido</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.orderCode}
                onChange={(event) => update("orderCode", event.target.value)}
                placeholder="Gerado automaticamente"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Pedido externo</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.externalOrderId}
                onChange={(event) => update("externalOrderId", event.target.value)}
                placeholder="ID na GameMarket, se existir"
              />
            </label>
            {mode === "create" && (
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Status inicial</span>
                <select
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={form.status}
                  onChange={(event) => update("status", event.target.value as ManualOrderInitialStatus)}
                >
                  {manualOrderInitialStatusValues.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Produto obrigatório</span>
              <select
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.productId}
                onChange={(event) => {
                  setForm({ ...form, productId: event.target.value, productVariantId: "", inventoryItemId: "" });
                  onProductSelect(event.target.value);
                }}
              >
                <option value="">Selecione um produto</option>
                {data.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.internalCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Variação opcional</span>
              <select
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.productVariantId}
                onChange={(event) => {
                  setForm({ ...form, productVariantId: event.target.value, inventoryItemId: "" });
                  onVariantSelect(event.target.value);
                }}
                disabled={!form.productId || variantsForProduct.length === 0}
              >
                <option value="">Sem variação detectada</option>
                {variantsForProduct.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name} · {variant.variantCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Item de estoque compatível</span>
              <select
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.inventoryItemId}
                onChange={(event) => update("inventoryItemId", event.target.value)}
                disabled={!form.productId}
              >
                <option value="">Sem item vinculado</option>
                {compatibleInventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.inventoryCode} · {item.status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Comprador/apelido</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.buyerName}
                onChange={(event) => update("buyerName", event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Contato do comprador</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.buyerContact}
                onChange={(event) => update("buyerContact", event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Venda snapshot</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="number"
                min="0"
                step="0.01"
                value={form.salePrice}
                onChange={(event) => update("salePrice", event.target.value)}
                placeholder="Do produto"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Custo snapshot</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="number"
                min="0"
                step="0.01"
                value={form.unitCost}
                onChange={(event) => update("unitCost", event.target.value)}
                placeholder="Do produto"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Taxa %</span>
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
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Link GameMarket</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.marketplaceUrl}
                onChange={(event) => update("marketplaceUrl", event.target.value)}
                placeholder="https://..."
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-semibold text-slate-400">Observações internas</span>
            <textarea
              className="focus-ring min-h-28 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export const OrdersPage = (): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const [searchParams] = useSearchParams();
  const requestedOrderId = searchParams.get("orderId");
  const { session } = useAuth();
  const canEditOrders = session?.permissions.canEditOrders ?? false;
  const canExportCsv = session?.permissions.canExportCsv ?? false;
  const [filters, setFilters] = useState<OrderListInput>(defaultFilters);
  const [data, setData] = useState<OrderListResult>({
    items: [],
    summary: {
      total: 0,
      pendingAction: 0,
      problemOrMediation: 0,
      grossRevenue: 0,
      netRevenue: 0,
      estimatedProfit: 0
    },
    products: [],
    productVariants: [],
    inventoryItems: [],
    categories: []
  });
  const [selected, setSelected] = useState<OrderDetailResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<OrderFormState | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadOrders = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const result = await api.orders.list(filters);
      setData(result);
      if (requestedOrderId && selected?.order.id !== requestedOrderId) {
        setSelected(await api.orders.get(requestedOrderId));
        return;
      }
      if ((!selected || !result.items.some((order) => order.id === selected.order.id)) && result.items[0]) {
        setSelected(await api.orders.get(result.items[0].id));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar pedidos.");
    } finally {
      setLoading(false);
    }
  }, [api, filters, requestedOrderId, selected]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadOrders();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadOrders]);

  const openCreate = (): void => {
    setFormMode("create");
    setEditingId(null);
    setForm(emptyForm);
  };

  const openEdit = (order: OrderRecord): void => {
    setFormMode("edit");
    setEditingId(order.id);
    setForm(orderToForm(order));
  };

  const closeForm = (): void => {
    setForm(null);
    setEditingId(null);
    setError(null);
  };

  const loadProductSnapshot = async (productId: string): Promise<void> => {
    if (!productId) {
      return;
    }

    try {
      const product = await api.products.get(productId);
      setForm((current) =>
        current
          ? {
              ...current,
              inventoryItemId: "",
              salePrice: String(product.salePrice),
              unitCost: String(product.unitCost),
              feePercent: String(product.feePercent)
            }
          : current
      );
    } catch {
      setForm((current) => (current ? { ...current, inventoryItemId: "" } : current));
    }
  };

  const loadVariantSnapshot = (variantId: string): void => {
    if (!variantId) {
      return;
    }

    const variant = data.productVariants.find((item) => item.id === variantId);
    if (!variant) {
      return;
    }

    setForm((current) =>
      current
        ? {
            ...current,
            salePrice: String(variant.salePrice),
            unitCost: String(variant.unitCost)
          }
        : current
    );
  };

  const saveOrder = async (): Promise<void> => {
    if (!form) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = formToCreatePayload(form);
      if (editingId) {
        const updateData: OrderUpdateData = {
          orderCode: payload.orderCode,
          externalOrderId: payload.externalOrderId,
          marketplace: "gamemarket",
          productId: payload.productId,
          productVariantId: payload.productVariantId,
          inventoryItemId: payload.inventoryItemId,
          buyerName: payload.buyerName,
          buyerContact: payload.buyerContact,
          feePercent: payload.feePercent,
          marketplaceUrl: payload.marketplaceUrl,
          notes: payload.notes
        };
        if (payload.salePrice !== undefined) {
          updateData.salePrice = payload.salePrice;
        }
        if (payload.unitCost !== undefined) {
          updateData.unitCost = payload.unitCost;
        }
        await api.orders.update({ id: editingId, data: updateData });
      } else {
        await api.orders.create(payload);
      }

      closeForm();
      await loadOrders();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar pedido.");
    } finally {
      setSaving(false);
    }
  };

  const selectOrder = async (order: OrderRecord): Promise<void> => {
    setSelected(await api.orders.get(order.id));
  };

  const changeStatus = async (
    order: OrderRecord,
    status: OrderStatus,
    options: { manualCompletionConfirmed?: boolean } = {}
  ): Promise<void> => {
    setError(null);
    try {
      const notes =
        status === "problem"
          ? window.prompt("Observação para o problema do pedido:", order.notes ?? "") || order.notes
          : order.notes;
      const payload: OrderChangeStatusInput = {
        id: order.id,
        status,
        notes: notes ?? null
      };
      if (options.manualCompletionConfirmed !== undefined) {
        payload.manualCompletionConfirmed = options.manualCompletionConfirmed;
      }
      await api.orders.changeStatus(payload);
      await loadOrders();
      setSelected(await api.orders.get(order.id));
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Falha ao atualizar status do pedido.");
    }
  };

  const completeManually = async (order: OrderRecord): Promise<void> => {
    const confirmed = window.confirm(
      [
        `Concluir manualmente o pedido "${order.orderCode}"?`,
        "Use esta ação apenas se a garantia terminou ou se a GameMarket liberou os fundos.",
        "Se o status GameMarket ainda estiver processing, o pedido deixará de representar a liberação real da plataforma."
      ].join("\n\n")
    );

    if (!confirmed) {
      return;
    }

    await changeStatus(order, "completed", { manualCompletionConfirmed: true });
  };

  const archiveOrder = async (order: OrderRecord): Promise<void> => {
    if (!window.confirm(`Arquivar o pedido "${order.orderCode}"?`)) {
      return;
    }

    await api.orders.archive(order.id);
    await loadOrders();
  };

  const deleteOrder = async (order: OrderRecord): Promise<void> => {
    if (!window.confirm(`Excluir o pedido "${order.orderCode}"? Os eventos ficarão preservados sem apagar segredos.`)) {
      return;
    }

    await api.orders.delete(order.id);
    await loadOrders();
  };

  const unlinkInventory = async (order: OrderRecord): Promise<void> => {
    await api.orders.unlinkInventoryItem(order.id);
    await loadOrders();
  };

  const exportOrders = async (): Promise<void> => {
    const csv = await api.orders.exportCsv(filters);
    downloadCsv(csv.filename, csv.content);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-6">
        <Metric label="Pedidos" value={String(data.summary.total)} helper="Lista filtrada" tone="cyan" />
        <Metric label="Ação pendente" value={String(data.summary.pendingAction)} helper="Entrega, mediação ou revisão" tone="warning" />
        <Metric label="Problemas" value={String(data.summary.problemOrMediation)} helper="Mediação ou problema" tone="danger" />
        <Metric label="Bruto" value={formatCurrencyBRL(data.summary.grossRevenue)} helper="Valor de venda" tone="success" />
        <Metric label="Líquido" value={formatCurrencyBRL(data.summary.netRevenue)} helper="87% após taxa" tone="cyan" />
        <Metric label="Lucro" value={formatCurrencyBRL(data.summary.estimatedProfit)} helper="Snapshot por pedido" tone="purple" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_0.85fr]">
        <Card>
          <CardHeader className="items-start">
            <div>
              <CardTitle>Pedidos</CardTitle>
              <div className="mt-1 text-sm text-slate-400">Pedidos manuais persistidos no SQLite com eventos internos.</div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button variant="secondary" onClick={() => void exportOrders()} disabled={!canExportCsv}>
                <Download size={16} />
                Exportar CSV
              </Button>
              <Button variant="primary" onClick={openCreate} disabled={!canEditOrders}>
                <Plus size={16} />
                Novo pedido
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[1.3fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_0.6fr]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panelSoft pl-9 pr-3 text-sm text-white"
                  value={filters.search ?? ""}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value || null })}
                  placeholder="Buscar pedido, comprador, produto, status ou nota"
                />
              </label>
              <select
                className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
                value={filters.status}
                onChange={(event) => setFilters({ ...filters, status: event.target.value as OrderListInput["status"] })}
              >
                <option value="all">Todos status</option>
                {orderStatusValues.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
              </select>
              <select
                className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
                value={filters.productId ?? ""}
                onChange={(event) => setFilters({ ...filters, productId: event.target.value || null })}
              >
                <option value="">Todos produtos</option>
                {data.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
              <select
                className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
                value={filters.category ?? ""}
                onChange={(event) => setFilters({ ...filters, category: event.target.value || null })}
              >
                <option value="">Categoria/jogo</option>
                {data.categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
                value={filters.actionRequired}
                onChange={(event) =>
                  setFilters({ ...filters, actionRequired: event.target.value as OrderListInput["actionRequired"] })
                }
              >
                <option value="all">Toda ação</option>
                <option value="pending">Pendentes</option>
                <option value="clear">Sem ação</option>
              </select>
              <select
                className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
                value={filters.sortBy}
                onChange={(event) => setFilters({ ...filters, sortBy: event.target.value as OrderListInput["sortBy"] })}
              >
                <option value="date">Data</option>
                <option value="value">Valor</option>
                <option value="profit">Lucro</option>
                <option value="status">Status</option>
                <option value="product">Produto</option>
              </select>
              <select
                className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
                value={filters.sortDirection}
                onChange={(event) =>
                  setFilters({ ...filters, sortDirection: event.target.value as OrderListInput["sortDirection"] })
                }
              >
                <option value="desc">Desc</option>
                <option value="asc">Asc</option>
              </select>
            </div>

            {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

            <Table>
              <thead>
                <tr>
                  <Th>Pedido</Th>
                  <Th>Produto</Th>
                  <Th>Comprador</Th>
                  <Th>Valor</Th>
                  <Th>Lucro</Th>
                  <Th>Status</Th>
                  <Th>Ação</Th>
                  <Th>Estoque</Th>
                  <Th>Comandos</Th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((order) => (
                  <tr
                    key={order.id}
                    className="cursor-pointer hover:bg-slate-900/45"
                    onClick={() => void selectOrder(order)}
                  >
                    <Td>
                      <div className="font-mono text-xs text-slate-400">{order.orderCode}</div>
                      <div className="mt-1 text-xs text-slate-500">{new Date(order.createdAt).toLocaleString("pt-BR")}</div>
                    </Td>
                    <Td>
                      <div className="font-semibold text-white">{order.productNameSnapshot}</div>
                      <div className="mt-1 text-xs text-slate-500">{order.categorySnapshot}</div>
                      {order.productVariantName && <div className="mt-1 text-xs text-cyan">{order.productVariantName}</div>}
                      {order.variantPending && <div className="mt-1"><Badge tone="warning">Variação pendente</Badge></div>}
                    </Td>
                    <Td className="max-w-[160px] truncate">{order.buyerName ?? "-"}</Td>
                    <Td>{formatCurrencyBRL(order.salePrice)}</Td>
                    <Td>
                      <div className={order.profit >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>
                        {formatCurrencyBRL(order.profit)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{formatPercent(order.marginPercent)}</div>
                    </Td>
                    <Td>
                      <Badge tone={statusTone[order.status]}>{statusLabels[order.status]}</Badge>
                      {order.status === "delivered" && (
                        <div className="mt-1 text-xs text-cyan">Aguardando garantia/liberação</div>
                      )}
                      {order.externalStatus && (
                        <div className="mt-1 text-xs text-slate-500">GMK: {order.externalStatus}</div>
                      )}
                    </Td>
                    <Td>{order.actionRequired ? <Badge tone="warning">pendente</Badge> : <Badge>ok</Badge>}</Td>
                    <Td className="font-mono text-xs text-slate-400">{order.inventoryCode ?? "-"}</Td>
                    <Td onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" title="Editar" disabled={!canEditOrders} onClick={() => openEdit(order)}>
                          <Edit3 size={15} />
                        </Button>
                        {order.marketplaceUrl && (
                          <Button size="icon" variant="ghost" title="Abrir GameMarket" asChild>
                            <a href={order.marketplaceUrl} target="_blank" rel="noreferrer">
                              <ExternalLink size={15} />
                            </a>
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" title="Arquivar" disabled={!canEditOrders} onClick={() => void archiveOrder(order)}>
                          <Archive size={15} />
                        </Button>
                        <Button size="icon" variant="ghost" title="Excluir" disabled={!canEditOrders} onClick={() => void deleteOrder(order)}>
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>

            {!loading && data.items.length === 0 && (
              <div className="grid place-items-center rounded-lg border border-dashed border-line bg-panelSoft py-12 text-center">
                <PackageCheck className="text-slate-600" size={34} />
                <div className="mt-3 font-semibold text-white">Nenhum pedido encontrado</div>
                <div className="mt-1 text-sm text-slate-400">Crie um pedido manual ou ajuste os filtros.</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Detalhe e histórico</CardTitle>
            {selected?.order ? <Badge tone={statusTone[selected.order.status]}>{statusLabels[selected.order.status]}</Badge> : <Badge>vazio</Badge>}
          </CardHeader>
          <CardContent className="space-y-4">
            {selected ? (
              <>
                <div className="rounded-lg border border-line bg-panelSoft p-4">
                  <div className="font-semibold text-white">{selected.order.orderCode}</div>
                  <div className="mt-1 text-sm text-slate-400">{selected.order.productNameSnapshot}</div>
                  {selected.order.productVariantName && (
                    <div className="mt-1 text-sm text-cyan">{selected.order.productVariantName}</div>
                  )}
                  {selected.order.variantPending && (
                    <div className="mt-2">
                      <Badge tone="warning">Variação pendente</Badge>
                    </div>
                  )}
                  <div className="mt-3 grid gap-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Status local</span>
                      <span className="font-semibold text-slate-200">{statusLabels[selected.order.status]}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Status GameMarket</span>
                      <span className="font-mono text-xs text-slate-300">{selected.order.externalStatus ?? "-"}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Estoque</span>
                      <span className="font-mono text-xs text-slate-300">{selected.order.inventoryCode ?? "-"}</span>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-line bg-panel px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Bruto</div>
                      <div className="mt-1 text-sm font-semibold text-white">{formatCurrencyBRL(selected.order.salePrice)}</div>
                    </div>
                    <div className="rounded-md border border-cyan/25 bg-cyan/10 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-cyan/80">Líquido</div>
                      <div className="mt-1 text-sm font-semibold text-cyan">{formatCurrencyBRL(selected.order.netValue)}</div>
                    </div>
                    <div className="rounded-md border border-success/25 bg-success/10 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-300/80">Lucro</div>
                      <div className={selected.order.profit >= 0 ? "mt-1 text-sm font-semibold text-emerald-300" : "mt-1 text-sm font-semibold text-red-300"}>
                        {formatCurrencyBRL(selected.order.profit)}
                      </div>
                    </div>
                  </div>
                  {selected.order.status === "delivered" && (
                    <div className="mt-4 rounded-md border border-cyan/25 bg-cyan/10 p-3 text-sm text-cyan shadow-glowCyan">
                      <div className="font-semibold">Entregue — aguardando garantia/liberação</div>
                      <div className="mt-1 text-xs leading-5 text-slate-300">
                        A GameMarket pode levar até 7 dias para liberar/concluir o pedido. Status GameMarket:
                        {" "}
                        <span className="font-mono">{selected.order.externalStatus ?? "-"}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {canMarkOrderDelivered(selected.order) && (
                    <Button size="sm" variant="secondary" disabled={!canEditOrders} onClick={() => void changeStatus(selected.order, "delivered")}>
                      <PackageCheck size={14} />
                      Entregue
                    </Button>
                  )}
                  {canCompleteOrderManually(selected.order) && (
                    <Button size="sm" variant="secondary" disabled={!canEditOrders} onClick={() => void completeManually(selected.order)}>
                      <CheckCircle2 size={14} />
                      Concluir manualmente
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" disabled={!canEditOrders} onClick={() => void changeStatus(selected.order, "mediation")}>
                    <ShieldAlert size={14} />
                    Mediação
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!canEditOrders} onClick={() => void changeStatus(selected.order, "problem")}>
                    <TriangleAlert size={14} />
                    Problema
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!canEditOrders} onClick={() => void changeStatus(selected.order, "cancelled")}>
                    <Ban size={14} />
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!selected.order.inventoryItemId || !canEditOrders}
                    onClick={() => void unlinkInventory(selected.order)}
                  >
                    {selected.order.inventoryItemId ? <Unlink size={14} /> : <Link2 size={14} />}
                    Desvincular
                  </Button>
                </div>

                <AuditHistoryPanel
                  entityType="order"
                  entityId={selected.order.id}
                  title="Histórico do pedido"
                  compact
                />
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-line bg-panelSoft p-6 text-center text-sm text-slate-400">
                Selecione ou crie um pedido para ver o histórico.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {form && (
        <OrderForm
          mode={formMode}
          form={form}
          data={data}
          setForm={setForm}
          onProductSelect={(productId) => void loadProductSnapshot(productId)}
          onVariantSelect={loadVariantSnapshot}
          onClose={closeForm}
          onSubmit={() => void saveOrder()}
          saving={saving}
          error={error}
        />
      )}
    </div>
  );
};
