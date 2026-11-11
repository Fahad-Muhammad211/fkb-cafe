"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, Search, X } from "lucide-react";
import { fetchCatalog, type CatalogSnapshot } from "@/lib/catalogApi";
import { cafeApi, type ItemSelection } from "@/lib/cafeApi";
import type { CafeOrder, CafeSnapshot } from "@/lib/cafeTypes";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";

// Shared pieces of the Admin Cafe, Takeaway and Dashboard history screens.

const POLL_MS = 5000;

// The cafe state from the server, refreshed every few seconds so several screens (counter, kitchen,
// a waiter's phone) stay in step. `refresh` reloads at once after an action.
export function useCafe() {
  const [snapshot, setSnapshot] = useState<CafeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await cafeApi.snapshot();
    if (res.ok) {
      setSnapshot(res.data);
      setError(null);
    } else {
      setError(res.error);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (alive && document.visibilityState === "visible") void refresh();
    };
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  return { snapshot, error, refresh };
}

export function useMenu() {
  const [catalog, setCatalog] = useState<CatalogSnapshot | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchCatalog().then((c) => alive && setCatalog(c));
    return () => {
      alive = false;
    };
  }, []);
  return catalog;
}

// Ticks every second, for the live timers.
export function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export const formatClock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

// Preparation time: until served/ready, or still running.
export function prepMs(order: CafeOrder, now: number): number {
  return (order.readyAt ? Date.parse(order.readyAt) : now) - Date.parse(order.createdAt);
}

export function isPrepLate(order: CafeOrder, now: number, alertMinutes: number): boolean {
  return order.status === "preparing" && now - Date.parse(order.createdAt) > alertMinutes * 60_000;
}

// A short beep when the number of alerts goes up. Browsers allow sound only after the page was used,
// so the first alert after load can be silent; the red flashing card still shows it.
export function useAlertBeep(count: number) {
  const previous = useRef(count);
  useEffect(() => {
    if (count > previous.current) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
        osc.onended = () => void ctx.close();
      } catch {
        // No audio available; the visual alert is enough.
      }
    }
    previous.current = count;
  }, [count]);
}

export function Dialog({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Rendered into <body>: the page wrapper animates with a transform, which would otherwise make
  // "fixed" relative to the page content instead of the screen.
  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn("flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-900 md:rounded-2xl", wide ? "md:max-w-4xl" : "md:max-w-lg")}
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Button({
  children,
  onClick,
  disabled,
  tone = "primary",
  className,
  type = "button",
  ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "primary" | "ghost" | "danger" | "success";
  className?: string;
  type?: "button" | "submit";
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        tone === "primary" && "bg-[#ffd400] text-black hover:bg-[#ffe14d]",
        tone === "ghost" && "bg-zinc-800 text-white hover:bg-zinc-700",
        tone === "danger" && "bg-red-500/15 text-red-300 hover:bg-red-500/25",
        tone === "success" && "bg-emerald-500 text-black hover:bg-emerald-400",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{message}</p>;
}

// The bill: each item with quantity, unit price and amount, then the total.
export function OrderLines({ order }: { order: CafeOrder }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-950 text-[11px] uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Item</th>
            <th className="px-2 py-2 text-right font-semibold">Qty</th>
            <th className="px-2 py-2 text-right font-semibold">Price</th>
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {order.items.map((l) => (
            <tr key={`${l.productId}-${l.price}`}>
              <td className="px-3 py-2">{l.name}</td>
              <td className="px-2 py-2 text-right font-bold tabular-nums">{l.qty}</td>
              <td className="px-2 py-2 text-right tabular-nums text-zinc-400">{formatPKR(l.price)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatPKR(l.price * l.qty)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-800 font-black">
            <td className="px-3 py-2" colSpan={3}>
              Total bill
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{formatPKR(order.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function PaymentBadge({ order }: { order: CafeOrder }) {
  const paid = order.status === "completed";
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", paid ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300")}>
      {paid ? "Paid" : "Unpaid"}
    </span>
  );
}

export type Range = "today" | "week" | "all";
export const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "all", label: "Overall" },
];

// Start of the range in the viewer's local time. The week starts on Monday.
export function rangeStart(range: Range): Date | null {
  if (range === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === "week") d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function RangeTabs({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  return (
    <div role="tablist" className="flex gap-1 rounded-full bg-zinc-950 p-1">
      {RANGES.map((r) => (
        <button
          key={r.id}
          role="tab"
          type="button"
          aria-selected={value === r.id}
          onClick={() => onChange(r.id)}
          className={cn("rounded-full px-3 py-1.5 text-xs font-bold", value === r.id ? "bg-[#ffd400] text-black" : "text-zinc-300 hover:text-white")}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// Menu with category tabs, search and quantity steppers. Calls onConfirm with the chosen items.
export function MenuPicker({ confirmLabel, onConfirm, busy, header }: { confirmLabel: string; onConfirm: (items: ItemSelection) => void; busy: boolean; header?: ReactNode }) {
  const catalog = useMenu();
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});

  const products = useMemo(() => (catalog?.products ?? []).filter((p) => p.available !== false), [catalog]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => (category === "all" || p.categoryId === category) && (!q || p.name.toLowerCase().includes(q)));
  }, [products, category, query]);

  const chosen = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const total = chosen.reduce((sum, p) => sum + p.price * qty[p.id], 0);
  const count = chosen.reduce((sum, p) => sum + qty[p.id], 0);
  const change = (id: string, delta: number) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(99, (q[id] ?? 0) + delta)) }));

  if (!catalog) return <p className="text-sm text-zinc-400">Loading menu…</p>;

  return (
    <div className="flex flex-col gap-4">
      {header}
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the menu"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#ffd400]"
        />
      </label>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {[{ id: "all", label: "All" }, ...catalog.categories].map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-bold", category === c.id ? "bg-[#ffd400] text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
          >
            {c.label}
          </button>
        ))}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {shown.map((p) => {
          const n = qty[p.id] ?? 0;
          const soldOut = p.stock === "out";
          return (
            <li key={p.id} className={cn("flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5", n > 0 ? "border-[#ffd400]/60 bg-[#ffd400]/5" : "border-zinc-800 bg-zinc-950")}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-zinc-400">{soldOut ? "Sold out" : formatPKR(p.price)}{p.pieces ? ` · ${p.pieces}` : ""}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {n > 0 && (
                  <>
                    <button type="button" aria-label={`Remove one ${p.name}`} onClick={() => change(p.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700">
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <span className="w-5 text-center text-sm font-bold tabular-nums">{n}</span>
                  </>
                )}
                <button
                  type="button"
                  aria-label={`Add ${p.name}`}
                  disabled={soldOut}
                  onClick={() => change(p.id, 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ffd400] text-black hover:bg-[#ffe14d] disabled:opacity-30"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
        {shown.length === 0 && <li className="text-sm text-zinc-500">No items match.</li>}
      </ul>
      <div className="sticky -bottom-5 -mx-5 -mb-5 flex items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-900 px-5 py-4">
        <div className="text-sm">
          <p className="font-bold">{count} item{count === 1 ? "" : "s"}</p>
          <p className="tabular-nums text-zinc-400">{formatPKR(total)}</p>
        </div>
        <Button disabled={count === 0 || busy} onClick={() => onConfirm(chosen.map((p) => ({ productId: p.id, qty: qty[p.id] })))}>
          {busy ? "Saving…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
