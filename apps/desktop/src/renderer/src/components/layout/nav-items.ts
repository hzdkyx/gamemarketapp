import {
  BarChart3,
  Bell,
  Boxes,
  LayoutDashboard,
  PackageSearch,
  ReceiptText,
  Settings
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Produtos", path: "/products", icon: PackageSearch },
  { label: "Estoque", path: "/inventory", icon: Boxes },
  { label: "Pedidos", path: "/orders", icon: ReceiptText },
  { label: "Eventos", path: "/events", icon: Bell },
  { label: "Configurações", path: "/settings", icon: Settings }
];

export const analyticsIcon = BarChart3;
