"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Boxes, CircleDollarSign, Receipt, TrendingUp } from "lucide-react";
import { dashboardApi } from "@/lib/cafeApi";
import type { DashboardData } from "@/lib/dashboardTypes";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarChart, HorizontalBars } from "@/components/admin/charts";
import { CafeHistory } from "@/components/admin/cafe/CafeHistory";
import { ErrorNote, formatDateTime } from "@/components/admin/cafe/CafeParts";

const REFRESH_MS = 30_000;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const qty = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("en-US");

// The Owner's dashboard. Every number comes from the database (see lib/server/dashboard.ts).
export function DashboardView() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await dashboardApi.read(startOfToday());
    if (res.ok) {
      setData(res.data);
      setError(null);
    } else setError(res.error);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => alive && void load();
    tick();
    const id = window.setInterval(tick, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [load]);

  if (!data) return error ? <ErrorNote message={error} /> : <p className="text-sm text-zinc-400">Loading dashboard…</p>;
  const t = data.today;

  const kpis = [
    { label: "Today's sales", value: formatPKR(t.sales), sub: `Cafe ${formatPKR(t.cafeSales)} · Online ${formatPKR(t.onlineSales)}`, icon: CircleDollarSign, tone: "text-white" },
    { label: "Today's profit", value: formatPKR(t.profit), sub: `Sales − stock used (${formatPKR(t.stockCost)})`, icon: TrendingUp, tone: t.profit < 0 ? "text-red-400" : "text-emerald-400" },
    { label: "Today's orders", value: String(t.orders), sub: `${t.openOrders} not paid yet`, icon: Receipt, tone: "text-white" },
    { label: "Stock value", value: formatPKR(data.stockValue), sub: data.lowStock ? `${data.lowStock} item${data.lowStock === 1 ? "" : "s"} low` : "No low items", icon: Boxes, tone: "text-white" },
  ];

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Overview</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Dashboard</h1>
        </div>
        <p className="text-xs text-zinc-500">Updates every 30 seconds</p>
      </header>
      <ErrorNote message={error} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{k.label}</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-[#ffd400]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <p className={cn("mt-3 text-2xl font-black tabular-nums", k.tone)}>{k.value}</p>
              <p className="mt-1 text-xs text-zinc-500">{k.sub}</p>
            </div>
          );
        })}
      </div>

      <section aria-labelledby="by-day-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 id="by-day-heading" className="text-lg font-bold">Total order value by day</h2>
        <p className="mb-6 text-xs text-zinc-500">Dine-in, takeaway and online orders (not cancelled), last 7 days</p>
        <BarChart
          data={data.orderValueByDay.map((d) => ({
            label: new Date(d.date).toLocaleDateString("en-US", { weekday: "short" }),
            value: d.value,
            count: d.orders,
          }))}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="top-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 id="top-heading" className="text-lg font-bold">Top products</h2>
          <p className="mb-6 text-xs text-zinc-500">By sales value, all orders</p>
          <HorizontalBars items={data.topProducts.map((p) => ({ label: p.name, value: p.revenue, sub: `${p.qty} sold · ${formatPKR(p.revenue)}` }))} format={formatPKR} />
        </section>

        <section aria-labelledby="recent-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="recent-heading" className="text-lg font-bold">Recent orders</h2>
            <Link href="/admin/cafe" className="text-sm font-semibold text-[#ffd400] hover:underline">
              Open tables
            </Link>
          </div>
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-zinc-500">No orders yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {data.recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{o.label}</p>
                    <p className="text-xs text-zinc-500">
                      {o.channel} · {formatDateTime(o.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular-nums">{formatPKR(o.total)}</span>
                    <span className={cn("text-xs", o.status === "Paid" || o.status === "Delivered" ? "text-emerald-400" : "text-zinc-400")}>{o.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="stock-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 id="stock-heading" className="text-lg font-bold">Today&apos;s stock</h2>
              <p className="text-xs text-zinc-500">On hand now · value {formatPKR(data.stockValue)}</p>
            </div>
            <Link href="/admin/stock" className="text-sm font-semibold text-[#ffd400] hover:underline">
              Manage stock
            </Link>
          </div>
          {data.stock.length === 0 ? (
            <p className="text-sm text-zinc-500">No stock items yet. Add ingredients on the Stock page.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Item</th>
                    <th className="py-2 pr-3 text-right font-semibold">On hand</th>
                    <th className="py-2 pr-3 text-right font-semibold">Used today</th>
                    <th className="py-2 text-right font-semibold">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {data.stock.map((i) => (
                    <tr key={i.id}>
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-1.5">
                          {i.low && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" aria-label="Low stock" />}
                          {i.name}
                        </span>
                      </td>
                      <td className={cn("py-2 pr-3 text-right tabular-nums", i.quantity < 0 ? "text-red-400" : i.low ? "text-amber-300" : "")}>
                        {qty(i.quantity)} {i.unit}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-zinc-400">{i.usedToday ? `${qty(i.usedToday)} ${i.unit}` : "—"}</td>
                      <td className="py-2 text-right tabular-nums">{formatPKR(i.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="consumption-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 id="consumption-heading" className="text-lg font-bold">Stock consumption today</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Used by orders (recipes), kitchen use and waste · cost {formatPKR(t.stockCost)} · bought today {formatPKR(t.purchases)}
          </p>
          {data.consumption.length === 0 ? (
            <p className="text-sm text-zinc-500">Nothing used yet today.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Item</th>
                    <th className="py-2 pr-3 text-right font-semibold">Used</th>
                    <th className="py-2 pr-3 text-right font-semibold">By orders</th>
                    <th className="py-2 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {data.consumption.map((c) => (
                    <tr key={c.itemId}>
                      <td className="py-2 pr-3">{c.name}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {qty(c.qty)} {c.unit}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-zinc-400">
                        {qty(c.fromOrders)} {c.unit}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatPKR(c.cost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-800 font-bold">
                    <td className="py-2 pr-3" colSpan={3}>
                      Today&apos;s profit = {formatPKR(t.sales)} sales − {formatPKR(t.stockCost)} stock
                    </td>
                    <td className={cn("py-2 text-right tabular-nums", t.profit < 0 ? "text-red-400" : "text-emerald-400")}>{formatPKR(t.profit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>

      <CafeHistory />
    </div>
  );
}
