"use client";

import { useEffect, useState } from "react";
import { cafeApi } from "@/lib/cafeApi";
import type { CafeHistory as History } from "@/lib/cafeTypes";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorNote, formatDateTime, formatDuration } from "./CafeParts";

type Range = "today" | "week" | "all";
const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "all", label: "Overall" },
];

// Start of the range in the viewer's local time. The week starts on Monday.
function rangeStart(range: Range): Date | null {
  if (range === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const STATUS_LABEL = { preparing: "Preparing", ready: "Ready / served", completed: "Paid" } as const;

// Cafe (dine-in) and takeaway order history on the Admin dashboard.
export function CafeHistory() {
  const [range, setRange] = useState<Range>("today");
  // Each result remembers its range, so switching tabs shows "Loading" instead of the old numbers.
  const [loaded, setLoaded] = useState<{ range: Range; data: History } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = loaded?.range === range ? loaded.data : null;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await cafeApi.history(rangeStart(range));
      if (!alive) return;
      if (res.ok) {
        setLoaded({ range, data: res.data });
        setError(null);
      } else setError(res.error);
    };
    void load();
    const id = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [range]);

  const kpis = data
    ? [
        { label: "Revenue (paid)", value: formatPKR(data.revenue) },
        { label: "Orders", value: `${data.totalOrders}` },
        { label: "Dine-in / takeaway", value: `${data.tableOrders} / ${data.takeawayOrders}` },
        { label: "Avg. prep time", value: data.averagePrepMs === null ? "—" : formatDuration(data.averagePrepMs) },
      ]
    : [];

  return (
    <section aria-labelledby="cafe-history-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="cafe-history-heading" className="text-lg font-bold">Cafe &amp; takeaway history</h2>
          <p className="text-xs text-zinc-500">Orders taken from the Cafe and Takeaway screens</p>
        </div>
        <div role="tablist" className="flex gap-1 rounded-full bg-zinc-950 p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              role="tab"
              type="button"
              aria-selected={range === r.id}
              onClick={() => setRange(r.id)}
              className={cn("rounded-full px-3 py-1.5 text-xs font-bold", range === r.id ? "bg-[#ffd400] text-black" : "text-zinc-300 hover:text-white")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorNote message={error} />
      {!data && !error && <p className="text-sm text-zinc-400">Loading history…</p>}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl bg-zinc-950 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">{k.label}</p>
                <p className="mt-1 text-lg font-black tabular-nums">{k.value}</p>
              </div>
            ))}
          </div>
          {data.orders.length === 0 ? (
            <p className="text-sm text-zinc-500">No cafe or takeaway orders in this period.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">#</th>
                    <th className="py-2 pr-3 font-semibold">Where</th>
                    <th className="py-2 pr-3 font-semibold">Waiter</th>
                    <th className="py-2 pr-3 font-semibold">Items</th>
                    <th className="py-2 pr-3 font-semibold">Order time</th>
                    <th className="py-2 pr-3 font-semibold">Prep time</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {data.orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 pr-3 font-bold tabular-nums">{o.number}</td>
                      <td className="py-2 pr-3">{o.kind === "table" ? `Table ${o.tableNumber}` : `Takeaway${o.customerName ? ` · ${o.customerName}` : ""}`}</td>
                      <td className="py-2 pr-3 text-zinc-400">{o.waiterName ?? "—"}</td>
                      <td className="max-w-64 truncate py-2 pr-3 text-zinc-400" title={o.items.map((l) => `${l.qty}× ${l.name}`).join(", ")}>
                        {o.items.map((l) => `${l.qty}× ${l.name}`).join(", ")}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-zinc-400">{formatDateTime(o.createdAt)}</td>
                      <td className="py-2 pr-3 font-mono tabular-nums">{o.readyAt ? formatDuration(Date.parse(o.readyAt) - Date.parse(o.createdAt)) : "—"}</td>
                      <td className="py-2 pr-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", o.status === "completed" ? "bg-emerald-500/15 text-emerald-300" : "bg-orange-500/15 text-orange-300")}>
                          {STATUS_LABEL[o.status]}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatPKR(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.totalOrders > data.orders.length && <p className="mt-3 text-xs text-zinc-500">Showing the latest {data.orders.length} of {data.totalOrders} orders.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
