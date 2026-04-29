import { calculateFinancials } from "@hzdk/shared";

export type ProductStatus = "Ativo" | "Pausado" | "Sem estoque" | "Sob demanda";
export type InventoryStatus = "Disponível" | "Reservado" | "Vendido" | "Entregue" | "Problema";
export type OrderStatus = "Pendente" | "Confirmado" | "Entregue" | "Concluído" | "Cancelado";
export type EventSeverity = "info" | "success" | "warning" | "critical";

export interface Product {
  id: string;
  name: string;
  category: string;
  salePrice: number;
  unitCost: number;
  stockCurrent: number;
  stockMinimum: number;
  status: ProductStatus;
  listingUrl: string;
  notes: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  supplier: string;
  cost: number;
  status: InventoryStatus;
  accessProtected: boolean;
  purchasedAt: string;
  soldAt?: string;
  notes: string;
}

export interface Order {
  id: string;
  productId: string;
  productName: string;
  buyer: string;
  amount: number;
  status: OrderStatus;
  date: string;
  source: "Manual" | "Webhook futuro" | "Importação";
  actionRequired: string;
  gamemarketUrl: string;
}

export interface EventRecord {
  id: string;
  label: string;
  rawType: string;
  source: "Manual" | "Sistema local" | "Webhook futuro";
  severity: EventSeverity;
  orderId?: string;
  date: string;
  read: boolean;
}

const now = new Date();
const isoDaysAgo = (days: number): string => {
  const date = new Date(now);
  date.setDate(now.getDate() - days);
  return date.toISOString();
};

export const products: Product[] = [
  {
    id: "PRD-LOL-SMURF-001",
    name: "Conta Smurf League of Legends",
    category: "League of Legends",
    salePrice: 42.9,
    unitCost: 16,
    stockCurrent: 18,
    stockMinimum: 5,
    status: "Ativo",
    listingUrl: "https://gamemarket.com.br/",
    notes: "Conta pronta para entrega manual."
  },
  {
    id: "PRD-CS2-PRIME-001",
    name: "CS2 Prime",
    category: "CS2",
    salePrice: 74.9,
    unitCost: 49,
    stockCurrent: 3,
    stockMinimum: 4,
    status: "Ativo",
    listingUrl: "https://gamemarket.com.br/",
    notes: "Prioridade de reposição."
  },
  {
    id: "PRD-WR-001",
    name: "Wild Rift Conta Ranqueada",
    category: "Wild Rift",
    salePrice: 59.9,
    unitCost: 22,
    stockCurrent: 0,
    stockMinimum: 2,
    status: "Sem estoque",
    listingUrl: "https://gamemarket.com.br/",
    notes: "Pausar anúncio quando integração estiver ativa."
  },
  {
    id: "PRD-TFT-ELOJOB-001",
    name: "EloJob TFT",
    category: "Serviços",
    salePrice: 129.9,
    unitCost: 55,
    stockCurrent: 99,
    stockMinimum: 1,
    status: "Sob demanda",
    listingUrl: "https://gamemarket.com.br/",
    notes: "Serviço sob demanda."
  },
  {
    id: "PRD-MELODYNE-001",
    name: "Melodyne",
    category: "Software",
    salePrice: 89.9,
    unitCost: 35,
    stockCurrent: 7,
    stockMinimum: 2,
    status: "Ativo",
    listingUrl: "https://gamemarket.com.br/",
    notes: "Entrega após validação do pedido."
  }
];

export const inventoryItems: InventoryItem[] = [
  {
    id: "INV-LOL-0001",
    productId: "PRD-LOL-SMURF-001",
    productName: "Conta Smurf League of Legends",
    supplier: "Fornecedor A",
    cost: 16,
    status: "Disponível",
    accessProtected: true,
    purchasedAt: isoDaysAgo(8),
    notes: "Sem pendência."
  },
  {
    id: "INV-CS2-0007",
    productId: "PRD-CS2-PRIME-001",
    productName: "CS2 Prime",
    supplier: "Fornecedor B",
    cost: 49,
    status: "Reservado",
    accessProtected: true,
    purchasedAt: isoDaysAgo(3),
    notes: "Aguardando confirmação."
  },
  {
    id: "INV-MEL-0002",
    productId: "PRD-MELODYNE-001",
    productName: "Melodyne",
    supplier: "Fornecedor C",
    cost: 35,
    status: "Entregue",
    accessProtected: true,
    purchasedAt: isoDaysAgo(14),
    soldAt: isoDaysAgo(1),
    notes: "Entrega concluída."
  }
];

export const orders: Order[] = [
  {
    id: "ORD-MAN-1007",
    productId: "PRD-LOL-SMURF-001",
    productName: "Conta Smurf League of Legends",
    buyer: "Comprador disponível pela API futura",
    amount: 42.9,
    status: "Confirmado",
    date: isoDaysAgo(0),
    source: "Manual",
    actionRequired: "Entregar conta",
    gamemarketUrl: "https://gamemarket.com.br/"
  },
  {
    id: "ORD-MAN-1006",
    productId: "PRD-MELODYNE-001",
    productName: "Melodyne",
    buyer: "Comprador disponível pela API futura",
    amount: 89.9,
    status: "Entregue",
    date: isoDaysAgo(1),
    source: "Manual",
    actionRequired: "Acompanhar conclusão",
    gamemarketUrl: "https://gamemarket.com.br/"
  },
  {
    id: "ORD-MAN-1005",
    productId: "PRD-CS2-PRIME-001",
    productName: "CS2 Prime",
    buyer: "Comprador disponível pela API futura",
    amount: 74.9,
    status: "Pendente",
    date: isoDaysAgo(2),
    source: "Manual",
    actionRequired: "Verificar pagamento",
    gamemarketUrl: "https://gamemarket.com.br/"
  },
  {
    id: "ORD-MAN-1004",
    productId: "PRD-TFT-ELOJOB-001",
    productName: "EloJob TFT",
    buyer: "Comprador disponível pela API futura",
    amount: 129.9,
    status: "Concluído",
    date: isoDaysAgo(3),
    source: "Manual",
    actionRequired: "Nenhuma",
    gamemarketUrl: "https://gamemarket.com.br/"
  }
];

export const events: EventRecord[] = [
  {
    id: "EVT-LOCAL-001",
    label: "Venda confirmada manualmente",
    rawType: "local.manual_sale_confirmed",
    source: "Manual",
    severity: "success",
    orderId: "ORD-MAN-1007",
    date: isoDaysAgo(0),
    read: false
  },
  {
    id: "EVT-LOCAL-002",
    label: "Produto abaixo do estoque mínimo",
    rawType: "local.low_stock",
    source: "Sistema local",
    severity: "warning",
    date: isoDaysAgo(0),
    read: false
  },
  {
    id: "EVT-LOCAL-003",
    label: "Pedido pendente exige ação",
    rawType: "local.pending_order",
    source: "Sistema local",
    severity: "critical",
    orderId: "ORD-MAN-1005",
    date: isoDaysAgo(2),
    read: true
  }
];

export const salesByDay = [
  { day: "Seg", gross: 129.9, profit: calculateFinancials({ salePrice: 129.9, unitCost: 55 }).profit },
  { day: "Ter", gross: 74.9, profit: calculateFinancials({ salePrice: 74.9, unitCost: 49 }).profit },
  { day: "Qua", gross: 42.9, profit: calculateFinancials({ salePrice: 42.9, unitCost: 16 }).profit },
  { day: "Qui", gross: 89.9, profit: calculateFinancials({ salePrice: 89.9, unitCost: 35 }).profit },
  { day: "Sex", gross: 172.8, profit: 72.4 },
  { day: "Sáb", gross: 59.9, profit: 30.1 },
  { day: "Dom", gross: 0, profit: 0 }
];

export const getProductFinancials = (product: Product) =>
  calculateFinancials({
    salePrice: product.salePrice,
    unitCost: product.unitCost
  });
