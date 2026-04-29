import type { DashboardSummary, OrderStatus } from "../../shared/contracts";
import { getSqliteDatabase } from "../database/database";
import { eventRepository } from "../repositories/event-repository";
import { centsToMoney } from "./money";

const saleStatuses = ["payment_confirmed", "awaiting_delivery", "delivered", "completed"];

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

const startOfMonthIso = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
};

const startOfTodayIso = (): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
};

export const dashboardService = {
  getSummary(): DashboardSummary {
    const db = getSqliteDatabase();
    const monthStart = startOfMonthIso();
    const todayStart = startOfTodayIso();
    const saleStatusParams = saleStatuses.map((_, index) => `@saleStatus${index}`).join(", ");
    const params = Object.fromEntries(saleStatuses.map((status, index) => [`saleStatus${index}`, status]));

    const monthRow = db
      .prepare(
        `
          SELECT
            SUM(CASE WHEN created_at >= @todayStart AND status IN (${saleStatusParams}) THEN 1 ELSE 0 END) AS sales_today,
            SUM(CASE WHEN created_at >= @monthStart AND status IN (${saleStatusParams}) THEN 1 ELSE 0 END) AS sales_month,
            SUM(CASE WHEN created_at >= @monthStart AND status IN (${saleStatusParams}) THEN sale_price_cents ELSE 0 END) AS gross_month_cents,
            SUM(CASE WHEN created_at >= @monthStart AND status IN (${saleStatusParams}) THEN net_value_cents ELSE 0 END) AS net_month_cents,
            SUM(CASE WHEN created_at >= @monthStart AND status IN (${saleStatusParams}) THEN profit_cents ELSE 0 END) AS profit_month_cents,
            SUM(CASE WHEN action_required = 1 AND status != 'archived' THEN 1 ELSE 0 END) AS pending_action,
            SUM(CASE WHEN status IN ('mediation', 'problem') THEN 1 ELSE 0 END) AS problem_or_mediation
          FROM orders
        `
      )
      .get({ ...params, monthStart, todayStart }) as {
      sales_today: number | null;
      sales_month: number | null;
      gross_month_cents: number | null;
      net_month_cents: number | null;
      profit_month_cents: number | null;
      pending_action: number | null;
      problem_or_mediation: number | null;
    };

    const stockRow = db
      .prepare(
        `
          SELECT
            SUM(CASE WHEN stock_current > 0 AND stock_current <= stock_min THEN 1 ELSE 0 END) AS low_stock,
            SUM(CASE WHEN stock_current <= 0 THEN 1 ELSE 0 END) AS out_of_stock
          FROM products
          WHERE status != 'archived'
        `
      )
      .get() as { low_stock: number | null; out_of_stock: number | null };

    const dayStart = new Date();
    dayStart.setUTCDate(dayStart.getUTCDate() - 6);
    const salesRows = db
      .prepare(
        `
          SELECT
            SUBSTR(created_at, 1, 10) AS day,
            COUNT(*) AS orders,
            SUM(sale_price_cents) AS gross_cents,
            SUM(profit_cents) AS profit_cents
          FROM orders
          WHERE created_at >= @start AND status IN (${saleStatusParams})
          GROUP BY SUBSTR(created_at, 1, 10)
        `
      )
      .all({ ...params, start: isoDay(dayStart) }) as Array<{
      day: string;
      orders: number;
      gross_cents: number | null;
      profit_cents: number | null;
    }>;
    const salesByDayMap = new Map(salesRows.map((row) => [row.day, row]));
    const salesByDay = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(dayStart);
      date.setUTCDate(dayStart.getUTCDate() + index);
      const day = isoDay(date);
      const row = salesByDayMap.get(day);
      return {
        day: day.slice(5),
        orders: row?.orders ?? 0,
        gross: centsToMoney(row?.gross_cents),
        profit: centsToMoney(row?.profit_cents)
      };
    });

    const profitByCategory = db
      .prepare(
        `
          SELECT category_snapshot AS category, SUM(profit_cents) AS profit_cents
          FROM orders
          WHERE created_at >= @monthStart AND status IN (${saleStatusParams})
          GROUP BY category_snapshot
          ORDER BY profit_cents DESC
          LIMIT 8
        `
      )
      .all({ ...params, monthStart }) as Array<{ category: string; profit_cents: number | null }>;

    const statusBreakdown = db
      .prepare(
        `
          SELECT status, COUNT(*) AS count
          FROM orders
          GROUP BY status
          ORDER BY count DESC
        `
      )
      .all() as Array<{ status: OrderStatus; count: number }>;

    return {
      salesToday: monthRow.sales_today ?? 0,
      salesMonth: monthRow.sales_month ?? 0,
      grossRevenueMonth: centsToMoney(monthRow.gross_month_cents),
      netRevenueMonth: centsToMoney(monthRow.net_month_cents),
      estimatedProfitMonth: centsToMoney(monthRow.profit_month_cents),
      pendingActionOrders: monthRow.pending_action ?? 0,
      problemOrMediationOrders: monthRow.problem_or_mediation ?? 0,
      lowStockProducts: stockRow.low_stock ?? 0,
      outOfStockProducts: stockRow.out_of_stock ?? 0,
      latestEvents: eventRepository.listLatest(8),
      salesByDay,
      profitByCategory: profitByCategory.map((row) => ({
        category: row.category,
        profit: centsToMoney(row.profit_cents)
      })),
      statusBreakdown
    };
  }
};
