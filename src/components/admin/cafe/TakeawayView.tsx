"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChefHat, Plus, Wallet } from "lucide-react";
import { cafeApi, type ItemSelection } from "@/lib/cafeApi";
import type { CafeOrder } from "@/lib/cafeTypes";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, Dialog, ErrorNote, MenuPicker, OrderLines, formatClock, formatDuration, isPrepLate, prepMs, useAlertBeep, useCafe, useClock } from "./CafeParts";

// Takeaway counter: new order → timer runs while preparing → Ready → Payment done (completed).
export function TakeawayView() {
  const { snapshot, error, refresh } = useCafe();
  const now = useClock();
  const [creating, setCreating] = useState(false);

  const takeaways = useMemo(() => (snapshot?.openOrders ?? []).filter((o) => o.kind === "takeaway"), [snapshot]);
  const preparing = takeaways.filter((o) => o.status === "preparing");
  const ready = takeaways.filter((o) => o.status === "ready");
  const alertMinutes = snapshot?.settings.prepAlertMinutes ?? 15;
  const lateCount = preparing.filter((o) => isPrepLate(o, now, alertMinutes)).length;
  useAlertBeep(lateCount);

  if (!snapshot) return error ? <ErrorNote message={error} /> : <p className="text-sm text-zinc-400">Loading takeaway…</p>;

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Counter</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Takeaway</h1>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" /> New takeaway order
        </Button>
      </header>

      <ErrorNote message={error} />
      {lateCount > 0 && (
        <p role="alert" className="flex items-center gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 font-semibold text-red-300">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {lateCount} order{lateCount === 1 ? " is" : "s are"} taking longer than {alertMinutes} minutes.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Column title="Preparing" icon={<ChefHat className="h-4 w-4" aria-hidden="true" />} count={preparing.length} empty="No orders being prepared.">
          {preparing.map((o) => (
            <TakeawayCard key={o.id} order={o} now={now} late={isPrepLate(o, now, alertMinutes)} onChanged={refresh} />
          ))}
        </Column>
        <Column title="Ready · waiting for payment" icon={<Wallet className="h-4 w-4" aria-hidden="true" />} count={ready.length} empty="Nothing waiting for pickup.">
          {ready.map((o) => (
            <TakeawayCard key={o.id} order={o} now={now} late={false} onChanged={refresh} />
          ))}
        </Column>
      </div>

      {creating && <NewTakeaway onClose={() => setCreating(false)} onCreated={refresh} />}
    </div>
  );
}

function Column({ title, icon, count, empty, children }: { title: string; icon: React.ReactNode; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="flex items-center gap-2 font-bold">
        {icon} {title} <span className="ml-auto rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs tabular-nums">{count}</span>
      </h2>
      {count === 0 ? <p className="text-sm text-zinc-500">{empty}</p> : <ul className="flex flex-col gap-3">{children}</ul>}
    </section>
  );
}

function TakeawayCard({ order, now, late, onChanged }: { order: CafeOrder; now: number; late: boolean; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    await onChanged();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
  };
  return (
    <li className={cn("flex flex-col gap-3 rounded-xl border bg-zinc-950 p-4", late ? "animate-pulse border-red-500 ring-2 ring-red-500" : "border-zinc-800")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-black">#{order.number}</p>
          <p className="text-sm text-zinc-400">{order.customerName ?? "Walk-in"} · ordered {formatClock(order.createdAt)}</p>
        </div>
        <div className="text-right">
          <p className={cn("font-mono text-lg font-bold tabular-nums", late ? "text-red-300" : order.status === "preparing" ? "text-orange-300" : "text-emerald-400")}>
            {formatDuration(prepMs(order, now))}
          </p>
          <p className="text-xs text-zinc-500">{order.status === "preparing" ? "preparing" : "prep time"}</p>
        </div>
      </div>
      <OrderLines order={order} />
      <ErrorNote message={error} />
      {order.status === "preparing" ? (
        <Button disabled={busy} onClick={() => act(() => cafeApi.ready(order.id))}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Ready
        </Button>
      ) : (
        <Button tone="success" disabled={busy} onClick={() => act(() => cafeApi.complete(order.id))}>
          <Wallet className="h-4 w-4" aria-hidden="true" /> Payment done · {formatPKR(order.total)}
        </Button>
      )}
    </li>
  );
}

function NewTakeaway({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (items: ItemSelection) => {
    setBusy(true);
    setError(null);
    const res = await cafeApi.createTakeaway(name, items);
    await onCreated();
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error);
  };
  return (
    <Dialog title="New takeaway order" onClose={onClose} wide>
      <MenuPicker
        confirmLabel="Confirm order"
        busy={busy}
        onConfirm={submit}
        header={
          <>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name (optional)"
              maxLength={60}
              aria-label="Customer name"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-[#ffd400]"
            />
            <ErrorNote message={error} />
          </>
        }
      />
    </Dialog>
  );
}
