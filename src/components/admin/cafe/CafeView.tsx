"use client";

import { useMemo, useState } from "react";
import { BellRing, CheckCircle2, Clock, Hash, LayoutGrid, Plus, Settings2, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { cafeApi, type ItemSelection } from "@/lib/cafeApi";
import type { CafeOrder, CafeSnapshot, CafeTable } from "@/lib/cafeTypes";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, Dialog, ErrorNote, MenuPicker, OrderLines, PaymentBadge, formatClock, formatDuration, isPrepLate, prepMs, useAlertBeep, useCafe, useClock } from "./CafeParts";

const inputClass = "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#ffd400]";

// Why a table needs attention: food taking too long, or guests seated for too long.
function tableAlerts(snapshot: CafeSnapshot, orders: Map<string, CafeOrder>, now: number): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of snapshot.tables) {
    const order = t.orderId ? orders.get(t.orderId) : undefined;
    if (t.status !== "occupied" || !order) continue;
    if (isPrepLate(order, now, snapshot.settings.prepAlertMinutes)) out.set(t.id, `Order preparing for ${formatDuration(now - Date.parse(order.createdAt))}`);
    else if (now - Date.parse(order.createdAt) > snapshot.settings.tableAlertMinutes * 60_000) out.set(t.id, `Seated for ${formatDuration(now - Date.parse(order.createdAt))}`);
  }
  return out;
}

type Modal = null | "total" | "waiter" | "assign" | "alerts";

// Tables screen: set up tables and waiters, take orders, follow each table until it is cleaned.
export function CafeView() {
  const { snapshot, error, refresh } = useCafe();
  const now = useClock();
  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [waiterFilter, setWaiterFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const orders = useMemo(() => new Map((snapshot?.openOrders ?? []).map((o) => [o.id, o])), [snapshot]);
  const alerts = useMemo(() => (snapshot ? tableAlerts(snapshot, orders, now) : new Map<string, string>()), [snapshot, orders, now]);
  useAlertBeep(alerts.size);

  if (!snapshot) return error ? <ErrorNote message={error} /> : <p className="text-sm text-zinc-400">Loading tables…</p>;

  const waiterName = new Map(snapshot.waiters.map((w) => [w.id, w.name]));
  const counts = {
    empty: snapshot.tables.filter((t) => t.status === "free").length,
    occupied: snapshot.tables.filter((t) => t.status === "occupied").length,
    cleaning: snapshot.tables.filter((t) => t.status === "cleaning").length,
  };
  const tables = snapshot.tables.filter((t) => waiterFilter === "all" || (waiterFilter === "none" ? !t.waiterId || !waiterName.has(t.waiterId) : t.waiterId === waiterFilter));
  const openTable = snapshot.tables.find((t) => t.id === openTableId) ?? null;

  const addTable = async () => {
    setBusy(true);
    setNotice(null);
    const res = await cafeApi.addTable();
    await refresh();
    setBusy(false);
    setNotice(res.ok ? { tone: "ok", text: "Table added." } : { tone: "error", text: res.error });
  };

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Orders / Tables</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Cafe</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={addTable} disabled={busy}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add Table
          </Button>
          <Button tone="ghost" onClick={() => setModal("total")}>
            <Hash className="h-4 w-4" aria-hidden="true" /> Total Tables
          </Button>
          <Button tone="ghost" onClick={() => setModal("waiter")}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Add Waiter
          </Button>
          <Button tone="ghost" onClick={() => setModal("assign")}>
            <Users className="h-4 w-4" aria-hidden="true" /> Assign Waiters
          </Button>
          <Button tone="ghost" onClick={() => setModal("alerts")} className="px-3" ariaLabel="Alert times">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <ErrorNote message={error} />
      {notice && (
        <p role="status" className={cn("rounded-xl border px-3 py-2 text-sm", notice.tone === "ok" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300")}>
          {notice.text}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total tables" value={snapshot.tables.length} />
        <Stat label="Empty" value={counts.empty} className="text-red-400" />
        <Stat label="Occupied" value={counts.occupied} className="text-emerald-400" />
        <Stat label={alerts.size ? "Alerts" : "To clean"} value={alerts.size || counts.cleaning} className={alerts.size ? "text-amber-300" : "text-sky-400"} />
      </div>

      {alerts.size > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
          <p className="flex items-center gap-2 font-bold text-amber-200">
            <BellRing className="h-4 w-4" aria-hidden="true" /> Needs attention
          </p>
          <ul className="flex flex-wrap gap-2">
            {[...alerts].map(([tableId, reason]) => (
              <li key={tableId}>
                <button type="button" onClick={() => setOpenTableId(tableId)} className="rounded-full bg-amber-400/20 px-3 py-1 text-sm font-semibold text-amber-100 hover:bg-amber-400/30">
                  Table {snapshot.tables.find((x) => x.id === tableId)?.number} · {reason}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {snapshot.tables.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-700 p-10 text-center">
          <LayoutGrid className="h-8 w-8 text-zinc-500" aria-hidden="true" />
          <p className="font-bold">No tables yet</p>
          <p className="max-w-md text-sm text-zinc-400">Use “Add Table” to add one at a time, or “Total Tables” to set how many tables the cafe has. Then add waiters and assign their tables.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Waiter</span>
            {[{ id: "all", name: "All tables" }, ...snapshot.waiters, { id: "none", name: "Unassigned" }].map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWaiterFilter(w.id)}
                className={cn("rounded-full px-3 py-1.5 text-xs font-bold", waiterFilter === w.id ? "bg-white text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
              >
                {w.name}
              </button>
            ))}
            <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-zinc-400">
              <Legend className="bg-red-500" label="Empty" />
              <Legend className="bg-emerald-500" label="Occupied" />
              <Legend className="bg-sky-500" label="To clean" />
              <Legend className="bg-amber-400" label="Alert" />
            </span>
          </div>

          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tables.map((t) => (
              <li key={t.id}>
                <TableCard table={t} order={t.orderId ? orders.get(t.orderId) : undefined} waiter={t.waiterId ? waiterName.get(t.waiterId) : undefined} alert={alerts.get(t.id)} now={now} onOpen={() => setOpenTableId(t.id)} />
              </li>
            ))}
          </ul>
        </>
      )}

      {openTable && (
        <TableDialog
          table={openTable}
          order={openTable.orderId ? orders.get(openTable.orderId) : undefined}
          waiter={openTable.waiterId ? waiterName.get(openTable.waiterId) : undefined}
          alert={alerts.get(openTable.id)}
          now={now}
          onClose={() => setOpenTableId(null)}
          onChanged={refresh}
        />
      )}
      {modal === "total" && <TotalTablesDialog current={snapshot.tables.length} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "waiter" && <AddWaiterDialog onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "assign" && <AssignDialog snapshot={snapshot} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal === "alerts" && <AlertsDialog snapshot={snapshot} onClose={() => setModal(null)} onSaved={refresh} />}
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} aria-hidden="true" /> {label}
    </span>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={cn("mt-2 text-2xl font-black tabular-nums", className)}>{value}</p>
    </div>
  );
}

// Red = empty, green = occupied, blue = waiting to be cleaned. An alert adds a flashing amber ring.
function TableCard({ table, order, waiter, alert, now, onOpen }: { table: CafeTable; order?: CafeOrder; waiter?: string; alert?: string; now: number; onOpen: () => void }) {
  const look =
    table.status === "free"
      ? { label: "Empty", card: "border-red-500/50 bg-red-500/10", badge: "bg-red-500 text-white" }
      : table.status === "cleaning"
        ? { label: "To clean", card: "border-sky-500/50 bg-sky-500/10", badge: "bg-sky-500 text-black" }
        : { label: order?.status === "ready" ? "Served" : "Occupied", card: "border-emerald-500/60 bg-emerald-500/10", badge: "bg-emerald-500 text-black" };
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Table ${table.number}, ${look.label}${alert ? `, alert: ${alert}` : ""}`}
      className={cn("flex h-full w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-transform hover:-translate-y-0.5", look.card, alert && "animate-pulse ring-2 ring-amber-400")}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-zinc-400">Table</p>
          <p className="text-3xl font-black leading-none">{table.number}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", look.badge)}>{look.label}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="col-span-2">
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Waiter</dt>
          <dd className="truncate font-semibold">{waiter ?? <span className="text-zinc-500">Not assigned</span>}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Order time</dt>
          <dd className="font-semibold tabular-nums">{order ? formatClock(order.createdAt) : "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Total bill</dt>
          <dd className="font-semibold tabular-nums">{order ? formatPKR(order.total) : "—"}</dd>
        </div>
      </dl>
      {table.status === "occupied" && order && (
        <p className={cn("flex items-center gap-1.5 font-mono text-sm tabular-nums", alert ? "font-bold text-amber-200" : "text-zinc-300")}>
          {alert ? <BellRing className="h-3.5 w-3.5" aria-hidden="true" /> : <Clock className="h-3.5 w-3.5" aria-hidden="true" />}
          {formatDuration(now - Date.parse(order.createdAt))}
        </p>
      )}
      {table.status === "cleaning" && table.cleaningSince && <p className="text-xs text-sky-200">Guests left at {formatClock(table.cleaningSince)}</p>}
    </button>
  );
}

function TableDialog({ table, order, waiter, alert, now, onClose, onChanged }: { table: CafeTable; order?: CafeOrder; waiter?: string; alert?: string; now: number; onClose: () => void; onChanged: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setBusy(true);
    setError(null);
    const res = await action();
    await onChanged();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
    else after?.();
  };

  const placeOrder = (items: ItemSelection) => run(() => cafeApi.orderForTable(table.id, items), () => setAdding(false));
  const title = `Table ${table.number}${waiter ? ` · ${waiter}` : ""}`;

  if (table.status === "free" || adding) {
    return (
      <Dialog title={adding ? `${title} · add items` : `${title} · new order`} onClose={adding ? () => setAdding(false) : onClose} wide>
        <MenuPicker confirmLabel={adding ? "Add to order" : "Confirm order"} busy={busy} onConfirm={placeOrder} header={<ErrorNote message={error} />} />
      </Dialog>
    );
  }

  if (table.status === "cleaning") {
    return (
      <Dialog title={title} onClose={onClose}>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <Sparkles className="h-10 w-10 text-sky-300" aria-hidden="true" />
          <div>
            <p className="text-lg font-bold">Table needs cleaning</p>
            {table.cleaningSince && <p className="text-sm text-zinc-400">Guests left at {formatClock(table.cleaningSince)} ({formatDuration(now - Date.parse(table.cleaningSince))} ago)</p>}
          </div>
          <ErrorNote message={error} />
          <Button tone="success" disabled={busy} onClick={() => run(() => cafeApi.cleaned(table.id), onClose)} className="w-full">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Cleaned · ready for new customers
          </Button>
        </div>
      </Dialog>
    );
  }

  if (!order) {
    return (
      <Dialog title={title} onClose={onClose}>
        <p className="text-sm text-zinc-400">Loading order…</p>
      </Dialog>
    );
  }

  return (
    <Dialog title={`${title} · order #${order.number}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {alert && (
          <p className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-200">
            <BellRing className="h-4 w-4" aria-hidden="true" /> {alert}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Info label="Order time" value={formatClock(order.createdAt)} />
          <Info label="Seated for" value={formatDuration(now - Date.parse(order.createdAt))} />
          <Info label={order.status === "preparing" ? "Preparing" : "Prep time"} value={formatDuration(prepMs(order, now))} highlight={order.status === "preparing"} />
          <div className="flex flex-col items-center justify-center rounded-xl bg-zinc-950 px-2 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Payment</dt>
            <dd className="mt-1">
              <PaymentBadge order={order} />
            </dd>
          </div>
        </dl>
        <OrderLines order={order} />
        <ErrorNote message={error} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Button tone="ghost" disabled={busy} onClick={() => setAdding(true)}>Add items</Button>
          {order.status === "preparing" ? (
            <Button disabled={busy} onClick={() => run(() => cafeApi.ready(order.id))}>Food served</Button>
          ) : (
            <span className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Served at {order.readyAt && formatClock(order.readyAt)}
            </span>
          )}
        </div>
        <Button tone="success" disabled={busy} onClick={() => run(() => cafeApi.complete(order.id), onClose)}>
          Bill received · mark paid ({formatPKR(order.total)})
        </Button>
      </div>
    </Dialog>
  );
}

function Info({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-zinc-950 px-2 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={cn("mt-1 font-mono text-sm font-bold tabular-nums", highlight && "text-orange-300")}>{value}</dd>
    </div>
  );
}

// ----- Setup dialogs -----

function useAction(onSaved: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<{ ok: boolean; error?: string }>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const res = await action();
    await onSaved();
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Something went wrong.");
    return res.ok;
  };
  return { busy, error, run };
}

function TotalTablesDialog({ current, onClose, onSaved }: { current: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const [count, setCount] = useState(String(current || ""));
  const { busy, error, run } = useAction(onSaved);
  return (
    <Dialog title="Total tables" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => cafeApi.setTableCount(Number(count)))) onClose();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          How many tables does the cafe have?
          <input type="number" min={0} max={200} required value={count} onChange={(e) => setCount(e.target.value)} className={inputClass} aria-label="Total tables" autoFocus />
        </label>
        <p className="text-xs text-zinc-500">Currently {current}. New tables are numbered after the last one. Lowering the number removes the last tables, only when they are empty.</p>
        <ErrorNote message={error} />
        <Button type="submit" disabled={busy || count === ""}>{busy ? "Saving…" : "Save"}</Button>
      </form>
    </Dialog>
  );
}

function AddWaiterDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const { busy, error, run } = useAction(onSaved);
  return (
    <Dialog title="Add waiter" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => cafeApi.addWaiter(name, phone))) onClose();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required className={inputClass} aria-label="Waiter name" autoFocus />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          <span>
            Phone <span className="font-normal text-zinc-500">(optional)</span>
          </span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} className={inputClass} aria-label="Waiter phone" />
        </label>
        <p className="text-xs text-zinc-500">Salary and duties can be set on the Employees page.</p>
        <ErrorNote message={error} />
        <Button type="submit" disabled={busy || name.trim().length < 2}>{busy ? "Saving…" : "Add waiter"}</Button>
      </form>
    </Dialog>
  );
}

function AssignDialog({ snapshot, onClose, onSaved }: { snapshot: CafeSnapshot; onClose: () => void; onSaved: () => Promise<void> }) {
  const [waiterId, setWaiterId] = useState(snapshot.waiters[0]?.id ?? "");
  const { busy, error, run } = useAction(onSaved);
  const [saved, setSaved] = useState<string | null>(null);
  const names = new Map(snapshot.waiters.map((w) => [w.id, w.name]));

  if (snapshot.waiters.length === 0 || snapshot.tables.length === 0) {
    return (
      <Dialog title="Assign waiters" onClose={onClose}>
        <p className="text-sm text-zinc-400">{snapshot.tables.length === 0 ? "Add tables first." : "Add a waiter first."}</p>
      </Dialog>
    );
  }
  const selected = names.has(waiterId) ? waiterId : snapshot.waiters[0].id;
  return (
    <Dialog title="Assign waiters to tables" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={(e) => {
              setWaiterId(e.target.value);
              setSaved(null);
            }}
            className={inputClass}
            aria-label="Waiter"
          >
            {snapshot.waiters.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({snapshot.tables.filter((t) => t.waiterId === w.id).length} tables)
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label={`Remove ${names.get(selected)}`}
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Remove ${names.get(selected)}? Their tables become unassigned. Past orders are kept.`)) return;
              await run(() => cafeApi.removeWaiter(selected));
            }}
            className="flex w-11 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-300 hover:bg-red-500/20"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <AssignTables
          key={selected}
          snapshot={snapshot}
          waiterId={selected}
          busy={busy}
          onSave={async (ids) => {
            if (await run(() => cafeApi.assignTables(selected, ids))) setSaved(`Saved ${ids.length} table${ids.length === 1 ? "" : "s"} for ${names.get(selected)}.`);
          }}
        />
        <ErrorNote message={error} />
        {saved && <p className="text-sm text-emerald-400">{saved}</p>}
      </div>
    </Dialog>
  );
}

function AssignTables({ snapshot, waiterId, busy, onSave }: { snapshot: CafeSnapshot; waiterId: string; busy: boolean; onSave: (ids: string[]) => void }) {
  const [picked, setPicked] = useState(() => new Set(snapshot.tables.filter((t) => t.waiterId === waiterId).map((t) => t.id)));
  const names = new Map(snapshot.waiters.map((w) => [w.id, w.name]));
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <>
      <p className="text-sm text-zinc-400">Tap the tables this waiter serves. A table taken from another waiter moves to this one.</p>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
        {snapshot.tables.map((t) => {
          const on = picked.has(t.id);
          const other = t.waiterId && t.waiterId !== waiterId ? names.get(t.waiterId) : null;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              title={other ? `Now: ${other}` : undefined}
              onClick={() => toggle(t.id)}
              className={cn("rounded-lg px-2 py-2 text-sm font-bold", on ? "bg-[#ffd400] text-black" : other ? "bg-zinc-800 text-zinc-500" : "bg-zinc-800 text-white hover:bg-zinc-700")}
            >
              T{t.number}
            </button>
          );
        })}
      </div>
      <Button disabled={busy} onClick={() => onSave([...picked])}>
        Save {picked.size} table{picked.size === 1 ? "" : "s"}
      </Button>
    </>
  );
}

function AlertsDialog({ snapshot, onClose, onSaved }: { snapshot: CafeSnapshot; onClose: () => void; onSaved: () => Promise<void> }) {
  const [prep, setPrep] = useState(String(snapshot.settings.prepAlertMinutes));
  const [seated, setSeated] = useState(String(snapshot.settings.tableAlertMinutes));
  const { busy, error, run } = useAction(onSaved);
  return (
    <Dialog title="Alert times" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => cafeApi.saveSettings(Number(prep), Number(seated)))) onClose();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Alert when an order is still preparing after (minutes)
          <input type="number" min={1} value={prep} onChange={(e) => setPrep(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Alert when guests have been seated longer than (minutes)
          <input type="number" min={1} value={seated} onChange={(e) => setSeated(e.target.value)} className={inputClass} />
        </label>
        <ErrorNote message={error} />
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save alert times"}</Button>
      </form>
    </Dialog>
  );
}
