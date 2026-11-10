"use client";

import { useEffect, useState } from "react";
import { useOwner } from "@/components/owner/OwnerShell";
import { orderPlace } from "@/components/owner/OrderParts";
import { formatTime, minutesSince, ownerRequest, usePolled } from "@/lib/ownerApi";
import { cn } from "@/lib/utils";
import type { KitchenStatus, PosOrder } from "@/types/pos";

const COLUMNS: { status: KitchenStatus; title: string; accent: string }[] = [
  { status: "pending", title: "Pending", accent: "border-zinc-600" },
  { status: "preparing", title: "Preparing", accent: "border-sky-500" },
  { status: "ready", title: "Ready", accent: "border-[#ffd400]" },
];

function nextStep(order: PosOrder): { status: string; label: string } | null {
  if (order.kitchenStatus === "pending") return { status: "preparing", label: "Start preparing" };
  if (order.kitchenStatus === "preparing") return { status: "ready", label: "Mark ready" };
  if (order.kitchenStatus === "ready") {
    return order.fulfilment === "delivery" ? { status: "delivered", label: "Delivered" } : { status: "served", label: "Served" };
  }
  return null;
}

// Kitchen Display Screen. Every confirmed order of this restaurant appears here automatically (the list
// reloads every 3 seconds) and moves Pending → Preparing → Ready → Served/Delivered. Each change is
// saved on the order itself, so the Owner screens and the customer's tracking page show it too.
export function KitchenScreen() {
  const { restaurant } = useOwner();
  const kitchen = usePolled<{ orders: PosOrder[] }>("/api/kitchen/orders", 3000);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const advance = async (order: PosOrder) => {
    const step = nextStep(order);
    if (!step) return;
    setBusy(order.id);
    setError(null);
    const result = await ownerRequest(`/api/kitchen/orders/${encodeURIComponent(order.id)}/status`, "PATCH", { status: step.status });
    setBusy(null);
    if (!result.ok) setError(result.error);
    void kitchen.reload();
  };

  const orders = kitchen.data?.orders ?? [];
  return (
    <div className="min-h-dvh bg-zinc-950 p-4 text-white md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Kitchen</h1>
          <p className="text-sm text-zinc-400">
            {restaurant.name} · {orders.length} active {orders.length === 1 ? "order" : "orders"}
          </p>
        </div>
        <p className={cn("text-xs", kitchen.error ? "text-red-400" : "text-emerald-400")} aria-live="polite">
          {kitchen.error ? `Connection problem: ${kitchen.error}` : "Live"}
        </p>
      </header>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const list = orders.filter((o) => o.kitchenStatus === column.status);
          return (
            <section key={column.status} aria-label={column.title} className="rounded-2xl bg-zinc-900 p-3">
              <h2 className="mb-3 px-1 text-sm font-bold uppercase tracking-wide text-zinc-300">
                {column.title} ({list.length})
              </h2>
              <ul className="flex flex-col gap-3">
                {list.map((order) => {
                  const step = nextStep(order);
                  const waited = minutesSince(order.createdAt, now);
                  return (
                    <li key={order.id} className={cn("rounded-xl border-l-4 bg-zinc-800 p-3", column.accent)}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-3xl font-black leading-none">#{order.tokenNumber ?? "–"}</p>
                          <p className="mt-1 text-sm font-semibold">{orderPlace(order)}</p>
                        </div>
                        <div className="text-right text-xs text-zinc-400">
                          <p>{formatTime(order.createdAt)}</p>
                          <p className={cn(waited >= 20 && "font-bold text-red-400")}>{waited} min</p>
                        </div>
                      </div>
                      <ul className="mt-3 space-y-1 text-sm">
                        {order.lines.map((line) => (
                          <li key={line.id}>
                            <span className="font-bold">{line.qty} ×</span> {line.name}
                            {line.options.length > 0 && <span className="block pl-5 text-xs text-zinc-400">{line.options.join(" · ")}</span>}
                            {line.instructions && <span className="block pl-5 text-xs italic text-orange-300">{line.instructions}</span>}
                          </li>
                        ))}
                      </ul>
                      {order.customer.notes && <p className="mt-2 rounded bg-orange-500/10 p-2 text-xs text-orange-200">Note: {order.customer.notes}</p>}
                      {step && (
                        <button
                          type="button"
                          disabled={busy === order.id}
                          onClick={() => void advance(order)}
                          className="mt-3 w-full rounded-lg bg-[#ffd400] py-2 text-sm font-bold text-black disabled:opacity-50"
                        >
                          {busy === order.id ? "Saving…" : step.label}
                        </button>
                      )}
                    </li>
                  );
                })}
                {list.length === 0 && <li className="px-1 py-6 text-center text-sm text-zinc-500">Nothing here.</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
