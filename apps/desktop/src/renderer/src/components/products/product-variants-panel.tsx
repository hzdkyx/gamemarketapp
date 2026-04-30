import {
  calculateProductFinancials,
  formatCurrencyBRL,
  formatPercent,
} from "@hzdk/shared";
import {
  Archive,
  Copy,
  Download,
  Edit3,
  Flag,
  Plus,
  Save,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Table, Td, Th } from "@renderer/components/ui/table";
import { downloadCsv } from "@renderer/lib/csv";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import type {
  DeliveryType,
  ProductRecord,
  ProductVariantCreateInput,
  ProductVariantRecord,
  ProductVariantStatus,
  ProductVariantUpdateData,
} from "../../../../shared/contracts";
import {
  deliveryTypeValues,
  productVariantStatusValues,
} from "../../../../shared/contracts";

interface VariantFormState {
  variantCode: string;
  name: string;
  description: string;
  salePrice: string;
  unitCost: string;
  feePercent: string;
  stockCurrent: string;
  stockMin: string;
  supplierName: string;
  supplierUrl: string;
  deliveryType: DeliveryType;
  status: ProductVariantStatus;
  notes: string;
  needsReview: boolean;
}

const deliveryTypeLabels: Record<DeliveryType, string> = {
  manual: "Manual",
  automatic: "Automática",
  on_demand: "Sob demanda",
  service: "Serviço",
};

const statusLabels: Record<ProductVariantStatus, string> = {
  active: "Ativa",
  paused: "Pausada",
  out_of_stock: "Sem estoque",
  archived: "Arquivada",
};

const statusTone: Record<
  ProductVariantStatus,
  "success" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  paused: "warning",
  out_of_stock: "danger",
  archived: "neutral",
};

const emptyVariantForm: VariantFormState = {
  variantCode: "",
  name: "",
  description: "",
  salePrice: "0",
  unitCost: "0",
  feePercent: "13",
  stockCurrent: "0",
  stockMin: "0",
  supplierName: "",
  supplierUrl: "",
  deliveryType: "manual",
  status: "active",
  notes: "",
  needsReview: false,
};

const parseNumber = (value: string): number => {
  const normalized = value.replace(",", ".").trim();
  return normalized.length > 0 ? Number(normalized) : 0;
};

const parseInteger = (value: string): number =>
  Math.max(0, Math.trunc(parseNumber(value)));

const toNullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const variantToForm = (variant: ProductVariantRecord): VariantFormState => ({
  variantCode: variant.variantCode,
  name: variant.name,
  description: variant.description ?? "",
  salePrice: String(variant.salePrice),
  unitCost: String(variant.unitCost),
  feePercent: String(variant.feePercent),
  stockCurrent: String(variant.stockCurrent),
  stockMin: String(variant.stockMin),
  supplierName: variant.supplierName ?? "",
  supplierUrl: variant.supplierUrl ?? "",
  deliveryType: variant.deliveryType,
  status: variant.status,
  notes: variant.notes ?? "",
  needsReview: variant.needsReview,
});

const formToCreatePayload = (
  productId: string,
  form: VariantFormState,
): ProductVariantCreateInput => ({
  productId,
  variantCode: toNullable(form.variantCode),
  name: form.name.trim(),
  description: toNullable(form.description),
  salePrice: parseNumber(form.salePrice),
  unitCost: parseNumber(form.unitCost),
  feePercent: parseNumber(form.feePercent) || 13,
  stockCurrent: parseInteger(form.stockCurrent),
  stockMin: parseInteger(form.stockMin),
  supplierName: toNullable(form.supplierName),
  supplierUrl: toNullable(form.supplierUrl),
  deliveryType: form.deliveryType,
  status: form.status,
  notes: toNullable(form.notes),
  source: "manual",
  needsReview: form.needsReview,
});

const formToUpdatePayload = (
  form: VariantFormState,
): ProductVariantUpdateData => ({
  variantCode: toNullable(form.variantCode),
  name: form.name.trim(),
  description: toNullable(form.description),
  salePrice: parseNumber(form.salePrice),
  unitCost: parseNumber(form.unitCost),
  feePercent: parseNumber(form.feePercent) || 13,
  stockCurrent: parseInteger(form.stockCurrent),
  stockMin: parseInteger(form.stockMin),
  supplierName: toNullable(form.supplierName),
  supplierUrl: toNullable(form.supplierUrl),
  deliveryType: form.deliveryType,
  status: form.status,
  notes: toNullable(form.notes),
  needsReview: form.needsReview,
});

const variantAlerts = (variant: ProductVariantRecord): string[] => {
  const alerts: string[] = [];
  if (variant.unitCost === 0 && variant.deliveryType !== "service") {
    alerts.push("Custo pendente");
  }
  if (variant.salePrice === 0) {
    alerts.push("Preço pendente");
  }
  if (
    (variant.deliveryType === "manual" ||
      variant.deliveryType === "automatic") &&
    variant.stockCurrent <= 0
  ) {
    alerts.push("Sem estoque");
  }
  return alerts;
};

export const ProductVariantsPanel = ({
  product,
  initialVariantId,
  canEditProducts,
  canExportCsv,
  onClose,
}: {
  product: ProductRecord;
  initialVariantId?: string | null;
  canEditProducts: boolean;
  canExportCsv: boolean;
  onClose: () => void;
}): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const [items, setItems] = useState<ProductVariantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<VariantFormState>(emptyVariantForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const initialVariantAppliedRef = useRef(false);
  const [saving, setSaving] = useState(false);

  const financials = useMemo(
    () =>
      calculateProductFinancials({
        salePrice: parseNumber(form.salePrice),
        unitCost: parseNumber(form.unitCost),
        feePercent: parseNumber(form.feePercent) || 13,
      }),
    [form.feePercent, form.salePrice, form.unitCost],
  );

  const loadVariants = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.productVariants.listByProduct(product.id);
      setItems(result.items);
      if (initialVariantId && !initialVariantAppliedRef.current) {
        const initialVariant = result.items.find(
          (item) => item.id === initialVariantId,
        );
        if (initialVariant) {
          setEditingId(initialVariant.id);
          setForm(variantToForm(initialVariant));
        }

        initialVariantAppliedRef.current = true;
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar variações.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, initialVariantId, product.id]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadVariants();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadVariants]);

  const update = <K extends keyof VariantFormState>(
    key: K,
    value: VariantFormState[K],
  ): void => {
    setForm({ ...form, [key]: value });
  };

  const resetForm = (): void => {
    setEditingId(null);
    initialVariantAppliedRef.current = true;
    setForm(emptyVariantForm);
  };

  const saveVariant = async (): Promise<void> => {
    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        await api.productVariants.update({
          id: editingId,
          data: formToUpdatePayload(form),
        });
      } else {
        await api.productVariants.create(formToCreatePayload(product.id, form));
      }

      resetForm();
      await loadVariants();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Falha ao salvar variação.",
      );
    } finally {
      setSaving(false);
    }
  };

  const duplicateVariant = async (
    variant: ProductVariantRecord,
  ): Promise<void> => {
    await api.productVariants.duplicate(variant.id);
    await loadVariants();
  };

  const archiveVariant = async (
    variant: ProductVariantRecord,
  ): Promise<void> => {
    await api.productVariants.archive(variant.id);
    await loadVariants();
  };

  const markNeedsReview = async (
    variant: ProductVariantRecord,
  ): Promise<void> => {
    await api.productVariants.markNeedsReview(variant.id);
    await loadVariants();
  };

  const exportVariants = async (): Promise<void> => {
    const csv = await api.productVariants.exportCsv(product.id);
    downloadCsv(csv.filename, csv.content);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-7xl overflow-y-auto border-l border-line bg-background shadow-premium">
        <div className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-line bg-background/95 px-6 py-5">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
              Variações do anúncio
            </div>
            <h2 className="mt-1 truncate text-xl font-bold text-white">
              {product.name}
            </h2>
            <div className="mt-1 text-sm text-slate-400">
              {product.internalCode}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => void exportVariants()}
              disabled={!canExportCsv}
            >
              <Download size={16} />
              Exportar variações CSV
            </Button>
            <Button variant="ghost" onClick={onClose}>
              <X size={16} />
              Fechar
            </Button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {editingId ? "Editar variação" : "Nova variação"}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  Líquido, lucro, margem e preço mínimo são recalculados com
                  taxa GameMarket.
                </div>
              </div>
              {editingId && (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={resetForm}
                >
                  <Plus size={14} />
                  Nova variação
                </Button>
              )}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.3fr_0.7fr_0.7fr_0.6fr_0.6fr_0.6fr]">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Código
                </span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={form.variantCode}
                  onChange={(event) =>
                    update("variantCode", event.target.value)
                  }
                  placeholder="Gerado se vazio"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Nome da variação
                </span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Venda
                </span>
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
                <span className="text-xs font-semibold text-slate-400">
                  Custo
                </span>
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
                <span className="text-xs font-semibold text-slate-400">
                  Estoque
                </span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  type="number"
                  min="0"
                  step="1"
                  value={form.stockCurrent}
                  onChange={(event) =>
                    update("stockCurrent", event.target.value)
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Mínimo
                </span>
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
                <span className="text-xs font-semibold text-slate-400">
                  Taxa %
                </span>
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
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_0.8fr_1fr_1fr]">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Entrega
                </span>
                <select
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={form.deliveryType}
                  onChange={(event) =>
                    update("deliveryType", event.target.value as DeliveryType)
                  }
                >
                  {deliveryTypeValues.map((deliveryType) => (
                    <option key={deliveryType} value={deliveryType}>
                      {deliveryTypeLabels[deliveryType]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Status
                </span>
                <select
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={form.status}
                  onChange={(event) =>
                    update("status", event.target.value as ProductVariantStatus)
                  }
                >
                  {productVariantStatusValues.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Fornecedor
                </span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={form.supplierName}
                  onChange={(event) =>
                    update("supplierName", event.target.value)
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Link fornecedor
                </span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={form.supplierUrl}
                  onChange={(event) =>
                    update("supplierUrl", event.target.value)
                  }
                  placeholder="https://..."
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr]">
              <div className="rounded-md border border-line bg-panel p-3">
                <div className="text-xs text-slate-500">Líquido</div>
                <div className="mt-1 font-bold text-cyan">
                  {formatCurrencyBRL(financials.netValue)}
                </div>
              </div>
              <div className="rounded-md border border-line bg-panel p-3">
                <div className="text-xs text-slate-500">Lucro</div>
                <div
                  className={
                    financials.estimatedProfit >= 0
                      ? "mt-1 font-bold text-emerald-300"
                      : "mt-1 font-bold text-red-300"
                  }
                >
                  {formatCurrencyBRL(financials.estimatedProfit)}
                </div>
              </div>
              <div className="rounded-md border border-line bg-panel p-3">
                <div className="text-xs text-slate-500">Margem</div>
                <div className="mt-1 font-bold text-white">
                  {formatPercent(financials.marginPercent)}
                </div>
              </div>
              <div className="rounded-md border border-line bg-panel p-3">
                <div className="text-xs text-slate-500">Preço mínimo</div>
                <div className="mt-1 font-bold text-white">
                  {formatCurrencyBRL(financials.minimumPrice)}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Descrição
                </span>
                <textarea
                  className="focus-ring min-h-20 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                  value={form.description}
                  onChange={(event) =>
                    update("description", event.target.value)
                  }
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Observações
                </span>
                <textarea
                  className="focus-ring min-h-20 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={form.needsReview}
                  onChange={(event) =>
                    update("needsReview", event.target.checked)
                  }
                />
                Precisa revisar
              </label>
              <Button
                variant="primary"
                type="button"
                disabled={
                  !canEditProducts || saving || form.name.trim().length === 0
                }
                onClick={() => void saveVariant()}
              >
                <Save size={16} />
                {saving
                  ? "Salvando..."
                  : editingId
                    ? "Salvar variação"
                    : "Criar variação"}
              </Button>
            </div>
          </div>

          <Table>
            <thead>
              <tr>
                <Th>Código</Th>
                <Th>Nome da variação</Th>
                <Th>Venda</Th>
                <Th>Custo</Th>
                <Th>Líquido</Th>
                <Th>Lucro</Th>
                <Th>Margem</Th>
                <Th>Estoque</Th>
                <Th>Entrega</Th>
                <Th>Fornecedor</Th>
                <Th>Status</Th>
                <Th>Revisão</Th>
                <Th>Ações</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((variant) => {
                const alerts = variantAlerts(variant);
                return (
                  <tr key={variant.id} className="hover:bg-slate-900/45">
                    <Td className="font-mono text-xs text-slate-400">
                      {variant.variantCode}
                    </Td>
                    <Td>
                      <div className="font-semibold text-white">
                        {variant.name}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {alerts.map((alert) => (
                          <Badge
                            key={alert}
                            tone={
                              alert === "Sem estoque" ? "danger" : "warning"
                            }
                          >
                            {alert}
                          </Badge>
                        ))}
                        {variant.deliveryType === "on_demand" && (
                          <Badge tone="purple">sob demanda</Badge>
                        )}
                        {variant.deliveryType === "service" && (
                          <Badge tone="cyan">serviço</Badge>
                        )}
                      </div>
                    </Td>
                    <Td>{formatCurrencyBRL(variant.salePrice)}</Td>
                    <Td>{formatCurrencyBRL(variant.unitCost)}</Td>
                    <Td className="font-semibold text-cyan">
                      {formatCurrencyBRL(variant.netValue)}
                    </Td>
                    <Td
                      className={
                        variant.estimatedProfit >= 0
                          ? "font-semibold text-emerald-300"
                          : "font-semibold text-red-300"
                      }
                    >
                      {formatCurrencyBRL(variant.estimatedProfit)}
                    </Td>
                    <Td>{formatPercent(variant.marginPercent)}</Td>
                    <Td>
                      {variant.deliveryType === "service" ? (
                        <span className="text-cyan">ilimitado</span>
                      ) : (
                        <span>
                          {variant.stockCurrent}/{variant.stockMin}
                        </span>
                      )}
                    </Td>
                    <Td>{deliveryTypeLabels[variant.deliveryType]}</Td>
                    <Td className="max-w-[180px] truncate">
                      {variant.supplierName ?? "-"}
                    </Td>
                    <Td>
                      <Badge tone={statusTone[variant.status]}>
                        {statusLabels[variant.status]}
                      </Badge>
                    </Td>
                    <Td>
                      {variant.needsReview ? (
                        <Badge tone="warning">revisar</Badge>
                      ) : (
                        <Badge tone="success">ok</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Editar"
                          disabled={!canEditProducts}
                          onClick={() => {
                            setEditingId(variant.id);
                            setForm(variantToForm(variant));
                          }}
                        >
                          <Edit3 size={15} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Duplicar"
                          disabled={!canEditProducts}
                          onClick={() => void duplicateVariant(variant)}
                        >
                          <Copy size={15} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Marcar revisão"
                          disabled={!canEditProducts || variant.needsReview}
                          onClick={() => void markNeedsReview(variant)}
                        >
                          <Flag size={15} />
                        </Button>
                        {variant.status !== "archived" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Arquivar"
                            disabled={!canEditProducts}
                            onClick={() => void archiveVariant(variant)}
                          >
                            <Archive size={15} />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          {!loading && items.length === 0 && (
            <div className="rounded-lg border border-dashed border-line bg-panelSoft p-8 text-center text-sm text-slate-400">
              Nenhuma variação operacional cadastrada para este anúncio.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
