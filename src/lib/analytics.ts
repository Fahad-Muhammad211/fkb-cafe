import { currentStepIndex, isCancelled, ORDER_STEPS } from "@/lib/orderStatus";
import type { Order } from "@/types";

export interface DayRevenue {
  label: string;
  revenue: number;
  count: number;
}

export interface ProductSales {
  name: string;
  qty: number;
  revenue: number;
}

export interface Analytics {
  orders: number;
  revenue: number;
  averageOrder: number;
  open: number;
  statusCounts: number[];
  daily: DayRevenue[];
  topProducts: ProductSales[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Cancelled orders are left out of every figure here.
export function computeAnalytics(allOrders: Order[], nowMs: number): Analytics {
  const orders = allOrders.filter((o) => !isCancelled(o));
  const statusCounts = ORDER_STEPS.map(() => 0);
  const products = new Map<string, ProductSales>();
  let revenue = 0;

  for (const order of orders) {
    revenue += order.total;
    statusCounts[currentStepIndex(order)] += 1;
    for (const line of order.lines) {
      const entry = products.get(line.name) ?? { name: line.name, qty: 0, revenue: 0 };
      entry.qty += line.qty;
      entry.revenue += line.total;
      products.set(line.name, entry);
    }
  }

  // Last seven calendar days, oldest first, ending today.
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  const daily: DayRevenue[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = today.getTime() - i * DAY_MS;
    const end = start + DAY_MS;
    const inDay = orders.filter((o) => {
      const t = Date.parse(o.createdAt);
      return t >= start && t < end;
    });
    daily.push({
      label: new Date(start).toLocaleDateString("en-GB", { weekday: "short" }),
      revenue: inDay.reduce((sum, o) => sum + o.total, 0),
      count: inDay.length,
    });
  }

  return {
    orders: orders.length,
    revenue,
    averageOrder: orders.length ? Math.round(revenue / orders.length) : 0,
    open: statusCounts.slice(0, -1).reduce((sum, n) => sum + n, 0),
    statusCounts,
    daily,
    topProducts: [...products.values()].sort((a, b) => b.qty - a.qty).slice(0, 5),
  };
}
