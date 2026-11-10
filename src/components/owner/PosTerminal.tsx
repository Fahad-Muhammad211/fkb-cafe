"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Minus, Plus, Search, Trash2, X } from "lucide-react";
import { ProductImage } from "@/components/ui/ProductImage";
import { formatPKR } from "@/lib/format";
import { newClientOrderId, ownerRequest, usePolled } from "@/lib/ownerApi";
import { cn } from "@/lib/utils";
import type { ProductOption } from "@/types";
import type { PosOrder } from "@/types/pos";

type MenuGroup = { id: string; label: string; options: ProductOption[] };
type MenuItem = { id: string; categoryId: string; name: string; price: number; image?: string; description?: string; available: boolean; groups: MenuGroup[] };
type MenuData = { categories: { id: string; label: string }[]; items: MenuItem[] };

type CartLine = { key: string; item: MenuItem; choices: Record<string, string>; qty: number };

// Unit price shown in the cart. Only for display: the server prices every line from the menu.
function unitPrice(item: MenuItem, choices: Record<string, string>): number {
  return item.groups.reduce((sum, g) => sum + (g.options.find((o) => o.id === choices[g.id])?.priceDelta ?? 0), item.price);
}

function choiceLabels(item: MenuItem, choices: Record<string, string>): string[] {
  return item.groups
    .map((g) => g.options.find((o) => o.id === choices[g.id]))
    .filter((o): o is ProductOption => Boolean(o) && (o as ProductOption).id !== "none")
    .map((o) => o.label);
}

const defaultChoices = (item: MenuItem) => Object.fromEntries(item.groups.map((g) => [g.id, g.options[0]?.id ?? ""]));

// The POS: food menu, cart and order confirmation. Used for a table (dine-in) and for takeaway.
// "Confirm & send to kitchen" creates one order with one invoice and one token; pressing it again
// (for example after a network error) sends the same reference, so the server returns that same order.
export function PosTerminal({
  orderType,
  table,
  onCreated,
}: {
  orderType: "dine_in" | "takeaway";
  table?: { id: string; number: number };
  onCreated?: (order: PosOrder) => void;
}) {
  const menu = usePolled<MenuData>("/api/owner/menu", 60_000);
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picking, setPicking] = useState<{ item: MenuItem; choices: Record<string, string> } | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "" });
  const [notes, setNotes] = useState("");
  const [review, setReview] = useState<string | null>(null); // clientOrderId while the review is open
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PosOrder | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (menu.data?.items ?? []).filter((i) => (category === "all" || i.categoryId === category) && (!q || i.name.toLowerCase().includes(q)));
  }, [menu.data, category, query]);

  const subtotal = cart.reduce((sum, l) => sum + unitPrice(l.item, l.choices) * l.qty, 0);
  const count = cart.reduce((sum, l) => sum + l.qty, 0);

  const addToCart = (item: MenuItem, choices: Record<string, string>) => {
    const key = `${item.id}|${JSON.stringify(choices)}`;
    setCart((lines) => {
      const found = lines.find((l) => l.key === key);
      if (found) return lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + 1) } : l));
      return [...lines, { key, item, choices, qty: 1 }];
    });
  };
  const changeQty = (key: string, delta: number) =>
    setCart((lines) => lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + delta) } : l)).filter((l) => l.qty > 0));

  const confirm = async () => {
    if (!review) return;
    setSending(true);
    setError(null);
    const result = await ownerRequest<{ order: PosOrder }>("/api/owner/orders", "POST", {
      clientOrderId: review,
      orderType,
      ...(table ? { tableId: table.id } : {}),
      customer,
      notes,
      lines: cart.map((l) => ({ itemId: l.item.id, qty: l.qty, choices: l.choices })),
    });
    setSending(false);
    if (!result.ok) {
      setError(result.errors ? Object.values(result.errors)[0] : result.error);
      return;
    }
    setCreated(result.data.order);
    setReview(null);
    setCart([]);
    setCustomer({ name: "", phone: "" });
    setNotes("");
    onCreated?.(result.data.order);
  };

  if (created) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <CheckCircle2 className="h-12 w-12 text-emerald-400" aria-hidden="true" />
        <p className="text-lg font-bold">Order sent to the kitchen</p>
        <div className="grid w-full grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#ffd400] p-3 text-black">
            <p className="text-xs font-semibold uppercase">Token</p>
            <p className="text-3xl font-black">{created.tokenNumber}</p>
          </div>
          <div className="rounded-xl bg-zinc-800 p-3">
            <p className="text-xs font-semibold uppercase text-zinc-400">Invoice</p>
            <p className="break-all text-sm font-bold">{created.invoiceNumber}</p>
          </div>
        </div>
        <p className="text-sm text-zinc-300">
          {table ? `Table ${table.number}` : "Takeaway"} · {formatPKR(created.total)} · Unpaid
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/owner/invoices/${encodeURIComponent(created.id)}`} target="_blank" className="rounded-full bg-[#ffd400] px-5 py-2.5 text-sm font-bold text-black">
            Print invoice
          </Link>
          <button type="button" onClick={() => setCreated(null)} className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold hover:bg-zinc-800">
            New order
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-label="Menu" className="min-w-0">
        <div className="mb-4 flex flex-wrap gap-2">
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">Search the menu</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search food"
              className="w-full rounded-full border border-zinc-700 bg-zinc-900 py-2 pl-9 pr-4 text-sm outline-none focus:border-[#ffd400]"
            />
          </label>
        </div>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {[{ id: "all", label: "All" }, ...(menu.data?.categories ?? [])].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold",
                category === c.id ? "bg-[#ffd400] text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        {menu.loading && !menu.data && <p className="text-sm text-zinc-400">Loading menu…</p>}
        {menu.error && !menu.data && <p className="text-sm text-red-400">{menu.error}</p>}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={!item.available}
                onClick={() => (item.groups.length > 0 ? setPicking({ item, choices: defaultChoices(item) }) : addToCart(item, {}))}
                className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 text-left transition hover:border-[#ffd400] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <div className="relative aspect-[4/3] w-full bg-zinc-800">
                  <ProductImage src={item.image} alt="" sizes="200px" iconClassName="h-6 w-6" />
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <p className="line-clamp-2 text-sm font-semibold leading-tight">{item.name}</p>
                  <p className="mt-auto text-sm font-bold text-[#ffd400]">{item.available ? formatPKR(item.price) : "Sold out"}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <aside aria-label="Cart" className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:sticky lg:top-6">
        <p className="text-lg font-bold">
          {table ? `Table ${table.number}` : "Takeaway"} · Cart ({count})
        </p>
        {cart.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">Tap food items to add them.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {cart.map((line) => {
              const price = unitPrice(line.item, line.choices);
              const labels = choiceLabels(line.item, line.choices);
              return (
                <li key={line.key} className="py-2.5">
                  <div className="flex justify-between gap-2 text-sm">
                    <p className="font-semibold">{line.item.name}</p>
                    <p className="shrink-0 font-semibold">{formatPKR(price * line.qty)}</p>
                  </div>
                  {labels.length > 0 && <p className="text-xs text-zinc-400">{labels.join(" · ")}</p>}
                  <div className="mt-1.5 flex items-center justify-between">
                    <p className="text-xs text-zinc-500">{formatPKR(price)} each</p>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label={`Fewer ${line.item.name}`} onClick={() => changeQty(line.key, -1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700">
                        {line.qty === 1 ? <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> : <Minus className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>
                      <span className="w-7 text-center text-sm font-bold" aria-label="Quantity">
                        {line.qty}
                      </span>
                      <button type="button" aria-label={`More ${line.item.name}`} onClick={() => changeQty(line.key, 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700">
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <dl className="mt-3 space-y-1 border-t border-zinc-800 pt-3 text-sm">
          <div className="flex justify-between text-zinc-300">
            <dt>Subtotal</dt>
            <dd>{formatPKR(subtotal)}</dd>
          </div>
          <div className="flex justify-between text-base font-bold">
            <dt>Total</dt>
            <dd>{formatPKR(subtotal)}</dd>
          </div>
        </dl>
        <div className="mt-3 grid gap-2">
          <input value={customer.name} onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))} placeholder="Customer name (optional)" maxLength={60} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-[#ffd400]" />
          <input value={customer.phone} onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))} placeholder="Phone (optional)" inputMode="tel" maxLength={20} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-[#ffd400]" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Kitchen notes (optional)" maxLength={300} rows={2} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-[#ffd400]" />
        </div>
        <button
          type="button"
          disabled={cart.length === 0}
          onClick={() => {
            setError(null);
            setReview(newClientOrderId());
          }}
          className="mt-3 w-full rounded-full bg-[#ffd400] py-3 text-sm font-bold text-black disabled:opacity-40"
        >
          Review order
        </button>
      </aside>

      {picking && (
        <Dialog title={picking.item.name} onClose={() => setPicking(null)}>
          {picking.item.groups.map((group) => (
            <fieldset key={group.id} className="mb-4">
              <legend className="mb-2 text-sm font-semibold">{group.label}</legend>
              <div className="grid gap-1.5">
                {group.options.map((option) => (
                  <label key={option.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-zinc-700 px-3 py-2 text-sm has-[:checked]:border-[#ffd400]">
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={group.id}
                        checked={picking.choices[group.id] === option.id}
                        onChange={() => setPicking((p) => (p ? { ...p, choices: { ...p.choices, [group.id]: option.id } } : p))}
                        className="accent-[#ffd400]"
                      />
                      {option.label}
                    </span>
                    {option.priceDelta !== 0 && <span className="text-zinc-400">+{formatPKR(option.priceDelta)}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() => {
              addToCart(picking.item, picking.choices);
              setPicking(null);
            }}
            className="w-full rounded-full bg-[#ffd400] py-3 text-sm font-bold text-black"
          >
            Add · {formatPKR(unitPrice(picking.item, picking.choices))}
          </button>
        </Dialog>
      )}

      {review && (
        <Dialog title="Confirm order" onClose={() => (sending ? undefined : setReview(null))}>
          <p className="text-sm text-zinc-400">{table ? `Dine-in · Table ${table.number}` : "Takeaway"}</p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-zinc-500">
                <th className="pb-1 font-semibold">Item</th>
                <th className="pb-1 text-right font-semibold">Qty</th>
                <th className="pb-1 text-right font-semibold">Rate</th>
                <th className="pb-1 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((l) => {
                const price = unitPrice(l.item, l.choices);
                return (
                  <tr key={l.key} className="border-t border-zinc-800">
                    <td className="py-1.5">{l.item.name}</td>
                    <td className="py-1.5 text-right">{l.qty}</td>
                    <td className="py-1.5 text-right">{price.toLocaleString("en-US")}</td>
                    <td className="py-1.5 text-right">{(price * l.qty).toLocaleString("en-US")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 flex justify-between border-t border-zinc-800 pt-3 text-base font-bold">
            <span>Total</span>
            <span>{formatPKR(subtotal)}</span>
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}
          <button type="button" disabled={sending} onClick={confirm} className="mt-4 w-full rounded-full bg-[#ffd400] py-3 text-sm font-bold text-black disabled:opacity-50">
            {sending ? "Sending…" : error ? "Try again" : "Confirm & send to kitchen"}
          </button>
        </Dialog>
      )}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-lg font-bold">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
