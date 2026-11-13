"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { cancelOrder, confirmOrder, ordersStore, parseOrders, setOrderProgress } from "@/lib/orders";
import { formatPKR } from "@/lib/format";
import { currentStepIndex, isAwaitingConfirmation, isCancelled, isDelivered, ORDER_STEPS, stepLabel } from "@/lib/orderStatus";
import { inputClass } from "@/components/ui/FormField";
import type { Order } from "@/types";

// Filter keys: "all", "pending", "cancelled", or the step index of a confirmed order.
type FilterKey = "all" | "pending" | "cancelled" | number;

const filterKeyFor = (order: Order): FilterKey => {
  if (isCancelled(order)) return "cancelled";
  if (isAwaitingConfirmation(order)) return "pending";
  return currentStepIndex(order);
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Awaiting confirmation" },
  ...ORDER_STEPS.map((label, i) => ({ value: String(i), label })),
  { value: "cancelled", label: "Cancelled" },
];

export function OrdersView() {
  const raw = useSyncExternalStore(ordersStore.subscribe, ordersStore.getSnapshot, ordersStore.getServerSnapshot);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const orders = useMemo(
    () => parseOrders(raw).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [raw],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && String(filterKeyFor(o)) !== statusFilter) return false;
      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        o.customer.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
      );
    });
  }, [orders, query, statusFilter]);

  if (raw === undefined) {
    return <p className="text-sm text-zinc-400">Loading orders…</p>;
  }

  // Runs one server action for an order and shows the server's message if it is refused.
  const act = async (order: Order, action: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusyId(order.id);
    setActionError(null);
    const result = await action();
    setBusyId(null);
    if (!result.ok) setActionError(`${order.id}: ${result.error ?? "The change could not be saved."}`);
  };

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Management</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Orders</h1>
          <p className="mt-1 text-sm text-zinc-400">{orders.length} total · {filtered.length} shown</p>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <label className="relative block">
          <span className="sr-only">Search orders</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by order id, name or phone"
            className={`${inputClass} pl-11`}
          />
        </label>
        <label className="block">
          <span className="sr-only">Filter by status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass}>
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {actionError}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 px-6 py-12 text-center text-sm text-zinc-400">
          {orders.length === 0 ? (
            <>
              No orders yet. Place one from the <Link href="/" className="text-[#ffd400] underline">storefront</Link>.
            </>
          ) : (
            "No orders match these filters."
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-2xl border border-zinc-800 md:block">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Order</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Placed</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filtered.map((o) => (
                  <tr key={o.id} className="transition-colors hover:bg-zinc-900/60">
                    <td className="px-4 py-3 font-semibold">{o.id}</td>
                    <td className="px-4 py-3">
                      <p>{o.customer.name}</p>
                      <p className="text-xs text-zinc-500">{o.customer.phone}</p>
                    </td>
                    <td className="px-4 py-3 capitalize text-zinc-300">{o.fulfilment}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPKR(o.total)}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {new Date(o.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3">
                      <StatusText order={o} />
                    </td>
                    <td className="px-4 py-3">
                      <OrderActions order={o} busy={busyId === o.id} onAct={act} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="flex flex-col gap-3 md:hidden">
            {filtered.map((o) => (
              <li key={o.id} className="animate-card-in rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">{o.id}</p>
                    <p className="text-sm text-zinc-300">{o.customer.name}</p>
                    <p className="text-xs text-zinc-500 capitalize">
                      {o.fulfilment} · {new Date(o.createdAt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  </div>
                  <p className="font-bold tabular-nums">{formatPKR(o.total)}</p>
                </div>
                <div className="mt-3 flex flex-col gap-3">
                  <StatusText order={o} />
                  <OrderActions order={o} busy={busyId === o.id} onAct={act} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StatusText({ order }: { order: Order }) {
  const label = stepLabel(order, currentStepIndex(order));
  return (
    <p className="text-sm">
      <span className={isCancelled(order) ? "text-red-400" : "text-white"}>{label}</span>
      <span className="block text-xs text-zinc-500">Payment: {order.paymentStatus ?? "pending"} (cash on delivery)</span>
    </p>
  );
}

// Confirm and cancel while pending; progress and cancel once confirmed; nothing after cancel or delivery.
function OrderActions({
  order,
  busy,
  onAct,
}: {
  order: Order;
  busy: boolean;
  onAct: (order: Order, action: () => Promise<{ ok: boolean; error?: string }>) => Promise<void>;
}) {
  const buttonClass =
    "rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50";

  if (isCancelled(order)) return <span className="text-xs text-zinc-500">No actions</span>;

  if (isAwaitingConfirmation(order)) {
    return (
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => onAct(order, () => confirmOrder(order.id))} className="rounded-full bg-[#ffd400] px-3 py-1.5 text-xs font-bold text-black transition-transform hover:scale-105 disabled:opacity-50">
          Confirm
        </button>
        <button type="button" disabled={busy} onClick={() => onAct(order, () => cancelOrder(order.id))} className={buttonClass}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`progress-${order.id}`}>Progress for {order.id}</label>
      <select
        id={`progress-${order.id}`}
        disabled={busy}
        value={currentStepIndex(order)}
        onChange={(e) => {
          const step = Number(e.target.value);
          onAct(order, () => setOrderProgress(order.id, step));
        }}
        className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white focus:border-[#ffd400] focus:outline-none disabled:opacity-50"
      >
        {ORDER_STEPS.map((_, i) => (
          <option key={i} value={i} disabled={i === 0}>
            {stepLabel(order, i)}
          </option>
        ))}
      </select>
      {!isDelivered(order) && (
        <button type="button" disabled={busy} onClick={() => onAct(order, () => cancelOrder(order.id))} className={buttonClass}>
          Cancel
        </button>
      )}
    </div>
  );
}
