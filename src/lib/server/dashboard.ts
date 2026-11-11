import "server-only";
import { getCollection } from "@/lib/server/collections";
import { allCafeOrderLines, cafeOrdersPaidSince, cafeOrdersSince, recentCafeOrders } from "@/lib/server/cafe";
import { listItems, movementsSince } from "@/lib/server/stock";
import { ORDER_STEPS } from "@/lib/orderStatus";
import type { DashboardData } from "@/lib/dashboardTypes";
import type { CartLine } from "@/types";

// The Owner's dashboard, calculated from the database on every request:
//  - cafe orders (dine-in tables and takeaway, "cafe_orders") and storefront orders ("orders");
//  - stock items and movements (purchases, recipe deductions, usage, waste).
//
// Sales = paid cafe bills + delivered storefront orders. Profit = sales − cost of the stock consumed
// (recipe deductions, usage, waste and count shortfalls), each costed at the item's average purchase
// cost. Salaries and other overheads are not included.

const LAST_STEP = ORDER_STEPS.length - 1;
const DAY_MS = 86_400_000;

type StoreOrder = {
  _id: string;
  createdAt: string;
  status?: string;
  statusOverride?: number;
  total: number;
  lines: CartLine[];
  customer?: { name?: string };
  fulfilment?: string;
};
const storeOrders = () => getCollection<StoreOrder>("orders");

const live = (o: StoreOrder) => o.status !== "cancelled";
const delivered = (o: StoreOrder) => live(o) && o.status !== "pending" && (o.statusOverride ?? 0) >= LAST_STEP;
const storeStatus = (o: StoreOrder) =>
  o.status === "cancelled" ? "Cancelled" : o.status === "pending" ? "Awaiting confirmation" : ORDER_STEPS[Math.min(o.statusOverride ?? 1, LAST_STEP)];

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

// `todayRaw` is the start of today in the viewer's time zone, so "today" and the days of the week
// match the clock on the counter.
export async function readDashboard(todayRaw: string | null): Promise<Result<DashboardData>> {
  const today = todayRaw ? new Date(todayRaw) : null;
  if (!today || Number.isNaN(today.getTime())) return { ok: false, status: 400, error: "Invalid date." };
  const todayIso = today.toISOString();
  const weekStart = new Date(today.getTime() - 6 * DAY_MS).toISOString();

  const [cafeWeek, cafePaidToday, cafeRecent, cafeLines, items, movesToday, storeWeek, storeRecent, storeAllLines] = await Promise.all([
    cafeOrdersSince(weekStart),
    cafeOrdersPaidSince(todayIso),
    recentCafeOrders(8),
    allCafeOrderLines(),
    listItems(),
    movementsSince(todayIso),
    (await storeOrders()).find({ createdAt: { $gte: weekStart } }).toArray(),
    (await storeOrders()).find({}).sort({ createdAt: -1 }).limit(8).toArray(),
    (await storeOrders()).find({ status: { $ne: "cancelled" } }, { projection: { lines: 1 } }).toArray(),
  ]);

  // Total order value by day (last 7 days, every order not cancelled).
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(today.getTime() - (6 - i) * DAY_MS);
    return { start: start.getTime(), date: start.toISOString(), value: 0, orders: 0 };
  });
  const addToDay = (createdAt: string, total: number) => {
    const t = Date.parse(createdAt);
    const day = days.find((d) => t >= d.start && t < d.start + DAY_MS);
    if (day) {
      day.value += total;
      day.orders += 1;
    }
  };
  for (const o of cafeWeek) addToDay(o.createdAt, o.total);
  for (const o of storeWeek) if (live(o)) addToDay(o.createdAt, o.total);

  // Today's sales and orders.
  const cafeSales = cafePaidToday.reduce((s, o) => s + o.total, 0);
  const storeToday = storeWeek.filter((o) => o.createdAt >= todayIso);
  const onlineSales = storeToday.filter(delivered).reduce((s, o) => s + o.total, 0);
  const sales = cafeSales + onlineSales;
  const ordersToday = cafeWeek.filter((o) => o.createdAt >= todayIso).length + storeToday.filter(live).length;
  const openOrders = cafeWeek.filter((o) => o.status !== "completed").length;

  // Stock consumption today, per item.
  const consumption = new Map<string, { itemId: string; name: string; unit: string; qty: number; cost: number; fromOrders: number }>();
  let purchasesToday = 0;
  for (const m of movesToday) {
    if (m.type === "purchase") {
      purchasesToday += m.totalCost;
      continue;
    }
    if (m.qty >= 0) continue;
    const row = consumption.get(m.itemId) ?? { itemId: m.itemId, name: m.itemName, unit: m.unit, qty: 0, cost: 0, fromOrders: 0 };
    row.qty += -m.qty;
    row.cost += m.totalCost;
    if (m.type === "order") row.fromOrders += -m.qty;
    consumption.set(m.itemId, row);
  }
  const consumed = [...consumption.values()]
    .map((r) => ({ ...r, qty: Math.round(r.qty * 1000) / 1000, fromOrders: Math.round(r.fromOrders * 1000) / 1000, cost: Math.round(r.cost) }))
    .sort((a, b) => b.cost - a.cost);
  const stockCost = consumed.reduce((s, r) => s + r.cost, 0);

  // Top products, all time: cafe orders and storefront orders not cancelled.
  const products = new Map<string, { name: string; qty: number; revenue: number }>();
  const addProduct = (name: string, qty: number, revenue: number) => {
    const p = products.get(name) ?? { name, qty: 0, revenue: 0 };
    p.qty += qty;
    p.revenue += revenue;
    products.set(name, p);
  };
  for (const o of cafeLines) for (const l of o.items) addProduct(l.name, l.qty, l.price * l.qty);
  for (const o of storeAllLines) for (const l of o.lines ?? []) addProduct(l.name, l.qty, l.total);
  const topProducts = [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  // Recent orders from every channel.
  const recent = [
    ...cafeRecent.map((o) => ({
      id: o.id,
      label: `#${o.number} · ${o.kind === "table" ? `Table ${o.tableNumber}` : `Takeaway${o.customerName ? ` · ${o.customerName}` : ""}`}`,
      channel: o.kind === "table" ? ("Dine-in" as const) : ("Takeaway" as const),
      total: o.total,
      status: o.status === "completed" ? "Paid" : o.status === "ready" ? (o.kind === "table" ? "Served" : "Ready") : "Preparing",
      createdAt: o.createdAt,
    })),
    ...storeRecent.map((o) => ({
      id: o._id,
      label: `${o._id} · ${o.customer?.name ?? "Customer"}`,
      channel: "Online" as const,
      total: o.total,
      status: storeStatus(o),
      createdAt: o.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const stock = items.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    quantity: i.quantity,
    avgCost: i.avgCost,
    value: Math.round(Math.max(0, i.quantity) * i.avgCost),
    low: i.quantity <= i.lowLevel,
    usedToday: consumption.get(i.id)?.qty ?? 0,
  }));

  return {
    ok: true,
    value: {
      today: {
        sales,
        cafeSales,
        onlineSales,
        orders: ordersToday,
        openOrders,
        stockCost,
        purchases: Math.round(purchasesToday),
        profit: sales - stockCost,
      },
      orderValueByDay: days.map(({ date, value, orders }) => ({ date, value, orders })),
      topProducts,
      recentOrders: recent,
      stock,
      stockValue: stock.reduce((s, i) => s + i.value, 0),
      lowStock: stock.filter((i) => i.low).length,
      consumption: consumed,
    },
  };
}
