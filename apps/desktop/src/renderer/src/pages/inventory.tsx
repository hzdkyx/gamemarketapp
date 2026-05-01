import { formatCurrencyBRL } from "@hzdk/shared";
import {
  Archive,
  Boxes,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Layers3,
  PackagePlus,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@renderer/components/ui/card";
import { MetricCard as Metric } from "@renderer/components/ui/metric-card";
import { Table, Td, Th } from "@renderer/components/ui/table";
import { useAuth } from "@renderer/lib/auth-context";
import { downloadCsv } from "@renderer/lib/csv";
import { getDesktopApi } from "@renderer/lib/desktop-api";
import type {
  DeliveryType,
  InventoryCreateInput,
  InventoryListInput,
  InventoryListResult,
  InventoryRecord,
  InventorySecretField,
  InventoryStatus,
  InventoryUpdateData,
  OperationalStockRecord,
  OperationalStockState,
  ProductStatus,
  ProductUpdateData,
  ProductVariantStatus,
  ProductVariantUpdateData
} from "../../../shared/contracts";
import {
  inventorySecretFieldValues,
  inventoryStatusValues,
  productStatusValues,
  productVariantStatusValues
} from "../../../shared/contracts";

type BadgeTone = "success" | "warning" | "danger" | "purple" | "neutral" | "cyan";

interface InventoryFormState {
  inventoryCode: string;
  productId: string;
  productVariantId: string;
  supplierId: string;
  purchaseCost: string;
  status: InventoryStatus;
  accountLogin: string;
  accountPassword: string;
  accountEmail: string;
  accountEmailPassword: string;
  accessNotes: string;
  publicNotes: string;
  boughtAt: string;
  soldAt: string;
  deliveredAt: string;
  orderId: string;
}

interface OperationalStockFormState {
  salePrice: string;
  unitCost: string;
  stockCurrent: string;
  stockMin: string;
  supplierName: string;
  supplierUrl: string;
  status: ProductStatus | ProductVariantStatus;
  needsReview: boolean;
}

type InventoryView = "operational" | "variations" | "protected";

const inventoryStatusLabels: Record<InventoryStatus, string> = {
  available: "Disponível",
  reserved: "Reservado",
  sold: "Vendido",
  delivered: "Entregue",
  problem: "Problema",
  refunded: "Reembolsado",
  archived: "Arquivado"
};

const inventoryStatusTone: Record<InventoryStatus, BadgeTone> = {
  available: "success",
  reserved: "warning",
  sold: "neutral",
  delivered: "cyan",
  problem: "danger",
  refunded: "purple",
  archived: "neutral"
};

const deliveryTypeLabels: Record<DeliveryType, string> = {
  manual: "Manual",
  automatic: "Automática",
  on_demand: "Sob demanda",
  service: "Serviço"
};

const stockStateLabels: Record<OperationalStockState, string> = {
  available: "Disponível",
  low_stock: "Estoque baixo",
  out_of_stock: "Sem estoque",
  service: "Serviço",
  on_demand: "Sob demanda"
};

const stockStateTone: Record<OperationalStockState, BadgeTone> = {
  available: "success",
  low_stock: "warning",
  out_of_stock: "danger",
  service: "cyan",
  on_demand: "purple"
};

const operationalStatusLabels: Record<OperationalStockRecord["status"], string> = {
  active: "Ativo",
  paused: "Pausado",
  out_of_stock: "Sem estoque",
  on_demand: "Sob demanda",
  archived: "Arquivado"
};

const secretLabels: Record<InventorySecretField, string> = {
  accountLogin: "Login",
  accountPassword: "Senha",
  accountEmail: "Email",
  accountEmailPassword: "Senha do email",
  accessNotes: "Notas de acesso"
};

const defaultFilters: InventoryListInput = {
  search: null,
  productId: null,
  category: null,
  status: "all",
  supplierId: null,
  sortDirection: "asc"
};

const emptyForm: InventoryFormState = {
  inventoryCode: "",
  productId: "",
  productVariantId: "",
  supplierId: "",
  purchaseCost: "0",
  status: "available",
  accountLogin: "",
  accountPassword: "",
  accountEmail: "",
  accountEmailPassword: "",
  accessNotes: "",
  publicNotes: "",
  boughtAt: new Date().toISOString().slice(0, 10),
  soldAt: "",
  deliveredAt: "",
  orderId: ""
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

const itemToForm = (item: InventoryRecord): InventoryFormState => ({
  inventoryCode: item.inventoryCode,
  productId: item.productId ?? "",
  productVariantId: item.productVariantId ?? "",
  supplierId: item.supplierId ?? "",
  purchaseCost: String(item.purchaseCost),
  status: item.status,
  accountLogin: "",
  accountPassword: "",
  accountEmail: "",
  accountEmailPassword: "",
  accessNotes: "",
  publicNotes: item.publicNotes ?? "",
  boughtAt: item.boughtAt?.slice(0, 10) ?? "",
  soldAt: item.soldAt?.slice(0, 10) ?? "",
  deliveredAt: item.deliveredAt?.slice(0, 10) ?? "",
  orderId: item.orderId ?? ""
});

const operationalItemToForm = (item: OperationalStockRecord): OperationalStockFormState => ({
  salePrice: String(item.salePrice),
  unitCost: String(item.unitCost),
  stockCurrent: String(item.stockCurrent),
  stockMin: String(item.stockMin),
  supplierName: item.supplierName ?? "",
  supplierUrl: item.supplierUrl ?? "",
  status: item.status,
  needsReview: item.needsReview
});

const formToCreatePayload = (form: InventoryFormState): InventoryCreateInput => ({
  inventoryCode: toNullable(form.inventoryCode),
  productId: toNullable(form.productId),
  productVariantId: toNullable(form.productVariantId),
  supplierId: toNullable(form.supplierId),
  purchaseCost: parseNumber(form.purchaseCost),
  status: form.status,
  accountLogin: toNullable(form.accountLogin),
  accountPassword: toNullable(form.accountPassword),
  accountEmail: toNullable(form.accountEmail),
  accountEmailPassword: toNullable(form.accountEmailPassword),
  accessNotes: toNullable(form.accessNotes),
  publicNotes: toNullable(form.publicNotes),
  boughtAt: toNullable(form.boughtAt),
  soldAt: toNullable(form.soldAt),
  deliveredAt: toNullable(form.deliveredAt),
  orderId: toNullable(form.orderId)
});

const InventoryForm = ({
  mode,
  form,
  products,
  productVariants,
  setForm,
  onClose,
  onSubmit,
  saving,
  error
}: {
  mode: "create" | "edit";
  form: InventoryFormState;
  products: InventoryListResult["products"];
  productVariants: InventoryListResult["productVariants"];
  setForm: (form: InventoryFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
}): JSX.Element => {
  const firstInputRef = useRef<HTMLInputElement>(null);
  const update = <K extends keyof InventoryFormState>(key: K, value: InventoryFormState[K]): void => {
    setForm({ ...form, [key]: value });
  };
  const variantsForProduct = productVariants.filter(
    (variant) => variant.productId === form.productId && variant.status !== "archived"
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      firstInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [mode]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="drawer-panel h-full w-full max-w-4xl overflow-y-auto border-l border-line bg-background shadow-premium">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-background/95 px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">
              {mode === "edit" ? "Editar item" : "Novo item"}
            </div>
            <h2 className="mt-1 text-xl font-bold text-white">Estoque protegido</h2>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} type="button">
              Cancelar
            </Button>
            <Button variant="primary" onClick={onSubmit} disabled={saving} type="button">
              {saving ? "Salvando..." : "Salvar item"}
            </Button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

          <div className="grid gap-4 lg:grid-cols-3">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">ID interno</span>
              <input
                ref={firstInputRef}
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.inventoryCode}
                onChange={(event) => update("inventoryCode", event.target.value)}
                placeholder="Gerado automaticamente"
              />
            </label>
            <label className="space-y-2 lg:col-span-2">
              <span className="text-xs font-semibold text-slate-400">Produto vinculado</span>
              <select
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.productId}
                onChange={(event) => setForm({ ...form, productId: event.target.value, productVariantId: "" })}
              >
                <option value="">Sem produto vinculado</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.internalCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 lg:col-span-2">
              <span className="text-xs font-semibold text-slate-400">Variação do anúncio</span>
              <select
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.productVariantId}
                onChange={(event) => update("productVariantId", event.target.value)}
                disabled={!form.productId || variantsForProduct.length === 0}
              >
                <option value="">Sem variação específica</option>
                {variantsForProduct.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.name} · {variant.variantCode}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Fornecedor</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.supplierId}
                onChange={(event) => update("supplierId", event.target.value)}
                placeholder="Fornecedor ou ID"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Custo de compra</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="number"
                min="0"
                step="0.01"
                value={form.purchaseCost}
                onChange={(event) => update("purchaseCost", event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Status</span>
              <select
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.status}
                onChange={(event) => update("status", event.target.value as InventoryStatus)}
              >
                {inventoryStatusValues.map((status) => (
                  <option key={status} value={status}>
                    {inventoryStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-line bg-panelSoft p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck size={16} className="text-cyan" />
              Dados sensíveis
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {mode === "edit"
                ? "Campos em branco preservam os valores criptografados atuais."
                : "Esses dados serão criptografados no processo principal antes de ir para o SQLite."}
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Login</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={form.accountLogin}
                  onChange={(event) => update("accountLogin", event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Senha</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  type="password"
                  value={form.accountPassword}
                  onChange={(event) => update("accountPassword", event.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Email</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  value={form.accountEmail}
                  onChange={(event) => update("accountEmail", event.target.value)}
                  autoComplete="off"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">Senha do email</span>
                <input
                  className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                  type="password"
                  value={form.accountEmailPassword}
                  onChange={(event) => update("accountEmailPassword", event.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </div>
            <label className="mt-4 block space-y-2">
              <span className="text-xs font-semibold text-slate-400">Notas protegidas</span>
              <textarea
                className="focus-ring min-h-24 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
                value={form.accessNotes}
                onChange={(event) => update("accessNotes", event.target.value)}
              />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Compra</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="date"
                value={form.boughtAt}
                onChange={(event) => update("boughtAt", event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Venda</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="date"
                value={form.soldAt}
                onChange={(event) => update("soldAt", event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Entrega</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                type="date"
                value={form.deliveredAt}
                onChange={(event) => update("deliveredAt", event.target.value)}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Pedido futuro</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.orderId}
                onChange={(event) => update("orderId", event.target.value)}
                placeholder="orderId local"
              />
            </label>
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-semibold text-slate-400">Observações públicas</span>
            <textarea
              className="focus-ring min-h-24 w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-white"
              value={form.publicNotes}
              onChange={(event) => update("publicNotes", event.target.value)}
            />
          </label>
        </div>
      </div>
    </div>,
    document.body
  );
};

const OperationalStockForm = ({
  item,
  form,
  setForm,
  onClose,
  onSubmit,
  saving,
  error
}: {
  item: OperationalStockRecord;
  form: OperationalStockFormState;
  setForm: (form: OperationalStockFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  error: string | null;
}): JSX.Element => {
  const isVariant = item.scope === "variant";
  const statusValues = isVariant ? productVariantStatusValues : productStatusValues;
  const firstInputRef = useRef<HTMLInputElement>(null);
  const update = <K extends keyof OperationalStockFormState>(key: K, value: OperationalStockFormState[K]): void => {
    setForm({ ...form, [key]: value });
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      firstInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [item.id]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="drawer-panel h-full w-full max-w-3xl overflow-y-auto border-l border-line bg-background shadow-premium">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-background/95 px-6 py-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">Editar estoque operacional</div>
            <h2 className="mt-1 text-xl font-bold text-white">{isVariant ? item.productVariantName : item.productName}</h2>
            <div className="mt-1 text-sm text-slate-400">
              {isVariant
                ? "Esta linha atualiza a variação que aparece no estoque e no lucro real."
                : "Esta linha atualiza o produto pai sem variação ativa."}
            </div>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} type="button">
              Cancelar
            </Button>
            <Button variant="primary" onClick={onSubmit} disabled={saving} type="button">
              {saving ? "Salvando..." : "Salvar estoque"}
            </Button>
          </div>
        </div>

        <div className="space-y-5 p-6">
          {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

          <div className="rounded-md border border-line bg-panelSoft p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Contexto</div>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <div className="text-xs text-slate-500">Produto pai</div>
                <div className="mt-1 font-semibold text-white">{item.productName}</div>
                <div className="mt-1 font-mono text-xs text-slate-500">{item.productInternalCode}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Variação</div>
                <div className="mt-1 font-semibold text-cyan">{item.productVariantName ?? "Produto pai sem variação"}</div>
                <div className="mt-1 font-mono text-xs text-slate-500">{item.productVariantCode ?? item.productId}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Preço de venda</span>
              <input
                ref={firstInputRef}
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
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Fornecedor da variação</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.supplierName}
                onChange={(event) => update("supplierName", event.target.value)}
                placeholder={isVariant ? "Fornecedor operacional" : "Fornecedor ou ID interno"}
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">URL do fornecedor</span>
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.supplierUrl}
                onChange={(event) => update("supplierUrl", event.target.value)}
                disabled={!isVariant}
                placeholder={isVariant ? "https://..." : "Apenas em variações"}
              />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold text-slate-400">Status</span>
              <select
                className="focus-ring h-10 w-full rounded-md border border-line bg-panel px-3 text-sm text-white"
                value={form.status}
                onChange={(event) => update("status", event.target.value as ProductStatus | ProductVariantStatus)}
              >
                {statusValues.map((status) => (
                  <option key={status} value={status}>
                    {operationalStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-3 rounded-md border border-line bg-panel px-3 py-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={form.needsReview}
                disabled={!isVariant}
                onChange={(event) => update("needsReview", event.target.checked)}
              />
              Needs review da variação
            </label>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const SecretPanel = ({
  item,
  values,
  onReveal,
  onCopy,
  onClose
}: {
  item: InventoryRecord;
  values: Partial<Record<InventorySecretField, string>>;
  onReveal: (field: InventorySecretField) => void;
  onCopy: (value: string) => void;
  onClose: () => void;
}): JSX.Element => {
  const hasSecret: Record<InventorySecretField, boolean> = {
    accountLogin: item.hasAccountLogin,
    accountPassword: item.hasAccountPassword,
    accountEmail: item.hasAccountEmail,
    accountEmailPassword: item.hasAccountEmailPassword,
    accessNotes: item.hasAccessNotes
  };

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6">
      <div className="modal-panel w-full max-w-2xl rounded-lg border border-line bg-background shadow-premium">
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">Revelação controlada</div>
            <h2 className="mt-1 text-lg font-bold text-white">{item.inventoryCode}</h2>
            <div className="mt-1 text-sm text-slate-400">{item.productName ?? "Sem produto vinculado"}</div>
          </div>
          <Button variant="ghost" onClick={onClose}>
            <EyeOff size={16} />
            Fechar
          </Button>
        </div>
        <div className="space-y-3 p-5">
          <div className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-amber-200">
            Revele apenas durante entrega ou suporte. Os dados aparecem no renderer somente após confirmação.
          </div>
          {inventorySecretFieldValues.map((field) => {
            const value = values[field];
            return (
              <div key={field} className="flex items-center justify-between gap-4 rounded-md border border-line bg-panel p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">{secretLabels[field]}</div>
                  <div className="mt-1 break-all font-mono text-xs text-slate-400">
                    {value ? value : hasSecret[field] ? "••••••••••••" : "Não cadastrado"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="secondary" disabled={!hasSecret[field]} onClick={() => onReveal(field)}>
                    <Eye size={14} />
                    Revelar
                  </Button>
                  <Button size="sm" variant="ghost" disabled={!value} onClick={() => value && onCopy(value)}>
                    <Copy size={14} />
                    Copiar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};

export const InventoryPage = (): JSX.Element => {
  const api = useMemo(() => getDesktopApi(), []);
  const { session } = useAuth();
  const canEditInventory = session?.permissions.canEditInventory ?? false;
  const canEditProducts = session?.permissions.canEditProducts ?? false;
  const canExportCsv = session?.permissions.canExportCsv ?? false;
  const canRevealSecrets = session?.permissions.canRevealSecrets ?? false;
  const [filters, setFilters] = useState<InventoryListInput>(defaultFilters);
  const [data, setData] = useState<InventoryListResult>({
    items: [],
    summary: {
      available: 0,
      sold: 0,
      problem: 0,
      totalCost: 0,
      potentialProfit: 0
    },
    protectedSummary: {
      available: 0,
      sold: 0,
      problem: 0,
      totalCost: 0,
      potentialProfit: 0
    },
    operationalItems: [],
    operationalSummary: {
      available: 0,
      sold: 0,
      problem: 0,
      totalCost: 0,
      potentialProfit: 0,
      lowStock: 0,
      outOfStock: 0,
      productRows: 0,
      variantRows: 0
    },
    products: [],
    productVariants: [],
    suppliers: [],
    categories: []
  });
  const [activeView, setActiveView] = useState<InventoryView>("operational");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<InventoryFormState | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [operationalItem, setOperationalItem] = useState<OperationalStockRecord | null>(null);
  const [operationalForm, setOperationalForm] = useState<OperationalStockFormState | null>(null);
  const [operationalSaving, setOperationalSaving] = useState(false);
  const [secretItem, setSecretItem] = useState<InventoryRecord | null>(null);
  const [secretValues, setSecretValues] = useState<Partial<Record<InventorySecretField, string>>>({});
  const operationalEditTriggerRef = useRef<HTMLElement | null>(null);

  const loadInventory = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      setData(await api.inventory.list(filters));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar estoque.");
    } finally {
      setLoading(false);
    }
  }, [api, filters]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadInventory();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadInventory]);

  const openCreate = (): void => {
    setFormMode("create");
    setEditingId(null);
    setForm(emptyForm);
  };

  const openEdit = (item: InventoryRecord): void => {
    setFormMode("edit");
    setEditingId(item.id);
    setForm(itemToForm(item));
  };

  const closeForm = (): void => {
    setForm(null);
    setEditingId(null);
    setError(null);
  };

  const openOperationalEdit = (item: OperationalStockRecord): void => {
    operationalEditTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOperationalItem(item);
    setOperationalForm(operationalItemToForm(item));
    setError(null);
  };

  const closeOperationalForm = (): void => {
    setOperationalItem(null);
    setOperationalForm(null);
    setError(null);
    const elementToRestore = operationalEditTriggerRef.current;
    window.setTimeout(() => {
      elementToRestore?.focus();
    }, 0);
  };

  const saveOperationalStock = async (): Promise<void> => {
    if (!operationalItem || !operationalForm) {
      return;
    }

    setOperationalSaving(true);
    setError(null);

    try {
      if (operationalItem.scope === "variant") {
        const variantPayload: ProductVariantUpdateData = {
          salePrice: parseNumber(operationalForm.salePrice),
          unitCost: parseNumber(operationalForm.unitCost),
          stockCurrent: parseInteger(operationalForm.stockCurrent),
          stockMin: parseInteger(operationalForm.stockMin),
          supplierName: toNullable(operationalForm.supplierName),
          supplierUrl: toNullable(operationalForm.supplierUrl),
          status: operationalForm.status as ProductVariantStatus,
          needsReview: operationalForm.needsReview
        };

        await api.productVariants.update({
          id: operationalItem.productVariantId ?? operationalItem.id,
          data: variantPayload
        });
      } else {
        const productPayload: ProductUpdateData = {
          salePrice: parseNumber(operationalForm.salePrice),
          unitCost: parseNumber(operationalForm.unitCost),
          stockCurrent: parseInteger(operationalForm.stockCurrent),
          stockMin: parseInteger(operationalForm.stockMin),
          supplierId: toNullable(operationalForm.supplierName),
          status: operationalForm.status as ProductStatus
        };

        await api.products.update({
          id: operationalItem.productId,
          data: productPayload
        });
      }

      closeOperationalForm();
      await loadInventory();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar estoque operacional.");
    } finally {
      setOperationalSaving(false);
    }
  };

  const saveInventory = async (): Promise<void> => {
    if (!form) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = formToCreatePayload(form);
      if (editingId) {
        const updatePayload: InventoryUpdateData = {
          inventoryCode: payload.inventoryCode,
          productId: payload.productId,
          productVariantId: payload.productVariantId,
          supplierId: payload.supplierId,
          purchaseCost: payload.purchaseCost,
          status: payload.status,
          publicNotes: payload.publicNotes,
          boughtAt: payload.boughtAt,
          soldAt: payload.soldAt,
          deliveredAt: payload.deliveredAt,
          orderId: payload.orderId
        };
        const accountLogin = toNullable(form.accountLogin);
        const accountPassword = toNullable(form.accountPassword);
        const accountEmail = toNullable(form.accountEmail);
        const accountEmailPassword = toNullable(form.accountEmailPassword);
        const accessNotes = toNullable(form.accessNotes);

        if (accountLogin) updatePayload.accountLogin = accountLogin;
        if (accountPassword) updatePayload.accountPassword = accountPassword;
        if (accountEmail) updatePayload.accountEmail = accountEmail;
        if (accountEmailPassword) updatePayload.accountEmailPassword = accountEmailPassword;
        if (accessNotes) updatePayload.accessNotes = accessNotes;

        await api.inventory.update({
          id: editingId,
          data: updatePayload
        });
      } else {
        await api.inventory.create(payload);
      }

      closeForm();
      await loadInventory();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar item.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (item: InventoryRecord, status: InventoryStatus): Promise<void> => {
    await api.inventory.update({ id: item.id, data: { status } });
    await loadInventory();
  };

  const deleteItem = async (item: InventoryRecord): Promise<void> => {
    if (!window.confirm(`Excluir o item "${item.inventoryCode}"?`)) {
      return;
    }

    await api.inventory.delete(item.id);
    await loadInventory();
  };

  const openSecretPanel = (item: InventoryRecord): void => {
    const confirmed = window.confirm("Revelar dados protegidos só deve ser feito durante entrega ou suporte. Continuar?");
    if (confirmed) {
      setSecretItem(item);
      setSecretValues({});
    }
  };

  const revealSecret = async (field: InventorySecretField): Promise<void> => {
    if (!secretItem) {
      return;
    }

    const revealed = await api.inventory.revealSecret({ id: secretItem.id, field });
    setSecretValues({ ...secretValues, [field]: revealed.value });
  };

  const copySecret = (value: string): void => {
    void navigator.clipboard.writeText(value);
  };

  const closeSecretPanel = (): void => {
    setSecretItem(null);
    setSecretValues({});
  };

  const exportInventory = async (): Promise<void> => {
    const csv = await api.inventory.exportCsv(filters);
    downloadCsv(csv.filename, csv.content);
  };

  const operationalRows =
    activeView === "variations"
      ? data.operationalItems.filter((item) => item.scope === "variant")
      : data.operationalItems;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-5">
        <Metric
          label="Disponíveis"
          value={String(data.operationalSummary.available)}
          helper="Unidades reais em produtos/variações"
          tone="success"
        />
        <Metric
          label="Vendidos"
          value={String(data.operationalSummary.sold)}
          helper="Pedidos entregues ou concluídos"
          tone="cyan"
        />
        <Metric
          label="Problemas"
          value={String(data.operationalSummary.problem)}
          helper="Sem estoque, baixo ou revisão"
          tone="danger"
        />
        <Metric
          label="Custo em estoque"
          value={formatCurrencyBRL(data.operationalSummary.totalCost)}
          helper="Manual/automático disponível"
          tone="warning"
        />
        <Metric
          label="Lucro potencial"
          value={formatCurrencyBRL(data.operationalSummary.potentialProfit)}
          helper="Unidades reais disponíveis"
          tone="purple"
        />
      </div>

      <Card>
        <CardHeader className="items-start">
          <div>
            <CardTitle>Estoque operacional e protegido</CardTitle>
            <div className="mt-1 max-w-3xl text-sm text-slate-400">
              Itens protegidos são contas/licenças específicas. Estoque operacional usa produtos e variações para alertas e planejamento.
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button variant="secondary" onClick={() => void exportInventory()} disabled={!canExportCsv}>
              <Download size={16} />
              Exportar CSV
            </Button>
            <Button variant="primary" onClick={openCreate} disabled={!canEditInventory}>
              <PackagePlus size={16} />
              Novo item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={activeView === "operational" ? "primary" : "secondary"}
              onClick={() => setActiveView("operational")}
              type="button"
            >
              <Boxes size={14} />
              Estoque operacional
            </Button>
            <Button
              size="sm"
              variant={activeView === "variations" ? "primary" : "secondary"}
              onClick={() => setActiveView("variations")}
              type="button"
            >
              <Layers3 size={14} />
              Estoque por variação
            </Button>
            <Button
              size="sm"
              variant={activeView === "protected" ? "primary" : "secondary"}
              onClick={() => setActiveView("protected")}
              type="button"
            >
              <ShieldCheck size={14} />
              Itens protegidos
            </Button>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr_0.9fr_0.8fr_0.8fr_0.6fr]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
              <input
                className="focus-ring h-10 w-full rounded-md border border-line bg-panelSoft pl-9 pr-3 text-sm text-white"
                value={filters.search ?? ""}
                onChange={(event) => setFilters({ ...filters, search: event.target.value || null })}
                placeholder="Buscar ID, produto, fornecedor, status ou observação"
              />
            </label>
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
              <option value="">Categorias/jogos</option>
              {data.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value as InventoryListInput["status"] })}
            >
              <option value="all">Todos status</option>
              {inventoryStatusValues.map((status) => (
                <option key={status} value={status}>
                  {inventoryStatusLabels[status]}
                </option>
              ))}
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.supplierId ?? ""}
              onChange={(event) => setFilters({ ...filters, supplierId: event.target.value || null })}
            >
              <option value="">Fornecedores</option>
              {data.suppliers.map((supplier) => (
                <option key={supplier} value={supplier}>
                  {supplier}
                </option>
              ))}
            </select>
            <select
              className="focus-ring h-10 rounded-md border border-line bg-panelSoft px-3 text-sm text-white"
              value={filters.sortDirection}
              onChange={(event) =>
                setFilters({ ...filters, sortDirection: event.target.value as InventoryListInput["sortDirection"] })
              }
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>

          {error && <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">{error}</div>}

          {activeView !== "protected" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <Badge tone="cyan">{operationalRows.length} linha(s)</Badge>
                <span>{data.operationalSummary.productRows} produto(s) sem variação ativa</span>
                <span>·</span>
                <span>{data.operationalSummary.variantRows} variação(ões)</span>
                <span>·</span>
                <span>{data.operationalSummary.outOfStock} sem estoque operacional</span>
                <span>·</span>
                <span>{data.operationalSummary.lowStock} com estoque baixo</span>
              </div>

              <Table>
                <thead>
                  <tr>
                    <Th>Produto</Th>
                    <Th>Variação</Th>
                    <Th>Tipo de entrega</Th>
                    <Th>Estoque atual</Th>
                    <Th>Estoque mínimo</Th>
                    <Th>Custo unitário</Th>
                    <Th>Lucro potencial</Th>
                    <Th>Status</Th>
                    <Th>Needs review</Th>
                    <Th>Fornecedor</Th>
                    <Th>Ações rápidas</Th>
                  </tr>
                </thead>
                <tbody>
                  {operationalRows.map((item) => (
                    <tr key={`${item.scope}-${item.id}`} className="hover:bg-slate-900/45">
                      <Td>
                        <div className="font-semibold text-white">{item.productName}</div>
                        <div className="mt-1 font-mono text-xs text-slate-500">{item.productInternalCode}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.game ?? item.category}</div>
                      </Td>
                      <Td>
                        {item.productVariantName ? (
                          <>
                            <div className="font-semibold text-cyan">{item.productVariantName}</div>
                            <div className="mt-1 font-mono text-xs text-slate-500">{item.productVariantCode}</div>
                          </>
                        ) : (
                          <Badge tone="neutral">Produto pai</Badge>
                        )}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={stockStateTone[item.stockState]}>{stockStateLabels[item.stockState]}</Badge>
                          <Badge tone="neutral">{deliveryTypeLabels[item.deliveryType]}</Badge>
                        </div>
                      </Td>
                      <Td>
                        {item.deliveryType === "service" ? (
                          <span className="text-cyan">Serviço</span>
                        ) : item.deliveryType === "on_demand" ? (
                          <span className="text-violet-200">Sob demanda</span>
                        ) : (
                          <span className={item.stockState === "out_of_stock" ? "font-semibold text-red-300" : "text-slate-200"}>
                            {item.stockCurrent}
                          </span>
                        )}
                      </Td>
                      <Td>{item.deliveryType === "manual" || item.deliveryType === "automatic" ? item.stockMin : "-"}</Td>
                      <Td>{formatCurrencyBRL(item.unitCost)}</Td>
                      <Td className={item.potentialProfit >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>
                        {formatCurrencyBRL(item.potentialProfit)}
                      </Td>
                      <Td>
                        <Badge tone={item.status === "active" ? "success" : item.status === "out_of_stock" ? "danger" : "warning"}>
                          {operationalStatusLabels[item.status]}
                        </Badge>
                      </Td>
                      <Td>{item.needsReview ? <Badge tone="warning">revisar</Badge> : <Badge tone="success">ok</Badge>}</Td>
                      <Td className="max-w-[180px] truncate">{item.supplierName ?? "-"}</Td>
                      <Td>
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Editar estoque operacional"
                            disabled={!canEditProducts}
                            onClick={() => openOperationalEdit(item)}
                          >
                            <Edit3 size={15} />
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              {!loading && operationalRows.length === 0 && (
                <div className="grid place-items-center rounded-lg border border-dashed border-line bg-panelSoft py-12 text-center">
                  <Boxes className="text-slate-600" size={34} />
                  <div className="mt-3 font-semibold text-white">Nenhum estoque operacional encontrado</div>
                  <div className="mt-1 text-sm text-slate-400">Crie produtos/variações ou ajuste os filtros.</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <Badge tone="cyan">{data.items.length} item(ns) protegido(s)</Badge>
                <span>{data.protectedSummary.available} disponível(is)</span>
                <span>·</span>
                <span>{data.protectedSummary.sold} vendido(s)/entregue(s)</span>
                <span>·</span>
                <span>{data.protectedSummary.problem} problema(s)</span>
              </div>

              <Table>
                <thead>
                  <tr>
                    <Th>ID interno</Th>
                    <Th>Produto</Th>
                    <Th>Fornecedor</Th>
                    <Th>Custo</Th>
                    <Th>Lucro potencial</Th>
                    <Th>Status</Th>
                    <Th>Dados protegidos</Th>
                    <Th>Datas</Th>
                    <Th>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const hasAnySecret =
                      item.hasAccountLogin ||
                      item.hasAccountPassword ||
                      item.hasAccountEmail ||
                      item.hasAccountEmailPassword ||
                      item.hasAccessNotes;
                    return (
                      <tr key={item.id} className="hover:bg-slate-900/45">
                        <Td className="font-mono text-xs text-slate-400">{item.inventoryCode}</Td>
                        <Td>
                          <div className="font-semibold text-white">{item.productName ?? "Sem vínculo"}</div>
                          <div className="mt-1 font-mono text-xs text-slate-500">{item.productInternalCode ?? item.productId ?? "-"}</div>
                          {item.productVariantName && (
                            <div className="mt-1 text-xs text-cyan">{item.productVariantName}</div>
                          )}
                        </Td>
                        <Td>{item.supplierId ?? "-"}</Td>
                        <Td>{formatCurrencyBRL(item.purchaseCost)}</Td>
                        <Td className={item.potentialProfit >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-red-300"}>
                          {formatCurrencyBRL(item.potentialProfit)}
                        </Td>
                        <Td>
                          <Badge tone={inventoryStatusTone[item.status]}>{inventoryStatusLabels[item.status]}</Badge>
                        </Td>
                        <Td>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={!hasAnySecret || !canRevealSecrets}
                            onClick={() => openSecretPanel(item)}
                          >
                            <Eye size={14} />
                            {hasAnySecret ? "Revelar" : "Vazio"}
                          </Button>
                        </Td>
                        <Td className="text-xs text-slate-400">
                          <div>Compra: {item.boughtAt ? new Date(item.boughtAt).toLocaleDateString("pt-BR") : "-"}</div>
                          <div>Venda: {item.soldAt ? new Date(item.soldAt).toLocaleDateString("pt-BR") : "-"}</div>
                          <div>Entrega: {item.deliveredAt ? new Date(item.deliveredAt).toLocaleDateString("pt-BR") : "-"}</div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" title="Editar" disabled={!canEditInventory} onClick={() => openEdit(item)}>
                              <Edit3 size={15} />
                            </Button>
                            <Button size="icon" variant="ghost" title="Marcar vendido" disabled={!canEditInventory} onClick={() => void changeStatus(item, "sold")}>
                              <CheckCircle2 size={15} />
                            </Button>
                            <Button size="icon" variant="ghost" title="Marcar entregue" disabled={!canEditInventory} onClick={() => void changeStatus(item, "delivered")}>
                              <ShieldCheck size={15} />
                            </Button>
                            <Button size="icon" variant="ghost" title="Marcar problema" disabled={!canEditInventory} onClick={() => void changeStatus(item, "problem")}>
                              <TriangleAlert size={15} />
                            </Button>
                            <Button size="icon" variant="ghost" title="Arquivar" disabled={!canEditInventory} onClick={() => void changeStatus(item, "archived")}>
                              <Archive size={15} />
                            </Button>
                            <Button size="icon" variant="ghost" title="Excluir" disabled={!canEditInventory} onClick={() => void deleteItem(item)}>
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
                  <ShieldCheck className="text-slate-600" size={34} />
                  <div className="mt-3 font-semibold text-white">Nenhum item protegido encontrado</div>
                  <div className="mt-1 text-sm text-slate-400">Cadastre uma conta/licença específica ou ajuste os filtros.</div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {form && (
        <InventoryForm
          mode={formMode}
          form={form}
          products={data.products}
          productVariants={data.productVariants}
          setForm={setForm}
          onClose={closeForm}
          onSubmit={() => void saveInventory()}
          saving={saving}
          error={error}
        />
      )}

      {operationalItem && operationalForm && (
        <OperationalStockForm
          item={operationalItem}
          form={operationalForm}
          setForm={setOperationalForm}
          onClose={closeOperationalForm}
          onSubmit={() => void saveOperationalStock()}
          saving={operationalSaving}
          error={error}
        />
      )}

      {secretItem && (
        <SecretPanel
          item={secretItem}
          values={secretValues}
          onReveal={(field) => void revealSecret(field)}
          onCopy={copySecret}
          onClose={closeSecretPanel}
        />
      )}
    </div>
  );
};
