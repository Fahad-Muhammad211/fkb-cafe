"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BookOpen, Boxes, History, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { stockApi } from "@/lib/cafeApi";
import { fetchCatalog } from "@/lib/catalogApi";
import { STOCK_UNITS, type StockItem, type StockMovementType, type StockSnapshot } from "@/lib/stockTypes";
import { canAccess } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/sessionClient";
import { useSession } from "@/lib/useSession";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MenuItem } from "@/types";
import { Button, Dialog, ErrorNote, formatDateTime } from "@/components/admin/cafe/CafeParts";

const inputClass = "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#ffd400]";
const qty = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("en-US");
const TYPE_LABEL: Record<StockMovementType, string> = { purchase: "Purchase", usage: "Kitchen use", waste: "Waste", adjustment: "Count correction", order: "Order (recipe)" };

type Tab = "inventory" | "recipes" | "history";

// Inventory: ingredients, purchases, usage, remaining quantity and cost, plus the recipe of each
// product so completed orders deduct stock automatically.
export function StockView() {
  const session = useSession<StaffSession>(getAdminSession);
  const canEditRecipes = session.state === "ready" && canAccess(session.value, "menu");
  const [data, setData] = useState<StockSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("inventory");

  const load = useCallback(async () => {
    const res = await stockApi.snapshot();
    if (res.ok) {
      setData(res.data);
      setError(null);
    } else setError(res.error);
  }, []);
  useEffect(() => {
    let alive = true;
    void stockApi.snapshot().then((res) => {
      if (!alive) return;
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return error ? <ErrorNote message={error} /> : <p className="text-sm text-zinc-400">Loading stock…</p>;

  const value = data.items.reduce((s, i) => s + Math.max(0, i.quantity) * i.avgCost, 0);
  const low = data.items.filter((i) => i.quantity <= i.lowLevel);
  const tabs: { id: Tab; label: string; icon: typeof Boxes }[] = [
    { id: "inventory", label: "Inventory", icon: Boxes },
    { id: "recipes", label: "Recipes", icon: BookOpen },
    { id: "history", label: "History", icon: History },
  ];

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-zinc-500">Inventory</p>
        <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Stock</h1>
      </header>
      <ErrorNote message={error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Items" value={String(data.items.length)} />
        <Card label="Stock value" value={formatPKR(Math.round(value))} />
        <Card label="Low stock" value={String(low.length)} tone={low.length ? "text-amber-300" : undefined} />
        <Card label="Products with recipe" value={String(data.recipes.length)} />
      </div>

      {low.length > 0 && (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <span className="font-bold">Running low:</span> {low.map((i) => `${i.name} (${qty(i.quantity)} ${i.unit})`).join(", ")}
        </p>
      )}

      <div role="tablist" className="flex w-fit gap-1 rounded-full bg-zinc-900 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold", tab === t.id ? "bg-[#ffd400] text-black" : "text-zinc-300 hover:text-white")}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "inventory" && <Inventory data={data} onChanged={load} />}
      {tab === "recipes" && <Recipes data={data} canEdit={canEditRecipes} onChanged={load} />}
      {tab === "history" && <Movements data={data} />}
    </div>
  );
}

function Card({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={cn("mt-2 text-xl font-black tabular-nums", tone)}>{value}</p>
    </div>
  );
}

type ItemModal = { kind: "add" } | { kind: "purchase" | "use" | "edit"; item: StockItem } | null;

function Inventory({ data, onChanged }: { data: StockSnapshot; onChanged: () => Promise<void> }) {
  const [modal, setModal] = useState<ItemModal>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const items = data.items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()));

  const remove = async (item: StockItem) => {
    if (!window.confirm(`Remove ${item.name}? It is also taken out of every recipe. Its history is kept.`)) return;
    const res = await stockApi.removeItem(item.id);
    await onChanged();
    setError(res.ok ? null : res.error);
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items" aria-label="Search items" className={cn(inputClass, "pl-9")} />
        </label>
        <Button onClick={() => setModal({ kind: "add" })}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add item
        </Button>
      </div>
      <ErrorNote message={error} />
      {data.items.length === 0 ? (
        <p className="text-sm text-zinc-500">No items yet. Add ingredients such as fish, oil, potatoes or ketchup with their opening quantity and cost.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">Item</th>
                <th className="py-2 pr-3 text-right font-semibold">On hand</th>
                <th className="py-2 pr-3 text-right font-semibold">Avg. cost</th>
                <th className="py-2 pr-3 text-right font-semibold">Value</th>
                <th className="py-2 pr-3 text-right font-semibold">Low at</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {items.map((i) => {
                const isLow = i.quantity <= i.lowLevel;
                return (
                  <tr key={i.id}>
                    <td className="py-2.5 pr-3 font-semibold">{i.name}</td>
                    <td className={cn("py-2.5 pr-3 text-right tabular-nums", i.quantity < 0 ? "text-red-400" : isLow ? "text-amber-300" : "")}>
                      {qty(i.quantity)} {i.unit}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-400">
                      {formatPKR(i.avgCost)}/{i.unit}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatPKR(Math.round(Math.max(0, i.quantity) * i.avgCost))}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-400">
                      {qty(i.lowLevel)} {i.unit}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", i.quantity < 0 ? "bg-red-500/15 text-red-300" : isLow ? "bg-amber-400/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300")}>
                        {i.quantity < 0 ? "Short" : isLow ? "Low" : "OK"}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button tone="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => setModal({ kind: "purchase", item: i })}>
                          <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" /> Purchase
                        </Button>
                        <Button tone="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => setModal({ kind: "use", item: i })}>
                          <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden="true" /> Use
                        </Button>
                        <Button tone="ghost" className="px-2.5 py-1.5" onClick={() => setModal({ kind: "edit", item: i })} ariaLabel={`Edit ${i.name}`}>
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                        <Button tone="danger" className="px-2.5 py-1.5" onClick={() => remove(i)} ariaLabel={`Remove ${i.name}`}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {modal?.kind === "add" && <AddItemDialog onClose={() => setModal(null)} onSaved={onChanged} />}
      {modal?.kind === "purchase" && <PurchaseDialog item={modal.item} onClose={() => setModal(null)} onSaved={onChanged} />}
      {modal?.kind === "use" && <UseDialog item={modal.item} onClose={() => setModal(null)} onSaved={onChanged} />}
      {modal?.kind === "edit" && <EditItemDialog item={modal.item} onClose={() => setModal(null)} onSaved={onChanged} />}
    </section>
  );
}

function useSubmit(onSaved: () => Promise<void>, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const res = await action();
    await onSaved();
    setBusy(false);
    if (res.ok) onClose();
    else setError(res.error ?? "Something went wrong.");
  };
  return { busy, error, submit };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-zinc-500">{hint}</span>}
    </label>
  );
}

function AddItemDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [v, setV] = useState({ name: "", unit: "kg", quantity: "", totalCost: "", lowLevel: "" });
  const { busy, error, submit } = useSubmit(onSaved, onClose);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog title="Add stock item" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(() => stockApi.addItem({ name: v.name, unit: v.unit, quantity: Number(v.quantity || 0), totalCost: Number(v.totalCost || 0), lowLevel: Number(v.lowLevel || 0) }));
        }}
      >
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Name">
              <input value={v.name} onChange={set("name")} required maxLength={60} placeholder="e.g. Fish fillet" className={inputClass} autoFocus />
            </Field>
          </div>
          <Field label="Unit">
            <select value={v.unit} onChange={set("unit")} className={inputClass}>
              {STOCK_UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Opening quantity (${v.unit})`}>
            <input type="number" min={0} step="any" value={v.quantity} onChange={set("quantity")} placeholder="0" className={inputClass} />
          </Field>
          <Field label="Cost of that quantity (Rs.)">
            <input type="number" min={0} step="any" value={v.totalCost} onChange={set("totalCost")} placeholder="0" className={inputClass} />
          </Field>
        </div>
        <Field label={`Warn when at or below (${v.unit})`}>
          <input type="number" min={0} step="any" value={v.lowLevel} onChange={set("lowLevel")} placeholder="0" className={inputClass} />
        </Field>
        <ErrorNote message={error} />
        <Button type="submit" disabled={busy || !v.name.trim()}>{busy ? "Saving…" : "Add item"}</Button>
      </form>
    </Dialog>
  );
}

function PurchaseDialog({ item, onClose, onSaved }: { item: StockItem; onClose: () => void; onSaved: () => Promise<void> }) {
  const [q, setQ] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, submit } = useSubmit(onSaved, onClose);
  const unitCost = Number(q) > 0 && cost !== "" ? Number(cost) / Number(q) : null;
  return (
    <Dialog title={`Purchase · ${item.name}`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(() => stockApi.purchase(item.id, { quantity: Number(q), totalCost: Number(cost), note }));
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Quantity bought (${item.unit})`}>
            <input type="number" min={0} step="any" required value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} autoFocus />
          </Field>
          <Field label="Total paid (Rs.)">
            <input type="number" min={0} step="any" required value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Supplier / note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className={inputClass} />
        </Field>
        <p className="text-xs text-zinc-500">
          Now {qty(item.quantity)} {item.unit} at {formatPKR(item.avgCost)}/{item.unit}
          {unitCost !== null && ` · this purchase ${formatPKR(Math.round(unitCost * 100) / 100)}/${item.unit}`}
        </p>
        <ErrorNote message={error} />
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save purchase"}</Button>
      </form>
    </Dialog>
  );
}

function UseDialog({ item, onClose, onSaved }: { item: StockItem; onClose: () => void; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<"usage" | "waste" | "adjustment">("usage");
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const { busy, error, submit } = useSubmit(onSaved, onClose);
  return (
    <Dialog title={`Stock out · ${item.name}`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(() => stockApi.usage(item.id, { type, quantity: Number(q), note }));
        }}
      >
        <div className="grid grid-cols-3 gap-2">
          {(["usage", "waste", "adjustment"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={cn("rounded-xl px-2 py-2 text-xs font-bold", type === t ? "bg-[#ffd400] text-black" : "bg-zinc-800 text-zinc-300")}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <Field
          label={type === "adjustment" ? `Counted quantity on hand (${item.unit})` : `Quantity (${item.unit})`}
          hint={type === "adjustment" ? `The system shows ${qty(item.quantity)} ${item.unit}. The difference is recorded.` : `On hand: ${qty(item.quantity)} ${item.unit}`}
        >
          <input type="number" min={0} step="any" required value={q} onChange={(e) => setQ(e.target.value)} className={inputClass} autoFocus />
        </Field>
        <Field label="Note (optional)">
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className={inputClass} />
        </Field>
        <ErrorNote message={error} />
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </form>
    </Dialog>
  );
}

function EditItemDialog({ item, onClose, onSaved }: { item: StockItem; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(item.name);
  const [low, setLow] = useState(String(item.lowLevel));
  const { busy, error, submit } = useSubmit(onSaved, onClose);
  return (
    <Dialog title={`Edit · ${item.name}`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(() => stockApi.updateItem(item.id, { name, lowLevel: Number(low || 0) }));
        }}
      >
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} className={inputClass} />
        </Field>
        <Field label={`Warn when at or below (${item.unit})`}>
          <input type="number" min={0} step="any" value={low} onChange={(e) => setLow(e.target.value)} className={inputClass} />
        </Field>
        <ErrorNote message={error} />
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </form>
    </Dialog>
  );
}

// ----- Recipes -----

function Recipes({ data, canEdit, onChanged }: { data: StockSnapshot; canEdit: boolean; onChanged: () => Promise<void> }) {
  const [products, setProducts] = useState<MenuItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<MenuItem | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchCatalog().then((c) => alive && setProducts(c?.products ?? []));
    return () => {
      alive = false;
    };
  }, []);
  const items = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
  const recipes = useMemo(() => new Map(data.recipes.map((r) => [r.productId, r.lines])), [data.recipes]);
  if (!products) return <p className="text-sm text-zinc-400">Loading menu…</p>;
  const shown = products.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-zinc-400">
          A recipe lists what one portion uses. When an order is paid (cafe) or delivered (online), these quantities are taken out of stock automatically.
          {!canEdit && " Only the Owner can change recipes."}
        </p>
        <label className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products" className={cn(inputClass, "pl-9")} />
        </label>
      </div>
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="py-2 pr-3 font-semibold">Product</th>
              <th className="py-2 pr-3 font-semibold">Ingredients per portion</th>
              <th className="py-2 pr-3 text-right font-semibold">Price</th>
              <th className="py-2 pr-3 text-right font-semibold">Stock cost</th>
              <th className="py-2 pr-3 text-right font-semibold">Margin</th>
              <th className="py-2 text-right font-semibold" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {shown.map((p) => {
              const lines = recipes.get(p.id) ?? [];
              const cost = lines.reduce((s, l) => s + l.qty * (items.get(l.itemId)?.avgCost ?? 0), 0);
              return (
                <tr key={p.id}>
                  <td className="py-2.5 pr-3 font-semibold">{p.name}</td>
                  <td className="py-2.5 pr-3 text-zinc-400">
                    {lines.length === 0 ? <span className="text-zinc-600">No recipe</span> : lines.map((l) => `${qty(l.qty)} ${items.get(l.itemId)?.unit ?? ""} ${items.get(l.itemId)?.name ?? "?"}`).join(", ")}
                  </td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{formatPKR(p.price)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-zinc-400">{lines.length ? formatPKR(Math.round(cost)) : "—"}</td>
                  <td className={cn("py-2.5 pr-3 text-right tabular-nums", p.price - cost < 0 ? "text-red-400" : "text-emerald-400")}>{lines.length ? formatPKR(Math.round(p.price - cost)) : "—"}</td>
                  <td className="py-2.5 text-right">
                    {canEdit && (
                      <Button tone="ghost" className="px-3 py-1.5 text-xs" onClick={() => setEditing(p)}>
                        {lines.length ? "Edit recipe" : "Add recipe"}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editing && <RecipeDialog product={editing} items={data.items} lines={recipes.get(editing.id) ?? []} onClose={() => setEditing(null)} onSaved={onChanged} />}
    </section>
  );
}

function RecipeDialog({ product, items, lines, onClose, onSaved }: { product: MenuItem; items: StockItem[]; lines: { itemId: string; qty: number }[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [rows, setRows] = useState(() => lines.map((l) => ({ itemId: l.itemId, qty: String(l.qty) })));
  const { busy, error, submit } = useSubmit(onSaved, onClose);
  const byId = new Map(items.map((i) => [i.id, i]));
  const cost = rows.reduce((s, r) => s + Number(r.qty || 0) * (byId.get(r.itemId)?.avgCost ?? 0), 0);
  if (items.length === 0) {
    return (
      <Dialog title={`Recipe · ${product.name}`} onClose={onClose}>
        <p className="text-sm text-zinc-400">Add stock items on the Inventory tab first.</p>
      </Dialog>
    );
  }
  return (
    <Dialog title={`Recipe · ${product.name}`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(() => stockApi.saveRecipe(product.id, rows.filter((r) => r.itemId).map((r) => ({ itemId: r.itemId, qty: Number(r.qty) }))));
        }}
      >
        <p className="text-sm text-zinc-400">What one portion uses, in each item&apos;s unit.</p>
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <select
              value={r.itemId}
              onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, itemId: e.target.value } : x)))}
              className={inputClass}
              aria-label="Ingredient"
            >
              <option value="">Choose ingredient</option>
              {items.map((it) => (
                <option key={it.id} value={it.id} disabled={rows.some((x, j) => j !== i && x.itemId === it.id)}>
                  {it.name} ({it.unit})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="any"
              required
              value={r.qty}
              onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
              placeholder={byId.get(r.itemId)?.unit ?? "qty"}
              aria-label="Quantity per portion"
              className={cn(inputClass, "w-28 shrink-0")}
            />
            <button type="button" aria-label="Remove ingredient" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="flex w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-zinc-400 hover:text-red-300">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <Button tone="ghost" onClick={() => setRows((rs) => [...rs, { itemId: "", qty: "" }])}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add ingredient
        </Button>
        <p className="text-sm text-zinc-400">
          Stock cost per portion: <span className="font-bold text-white">{formatPKR(Math.round(cost))}</span> · price {formatPKR(product.price)} · margin{" "}
          <span className={cn("font-bold", product.price - cost < 0 ? "text-red-400" : "text-emerald-400")}>{formatPKR(Math.round(product.price - cost))}</span>
        </p>
        <ErrorNote message={error} />
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : rows.length ? "Save recipe" : "Remove recipe"}</Button>
      </form>
    </Dialog>
  );
}

// ----- History -----

function Movements({ data }: { data: StockSnapshot }) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <p className="mb-4 text-sm text-zinc-400">Latest {data.movements.length} stock movements: purchases, recipe deductions from orders, kitchen use, waste and count corrections.</p>
      {data.movements.length === 0 ? (
        <p className="text-sm text-zinc-500">No movements yet.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="py-2 pr-3 font-semibold">When</th>
                <th className="py-2 pr-3 font-semibold">Item</th>
                <th className="py-2 pr-3 font-semibold">Type</th>
                <th className="py-2 pr-3 text-right font-semibold">Quantity</th>
                <th className="py-2 pr-3 text-right font-semibold">Cost</th>
                <th className="py-2 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.movements.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 pr-3 tabular-nums text-zinc-400">{formatDateTime(m.at)}</td>
                  <td className="py-2 pr-3 font-semibold">{m.itemName}</td>
                  <td className="py-2 pr-3">{TYPE_LABEL[m.type]}</td>
                  <td className={cn("py-2 pr-3 text-right tabular-nums", m.qty < 0 ? "text-red-300" : "text-emerald-300")}>
                    {m.qty > 0 ? "+" : ""}
                    {qty(m.qty)} {m.unit}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatPKR(Math.round(m.totalCost))}</td>
                  <td className="py-2 text-zinc-400">{m.orderId ? `Order ${m.orderId.slice(-8)}` : m.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
