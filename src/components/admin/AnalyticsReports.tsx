"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Download, Package, Receipt, ShoppingBag, TrendingUp, Users } from "lucide-react";
import { ordersStore, parseOrders } from "@/lib/orders";
import { formatPKR } from "@/lib/format";
import { useNow } from "@/hooks/useNow";
import {
  buildBuckets,
  downloadCsv,
  fillBuckets,
  isValidRange,
  ordersCsv,
  ordersInRange,
  presetRange,
  allTimeRange,
  summaryCsv,
  summarize,
  type Bucket,
  type DateRange,
  type Period,
} from "@/lib/reports";
import { cn } from "@/lib/utils";
import { Donut, HorizontalBars } from "@/components/admin/charts";
import { inputClass } from "@/components/ui/FormField";
import type { Order } from "@/types";

const PERIODS: { id: Period; label: string }[] = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

const PRESETS: { id: string; label: string; days?: number }[] = [
  { id: "7", label: "Last 7 days", days: 7 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time" },
];

export function AnalyticsReports() {
  const raw = useSyncExternalStore(ordersStore.subscribe, ordersStore.getSnapshot, ordersStore.getServerSnapshot);
  const now = useNow(60_000);
  const [period, setPeriod] = useState<Period>("daily");
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [preset, setPreset] = useState<string>("30");

  const orders = useMemo<Order[]>(() => parseOrders(raw), [raw]);

  if (raw === undefined) {
    return <p className="text-sm text-zinc-400">Loading reports…</p>;
  }

  const nowDate = new Date(now);
  const range: DateRange = customRange ?? (preset === "all" ? allTimeRange(orders, nowDate) : presetRange(Number(preset), nowDate));
  const validRange = isValidRange(range);
  const inRange = ordersInRange(orders, range);
  const buckets: Bucket[] = validRange ? fillBuckets(buildBuckets(period, range), inRange, period) : [];
  const summary = summarize(inRange);
  const repeatRate = summary.customers ? Math.round((summary.repeatCustomers / summary.customers) * 100) : 0;

  const choosePreset = (id: string) => {
    setPreset(id);
    setCustomRange(null);
  };

  const editRange = (patch: Partial<DateRange>) => {
    setCustomRange({ ...range, ...patch });
    setPreset("custom");
  };

  const exportSummary = () =>
    downloadCsv(`rms-sales-${period}-${range.from}-to-${range.to}.csv`, summaryCsv(buckets, period));
  const exportOrders = () => downloadCsv(`rms-orders-${range.from}-to-${range.to}.csv`, ordersCsv(ordersInRange(orders, range, true)));

  const kpis = [
    { label: "Revenue", value: formatPKR(summary.revenue), icon: TrendingUp },
    { label: "Total orders", value: String(summary.orders), icon: Receipt },
    { label: "Avg. order", value: formatPKR(summary.averageOrder), icon: ShoppingBag },
    { label: "Items sold", value: String(summary.items), icon: Package },
    { label: "Customers", value: String(summary.customers), icon: Users },
    { label: "Repeat rate", value: `${repeatRate}%`, icon: Users },
  ];

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Reports</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Sales analytics</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {validRange ? `${range.from} to ${range.to}` : "Choose a valid date range"} · {summary.orders} orders in range
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportSummary}
            disabled={!validRange}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold transition-all hover:bg-zinc-800 active:scale-95 disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Summary CSV
          </button>
          <button
            type="button"
            onClick={exportOrders}
            disabled={!validRange}
            className="inline-flex items-center gap-2 rounded-full bg-[#ffd400] px-4 py-2 text-sm font-bold text-black transition-all hover:brightness-95 active:scale-95 disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Orders CSV
          </button>
        </div>
      </header>

      {/* Controls */}
      <section aria-label="Report filters" className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Report period" className="inline-flex rounded-full border border-zinc-700 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200",
                  period === p.id ? "bg-[#ffd400] text-black" : "text-zinc-300 hover:text-white",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Date presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => choosePreset(p.id)}
                aria-pressed={preset === p.id && !customRange}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  preset === p.id && !customRange ? "border-zinc-500 bg-zinc-700 text-white" : "border-zinc-700 text-zinc-400 hover:text-white",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:max-w-xl">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            From
            <input type="date" value={range.from} onChange={(e) => editRange({ from: e.target.value })} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            To
            <input type="date" value={range.to} onChange={(e) => editRange({ to: e.target.value })} className={inputClass} />
          </label>
        </div>
        {!validRange && (
          <p role="alert" className="text-sm text-red-300">
            The start date must be on or before the end date.
          </p>
        )}
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="animate-card-in rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition-colors duration-200 hover:border-zinc-600 md:p-5"
              style={{ animationDelay: `${i * 50}ms` }}
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

      {/* Revenue chart */}
      <section aria-labelledby="chart-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 id="chart-heading" className="text-lg font-bold">
          Revenue by {period === "daily" ? "day" : period === "weekly" ? "week" : "month"}
        </h2>
        <p className="mb-6 text-xs text-zinc-500">Total order value per period. Scroll sideways on small screens.</p>
        <RevenueBars buckets={buckets} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Period table */}
        <section aria-labelledby="table-heading" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 xl:col-span-2">
          <h2 id="table-heading" className="text-lg font-bold">
            {PERIODS.find((p) => p.id === period)?.label} report
          </h2>
          <p className="mb-4 text-xs text-zinc-500">Empty periods are included so gaps are visible.</p>
          <div className="max-h-96 overflow-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="sticky top-0 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Period</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Orders</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Items</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Revenue</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Avg.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {buckets.map((b) => (
                  <tr key={b.key} className={cn("transition-colors hover:bg-zinc-800/50", b.orders === 0 && "text-zinc-500")}>
                    <td className="px-3 py-2.5">{b.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.orders}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.items}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatPKR(b.revenue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.orders ? formatPKR(Math.round(b.revenue / b.orders)) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Fulfilment split */}
        <section aria-labelledby="split-heading" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 id="split-heading" className="text-lg font-bold">Delivery vs pickup</h2>
          <p className="mb-6 text-xs text-zinc-500">Order count in range</p>
          <Donut
            segments={[
              { label: "Delivery", value: summary.deliveries, color: "#ffd400" },
              { label: "Pickup", value: summary.pickups, color: "#38bdf8" },
            ]}
          />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top products */}
        <section aria-labelledby="products-heading" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 id="products-heading" className="text-lg font-bold">Top-selling products</h2>
          <p className="mb-6 text-xs text-zinc-500">Ranked by revenue in range</p>
          <HorizontalBars
            items={summary.topProducts.map((p) => ({ label: p.name, value: p.revenue, sub: `${p.qty} sold · ${formatPKR(p.revenue)}` }))}
            format={formatPKR}
          />
        </section>

        {/* Customers */}
        <section aria-labelledby="customers-heading" className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 id="customers-heading" className="text-lg font-bold">Customer statistics</h2>
          <p className="mb-4 text-xs text-zinc-500">Customers are matched by account, or by phone number for guests</p>
          <dl className="mb-5 grid grid-cols-3 gap-3 text-center">
            <Stat label="Customers" value={summary.customers} />
            <Stat label="Repeat" value={summary.repeatCustomers} />
            <Stat label="Registered orders" value={summary.registeredOrders} />
          </dl>
          {summary.topCustomers.length === 0 ? (
            <p className="text-sm text-zinc-500">No customers in this range.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {summary.topCustomers.map((c) => (
                <li key={c.key} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    <p className="text-xs text-zinc-500">
                      {c.phone} · {c.registered ? "Registered" : "Guest"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{formatPKR(c.spent)}</p>
                    <p className="text-xs text-zinc-500">{c.orders} {c.orders === 1 ? "order" : "orders"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-zinc-800/60 px-2 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-lg font-black tabular-nums">{value}</dd>
    </div>
  );
}

// Column chart that scrolls sideways when there are many periods.
function RevenueBars({ buckets }: { buckets: Bucket[] }) {
  if (buckets.length === 0) return <p className="text-sm text-zinc-500">No periods in this range.</p>;
  const max = Math.max(1, ...buckets.map((b) => b.revenue));
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 12));
  const barWidth = buckets.length > 14 ? 26 : 0;
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex h-64 items-end gap-2" role="img" aria-label={`Revenue for ${buckets.length} periods`} style={{ minWidth: barWidth ? buckets.length * (barWidth + 8) : undefined }}>
        {buckets.map((b, i) => {
          const pct = b.revenue ? Math.max(3, (b.revenue / max) * 100) : 2;
          return (
            <div key={b.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2" style={barWidth ? { flex: `0 0 ${barWidth}px` } : undefined}>
              <span className="text-[10px] tabular-nums text-zinc-400">{buckets.length <= 14 && b.revenue ? formatPKR(b.revenue) : ""}</span>
              <div
                title={`${b.label}: ${formatPKR(b.revenue)} from ${b.orders} ${b.orders === 1 ? "order" : "orders"}`}
                className={cn(
                  "w-full rounded-t-md transition-[height] duration-700 ease-out",
                  b.revenue ? "bg-gradient-to-t from-[#ffd400]/70 to-[#ffd400]" : "bg-zinc-800",
                )}
                style={{ height: `${pct}%` }}
              />
              <span className="h-4 whitespace-nowrap text-[10px] text-zinc-500">{i % labelEvery === 0 ? b.label : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
