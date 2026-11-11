"use client";

import { useEffect, useState } from "react";
import { Receipt, Trophy, Wallet } from "lucide-react";
import { waitersApi } from "@/lib/cafeApi";
import type { CafeOrder, WaiterStats } from "@/lib/cafeTypes";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Dialog, ErrorNote, OrderLines, PaymentBadge, RangeTabs, formatDateTime, formatDuration, rangeStart, type Range } from "@/components/admin/cafe/CafeParts";

// Waiter performance from the cafe orders in the database: orders taken on each waiter's tables,
// paid bills, sales and the order history behind those numbers.
export function WaitersView() {
  const [range, setRange] = useState<Range>("today");
  const [loaded, setLoaded] = useState<{ range: Range; stats: WaiterStats[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<WaiterStats | null>(null);
  const stats = loaded?.range === range ? loaded.stats : null;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await waitersApi.performance(rangeStart(range));
      if (!alive) return;
      if (res.ok) {
        setLoaded({ range, stats: res.data });
        setError(null);
      } else setError(res.error);
    };
    void load();
    const id = window.setInterval(load, 20000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [range]);

  const totals = (stats ?? []).reduce((t, s) => ({ orders: t.orders + s.totalOrders, bills: t.bills + s.totalBills, sales: t.sales + s.totalSales }), { orders: 0, bills: 0, sales: 0 });
  const best = stats?.find((s) => s.totalSales > 0);

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Team</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Waiter Performance</h1>
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </header>
      <ErrorNote message={error} />
      {!stats && !error && <p className="text-sm text-zinc-400">Loading…</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card label="Orders" value={String(totals.orders)} />
            <Card label="Paid bills" value={String(totals.bills)} />
            <Card label="Sales" value={formatPKR(totals.sales)} />
            <Card label="Top waiter" value={best ? best.name : "—"} />
          </div>

          {stats.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-400">No waiters yet. Add waiters on the Cafe or Employees page.</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {stats.map((s, i) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setOpen(s)} className="flex h-full w-full flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-left transition-colors hover:border-zinc-600">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-lg font-black">
                          {i === 0 && s.totalSales > 0 && <Trophy className="h-4 w-4 shrink-0 text-[#ffd400]" aria-label="Top sales" />}
                          {s.name}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {!s.current ? "Removed" : !s.active ? "Switched off" : s.tables.length ? `Tables ${s.tables.join(", ")}` : "No tables assigned"}
                        </p>
                      </div>
                      {s.openOrders > 0 && <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-300">{s.openOrders} open</span>}
                    </div>
                    <dl className="grid grid-cols-3 gap-2">
                      <Metric icon={<Receipt className="h-3.5 w-3.5" aria-hidden="true" />} label="Total orders" value={String(s.totalOrders)} />
                      <Metric icon={<Wallet className="h-3.5 w-3.5" aria-hidden="true" />} label="Total bills" value={String(s.totalBills)} />
                      <Metric label="Total sales" value={formatPKR(s.totalSales)} />
                    </dl>
                    <p className="text-xs text-zinc-500">
                      Average bill {s.totalBills ? formatPKR(s.averageBill) : "—"} · last order {s.lastOrderAt ? formatDateTime(s.lastOrderAt) : "—"}
                    </p>
                    <span className="text-sm font-semibold text-[#ffd400]">View order history →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {open && <HistoryDialog waiter={open} range={range} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 truncate text-xl font-black tabular-nums">{value}</p>
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-zinc-950 p-3">
      <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-zinc-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 truncate font-black tabular-nums">{value}</dd>
    </div>
  );
}

function HistoryDialog({ waiter, range, onClose }: { waiter: WaiterStats; range: Range; onClose: () => void }) {
  const [orders, setOrders] = useState<CafeOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void waitersApi.orders(waiter.id, rangeStart(range)).then((res) => {
      if (!alive) return;
      if (res.ok) setOrders(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, [waiter.id, range]);
  const label = range === "today" ? "today" : range === "week" ? "this week" : "overall";
  return (
    <Dialog title={`${waiter.name} · orders ${label}`} onClose={onClose} wide>
      <ErrorNote message={error} />
      {!orders && !error && <p className="text-sm text-zinc-400">Loading orders…</p>}
      {orders && orders.length === 0 && <p className="text-sm text-zinc-500">No orders in this period.</p>}
      {orders && orders.length > 0 && (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">Table</th>
                <th className="py-2 pr-3 font-semibold">Order time</th>
                <th className="py-2 pr-3 font-semibold">Prep time</th>
                <th className="py-2 pr-3 font-semibold">Payment</th>
                <th className="py-2 text-right font-semibold">Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {orders.map((o) => (
                <FragmentRow key={o.id} order={o} open={expanded === o.id} onToggle={() => setExpanded(expanded === o.id ? null : o.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

function FragmentRow({ order, open, onToggle }: { order: CafeOrder; open: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className={cn("cursor-pointer hover:bg-zinc-800/50", open && "bg-zinc-800/50")} onClick={onToggle}>
        <td className="py-2 pr-3 font-bold tabular-nums">
          <button type="button" aria-expanded={open} className="underline-offset-2 hover:underline">
            {order.number}
          </button>
        </td>
        <td className="py-2 pr-3">Table {order.tableNumber}</td>
        <td className="py-2 pr-3 tabular-nums text-zinc-400">{formatDateTime(order.createdAt)}</td>
        <td className="py-2 pr-3 font-mono tabular-nums">{order.readyAt ? formatDuration(Date.parse(order.readyAt) - Date.parse(order.createdAt)) : "—"}</td>
        <td className="py-2 pr-3">
          <PaymentBadge order={order} />
        </td>
        <td className="py-2 text-right tabular-nums">{formatPKR(order.total)}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="pb-3">
            <OrderLines order={order} />
          </td>
        </tr>
      )}
    </>
  );
}
