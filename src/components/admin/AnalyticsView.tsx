"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Activity, CircleDollarSign, Receipt, ShoppingBag } from "lucide-react";
import { computeAnalytics } from "@/lib/analytics";
import { ordersStore, parseOrders } from "@/lib/orders";
import { formatPKR } from "@/lib/format";
import { ORDER_STEPS, statusLabel } from "@/lib/orderStatus";
import { useNow } from "@/hooks/useNow";
import { BarChart, Donut, HorizontalBars } from "@/components/admin/charts";
import { CafeHistory } from "@/components/admin/cafe/CafeHistory";
import type { Order } from "@/types";

const STATUS_COLORS = ["#a1a1aa", "#38bdf8", "#f59e0b", "#ffd400", "#34d399"];

export function AnalyticsView() {
  const raw = useSyncExternalStore(ordersStore.subscribe, ordersStore.getSnapshot, ordersStore.getServerSnapshot);
  const now = useNow(5000);
  const orders: Order[] = useMemo(() => parseOrders(raw), [raw]);
  const stats = useMemo(() => computeAnalytics(orders, now), [orders, now]);

  if (raw === undefined) {
    return <p className="text-sm text-zinc-400">Loading dashboard…</p>;
  }

  const recent = [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5);

  const kpis = [
    { label: "Revenue", value: formatPKR(stats.revenue), icon: CircleDollarSign },
    { label: "Orders", value: String(stats.orders), icon: Receipt },
    { label: "Avg. order", value: formatPKR(stats.averageOrder), icon: ShoppingBag },
    { label: "Open orders", value: String(stats.open), icon: Activity },
  ];

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Overview</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Dashboard</h1>
        </div>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="animate-card-in rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-colors duration-200 hover:border-zinc-600 md:p-5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-zinc-500">{k.label}</p>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-[#ffd400]">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-xl font-black tabular-nums md:text-2xl">{k.value}</p>
            </div>
          );
        })}
      </div>

      <CafeHistory />

      <div className="grid gap-6 xl:grid-cols-3">
        <section aria-labelledby="revenue-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 xl:col-span-2">
          <h2 id="revenue-heading" className="text-lg font-bold">Revenue, last 7 days</h2>
          <p className="mb-6 text-xs text-zinc-500">Total order value by day</p>
          <BarChart data={stats.daily.map((d) => ({ label: d.label, value: d.revenue, count: d.count }))} />
        </section>

        <section aria-labelledby="status-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 id="status-heading" className="text-lg font-bold">Order status</h2>
          <p className="mb-6 text-xs text-zinc-500">Current stage of every order</p>
          <Donut
            segments={ORDER_STEPS.map((step, i) => ({ label: step, value: stats.statusCounts[i], color: STATUS_COLORS[i] }))}
          />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="top-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 id="top-heading" className="text-lg font-bold">Top products</h2>
          <p className="mb-6 text-xs text-zinc-500">Units sold, by revenue</p>
          <HorizontalBars
            items={stats.topProducts.map((p) => ({ label: p.name, value: p.revenue, sub: `${p.qty} sold · ${formatPKR(p.revenue)}` }))}
            format={formatPKR}
          />
        </section>

        <section aria-labelledby="recent-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="recent-heading" className="text-lg font-bold">Recent orders</h2>
            <Link href="/admin/orders" className="text-sm font-semibold text-[#ffd400] hover:underline">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-zinc-500">No orders yet. Orders placed on the storefront appear here.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {recent.map((o) => {
                return (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold">{o.id}</p>
                      <p className="truncate text-xs text-zinc-500">{o.customer.name} · {o.fulfilment}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tabular-nums">{formatPKR(o.total)}</span>
                      <span className="text-xs text-zinc-400">{statusLabel(o)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
