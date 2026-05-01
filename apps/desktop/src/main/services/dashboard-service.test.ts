import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderStatus } from "../../shared/contracts";

interface DashboardOrderFixture {
  orderCode: string;
  status: OrderStatus;
  createdAt: string;
  salePriceCents: number;
  netValueCents: number;
  profitCents: number;
  actionRequired?: boolean;
  completedAt?: string | null;
  externalStatus?: string | null;
}

const state = vi.hoisted(() => ({
  orders: [] as DashboardOrderFixture[]
}));

const saleStatuses = new Set<OrderStatus>(["payment_confirmed", "awaiting_delivery", "delivered", "completed"]);

const moneyToCents = (value: number): number => Math.round((value + Number.EPSILON) * 100);

const currentMonthIso = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 2, 12)).toISOString();
};

const previousMonthIso = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 28, 12)).toISOString();
};

const sum = (orders: DashboardOrderFixture[], field: "salePriceCents" | "netValueCents" | "profitCents"): number =>
  orders.reduce((total, order) => total + order[field], 0);

const summarizeMonth = (params: Record<string, string>) => {
  const monthStart = params.monthStart ?? "";
  const todayStart = params.todayStart ?? "";
  const saleOrders = state.orders.filter((order) => saleStatuses.has(order.status));
  const monthOrders = saleOrders.filter((order) => order.createdAt >= monthStart);
  const todayOrders = saleOrders.filter((order) => order.createdAt >= todayStart);

  return {
    sales_today: todayOrders.length,
    sales_month: monthOrders.length,
    gross_month_cents: sum(monthOrders, "salePriceCents"),
    net_month_cents: sum(monthOrders, "netValueCents"),
    profit_month_cents: sum(monthOrders, "profitCents"),
    pending_action: state.orders.filter((order) => order.actionRequired && order.status !== "archived").length,
    problem_or_mediation: state.orders.filter((order) => order.status === "problem" || order.status === "mediation").length
  };
};

const summarizeWaitingRelease = () => {
  const waitingReleaseOrders = state.orders.filter((order) => order.status === "delivered" && !order.completedAt);

  return {
    waiting_release_count: waitingReleaseOrders.length,
    waiting_release_gross_cents: sum(waitingReleaseOrders, "salePriceCents"),
    waiting_release_net_cents: sum(waitingReleaseOrders, "netValueCents"),
    waiting_release_profit_cents: sum(waitingReleaseOrders, "profitCents")
  };
};

vi.mock("../database/database", () => ({
  getSqliteDatabase: () => ({
    prepare: (sql: string) => ({
      get: (params: Record<string, string> = {}) => {
        if (sql.includes("waiting_release_count")) {
          return summarizeWaitingRelease();
        }

        if (sql.includes("low_stock")) {
          return { low_stock: 0, out_of_stock: 0 };
        }

        return summarizeMonth(params);
      },
      all: () => {
        if (sql.includes("SUBSTR") || sql.includes("category_snapshot")) {
          return [];
        }

        const byStatus = new Map<OrderStatus, number>();
        for (const order of state.orders) {
          byStatus.set(order.status, (byStatus.get(order.status) ?? 0) + 1);
        }
        return [...byStatus.entries()].map(([status, count]) => ({ status, count }));
      }
    })
  })
}));

vi.mock("../integrations/gamemarket/gamemarket-polling-service", () => ({
  gameMarketPollingService: {
    getStatus: () => ({
      active: true,
      status: "synced",
      finishedAt: "2026-04-30T12:00:00.000Z",
      nextRunAt: "2026-04-30T12:05:00.000Z",
      lastResult: "Sincronizado"
    })
  }
}));

vi.mock("../integrations/gamemarket/gamemarket-settings-service", () => ({
  gameMarketSettingsService: {
    getSettings: () => ({
      lastSyncAt: "2026-04-30T12:00:00.000Z"
    })
  },
  isGameMarketConfigured: () => true
}));

vi.mock("../repositories/app-notification-repository", () => ({
  appNotificationRepository: {
    getSummary: () => ({
      total: 0,
      unread: 0,
      unreadNewSales: 0,
      criticalUnread: 0
    })
  }
}));

vi.mock("../repositories/event-repository", () => ({
  eventRepository: {
    listLatest: () => []
  }
}));

const currentDir = dirname(fileURLToPath(import.meta.url));
const { dashboardService } = await import("./dashboard-service");

describe("dashboard GameMarket readiness", () => {
  beforeEach(() => {
    state.orders = [];
  });

  it("detects configured API from base URL and token without requiring local docs", () => {
    const source = readFileSync(join(currentDir, "dashboard-service.ts"), "utf8");

    expect(source).toContain("isGameMarketConfigured(gameMarketSettings)");
    expect(source).not.toContain('documentation.status === "available"');
    expect(source).not.toContain("documentation.status === 'available'");
  });

  it("shows previous-month delivered GMK orders in waiting-release financials without forcing current-month revenue", () => {
    state.orders = [
      {
        orderCode: "GMK-ORD-34831",
        status: "delivered",
        externalStatus: "processing",
        createdAt: previousMonthIso(),
        salePriceCents: moneyToCents(15),
        netValueCents: moneyToCents(13.05),
        profitCents: moneyToCents(6.62),
        completedAt: null
      },
      {
        orderCode: "ORD-CANCELLED",
        status: "cancelled",
        createdAt: previousMonthIso(),
        salePriceCents: moneyToCents(90),
        netValueCents: moneyToCents(78.3),
        profitCents: moneyToCents(30),
        completedAt: null
      },
      {
        orderCode: "ORD-REFUNDED",
        status: "refunded",
        createdAt: previousMonthIso(),
        salePriceCents: moneyToCents(70),
        netValueCents: moneyToCents(60.9),
        profitCents: moneyToCents(22),
        completedAt: null
      },
      {
        orderCode: "ORD-PENDING",
        status: "pending_payment",
        createdAt: previousMonthIso(),
        salePriceCents: moneyToCents(50),
        netValueCents: moneyToCents(43.5),
        profitCents: moneyToCents(10),
        completedAt: null
      },
      {
        orderCode: "ORD-DRAFT",
        status: "draft",
        createdAt: previousMonthIso(),
        salePriceCents: moneyToCents(40),
        netValueCents: moneyToCents(34.8),
        profitCents: moneyToCents(9),
        completedAt: null
      }
    ];

    const summary = dashboardService.getSummary();

    expect(summary.salesMonth).toBe(0);
    expect(summary.grossRevenueMonth).toBe(0);
    expect(summary.netRevenueMonth).toBe(0);
    expect(summary.estimatedProfitMonth).toBe(0);
    expect(summary.deliveredAwaitingRelease).toBe(1);
    expect(summary.waitingReleaseCount).toBe(1);
    expect(summary.waitingReleaseGross).toBe(15);
    expect(summary.waitingReleaseNet).toBe(13.05);
    expect(summary.waitingReleaseProfit).toBe(6.62);
  });

  it("counts current-month delivered orders as operational sales while release is still pending", () => {
    state.orders = [
      {
        orderCode: "ORD-DELIVERED-CURRENT",
        status: "delivered",
        externalStatus: "processing",
        createdAt: currentMonthIso(),
        salePriceCents: moneyToCents(20),
        netValueCents: moneyToCents(17.4),
        profitCents: moneyToCents(7.4),
        completedAt: null
      }
    ];

    const summary = dashboardService.getSummary();

    expect(summary.salesMonth).toBe(1);
    expect(summary.grossRevenueMonth).toBe(20);
    expect(summary.netRevenueMonth).toBe(17.4);
    expect(summary.estimatedProfitMonth).toBe(7.4);
    expect(summary.waitingReleaseCount).toBe(1);
  });

  it("keeps completed orders in concluded revenue and out of waiting-release totals", () => {
    state.orders = [
      {
        orderCode: "ORD-COMPLETED",
        status: "completed",
        createdAt: currentMonthIso(),
        salePriceCents: moneyToCents(30),
        netValueCents: moneyToCents(26.1),
        profitCents: moneyToCents(11.1),
        completedAt: currentMonthIso()
      }
    ];

    const summary = dashboardService.getSummary();

    expect(summary.salesMonth).toBe(1);
    expect(summary.grossRevenueMonth).toBe(30);
    expect(summary.netRevenueMonth).toBe(26.1);
    expect(summary.estimatedProfitMonth).toBe(11.1);
    expect(summary.waitingReleaseCount).toBe(0);
    expect(summary.waitingReleaseNet).toBe(0);
    expect(summary.statusBreakdown).toEqual([{ status: "completed", count: 1 }]);
  });

  it("keeps mediation and problem orders separate from waiting-release financials", () => {
    state.orders = [
      {
        orderCode: "ORD-MEDIATION",
        status: "mediation",
        createdAt: currentMonthIso(),
        salePriceCents: moneyToCents(80),
        netValueCents: moneyToCents(69.6),
        profitCents: moneyToCents(29.6),
        completedAt: null
      },
      {
        orderCode: "ORD-PROBLEM",
        status: "problem",
        createdAt: currentMonthIso(),
        salePriceCents: moneyToCents(60),
        netValueCents: moneyToCents(52.2),
        profitCents: moneyToCents(21.2),
        completedAt: null
      }
    ];

    const summary = dashboardService.getSummary();

    expect(summary.problemOrMediationOrders).toBe(2);
    expect(summary.waitingReleaseCount).toBe(0);
    expect(summary.waitingReleaseGross).toBe(0);
  });
});
