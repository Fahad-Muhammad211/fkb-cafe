import { isCancelled, statusLabel } from "@/lib/orderStatus";
import type { Order } from "@/types";

// Sales reporting over the orders saved in localStorage. All dates are the browser's local
// calendar days, so "today" matches what the admin sees on their clock.

export type Period = "daily" | "weekly" | "monthly";
export interface DateRange {
  from: string; // YYYY-MM-DD, inclusive
  to: string; // YYYY-MM-DD, inclusive
}

export interface Bucket {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  items: number;
}

export interface ProductSales {
  name: string;
  qty: number;
  revenue: number;
}

export interface CustomerStat {
  key: string;
  name: string;
  phone: string;
  registered: boolean;
  orders: number;
  spent: number;
}

export interface ReportSummary {
  revenue: number;
  orders: number;
  averageOrder: number;
  items: number;
  customers: number;
  repeatCustomers: number;
  registeredOrders: number;
  guestOrders: number;
  deliveries: number;
  pickups: number;
  topProducts: ProductSales[];
  topCustomers: CustomerStat[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 800;
const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// Monday of the week containing `d`.
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
}

// Presets are relative to "now" and end today.
export function presetRange(days: number, now: Date): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { from: dayKey(addDays(today, -(days - 1))), to: dayKey(today) };
}

export function allTimeRange(orders: Order[], now: Date): DateRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (orders.length === 0) return { from: dayKey(today), to: dayKey(today) };
  const earliest = Math.min(...orders.map((o) => Date.parse(o.createdAt)));
  return { from: dayKey(new Date(earliest)), to: dayKey(today) };
}

export function isValidRange(range: DateRange): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(range.from) && /^\d{4}-\d{2}-\d{2}$/.test(range.to) && range.from <= range.to;
}

export function dayCount(range: DateRange): number {
  return Math.round((parseDayKey(range.to).getTime() - parseDayKey(range.from).getTime()) / DAY_MS) + 1;
}

// Bucket key for a date under a period.
export function bucketKey(date: Date, period: Period): string {
  if (period === "daily") return dayKey(date);
  if (period === "weekly") return dayKey(weekStart(date));
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function bucketLabel(key: string, period: Period): string {
  const date = period === "monthly" ? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1) : parseDayKey(key);
  if (period === "daily") return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  if (period === "weekly") return `Wk ${date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// Every bucket in the range, in order, including empty ones, so charts show gaps.
export function buildBuckets(period: Period, range: DateRange): Bucket[] {
  if (!isValidRange(range)) return [];
  const days = Math.min(dayCount(range), MAX_DAYS);
  const start = parseDayKey(range.from);
  const seen = new Map<string, Bucket>();
  for (let i = 0; i < days; i++) {
    const key = bucketKey(addDays(start, i), period);
    if (!seen.has(key)) {
      seen.set(key, { key, label: bucketLabel(key, period), revenue: 0, orders: 0, items: 0 });
    }
  }
  return [...seen.values()];
}

// Orders whose local day falls inside the range.
// Cancelled orders are left out of sales figures unless includeCancelled is set (used by the order export).
export function ordersInRange(orders: Order[], range: DateRange, includeCancelled = false): Order[] {
  if (!isValidRange(range)) return [];
  return orders.filter((o) => {
    if (!includeCancelled && isCancelled(o)) return false;
    const key = dayKey(new Date(o.createdAt));
    return key >= range.from && key <= range.to;
  });
}

export function fillBuckets(buckets: Bucket[], orders: Order[], period: Period): Bucket[] {
  const map = new Map(buckets.map((b) => [b.key, { ...b }]));
  for (const order of orders) {
    const bucket = map.get(bucketKey(new Date(order.createdAt), period));
    if (!bucket) continue;
    bucket.revenue += order.total;
    bucket.orders += 1;
    bucket.items += order.lines.reduce((sum, l) => sum + l.qty, 0);
  }
  return buckets.map((b) => map.get(b.key) ?? b);
}

function customerKey(order: Order): string {
  return order.userId ? `user:${order.userId}` : `phone:${order.customer.phone.replace(/\s/g, "")}`;
}

export function summarize(orders: Order[]): ReportSummary {
  let revenue = 0;
  let items = 0;
  const products = new Map<string, ProductSales>();
  const customers = new Map<string, CustomerStat & { latest: number }>();
  let deliveries = 0;
  let pickups = 0;
  let registeredOrders = 0;

  for (const order of orders) {
    revenue += order.total;
    if (order.fulfilment === "delivery") deliveries += 1;
    else pickups += 1;
    if (order.userId) registeredOrders += 1;

    for (const line of order.lines) {
      items += line.qty;
      const entry = products.get(line.name) ?? { name: line.name, qty: 0, revenue: 0 };
      entry.qty += line.qty;
      entry.revenue += line.total;
      products.set(line.name, entry);
    }

    const key = customerKey(order);
    const at = Date.parse(order.createdAt);
    const current = customers.get(key);
    if (current) {
      current.orders += 1;
      current.spent += order.total;
      if (at > current.latest) {
        current.latest = at;
        current.name = order.customer.name;
      }
    } else {
      customers.set(key, {
        key,
        name: order.customer.name,
        phone: order.customer.phone,
        registered: Boolean(order.userId),
        orders: 1,
        spent: order.total,
        latest: at,
      });
    }
  }

  const customerList = [...customers.values()];
  return {
    revenue,
    orders: orders.length,
    averageOrder: orders.length ? Math.round(revenue / orders.length) : 0,
    items,
    customers: customerList.length,
    repeatCustomers: customerList.filter((c) => c.orders > 1).length,
    registeredOrders,
    guestOrders: orders.length - registeredOrders,
    deliveries,
    pickups,
    topProducts: [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8),
    topCustomers: customerList
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5)
      .map((c) => ({ key: c.key, name: c.name, phone: c.phone, registered: c.registered, orders: c.orders, spent: c.spent })),
  };
}

// CSV helpers. Cells starting with = + - @ are prefixed so spreadsheets do not run them as formulas.
function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function summaryCsv(buckets: Bucket[], period: Period): string {
  const rows: (string | number)[][] = [["Period", "Label", "Orders", "Items", "Revenue (PKR)", "Average order (PKR)"]];
  for (const b of buckets) {
    rows.push([period, b.label, b.orders, b.items, b.revenue, b.orders ? Math.round(b.revenue / b.orders) : 0]);
  }
  return toCsv(rows);
}

export function ordersCsv(orders: Order[]): string {
  const rows: (string | number)[][] = [
    ["Order", "Placed", "Customer", "Phone", "Type", "Items", "Subtotal", "Delivery fee", "Total", "Status"],
  ];
  const sorted = [...orders].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const o of sorted) {
    rows.push([
      o.id,
      new Date(o.createdAt).toISOString(),
      o.customer.name,
      o.customer.phone,
      o.fulfilment,
      o.lines.reduce((sum, l) => sum + l.qty, 0),
      o.subtotal,
      o.deliveryFee,
      o.total,
      statusLabel(o),
    ]);
  }
  return toCsv(rows);
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
