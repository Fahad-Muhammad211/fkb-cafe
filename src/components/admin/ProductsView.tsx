"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { categoriesStore, parseCategories } from "@/lib/categories";
import { createProductId, parseProducts, productsStore, saveProducts } from "@/lib/products";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/FormField";
import { CategoryManager } from "@/components/admin/CategoryManager";
import { ProductForm } from "@/components/admin/ProductForm";
import type { MenuItem, StoredCategory } from "@/types";

export function ProductsView() {
  const productsRaw = useSyncExternalStore(productsStore.subscribe, productsStore.getSnapshot, productsStore.getServerSnapshot);
  const categoriesRaw = useSyncExternalStore(categoriesStore.subscribe, categoriesStore.getSnapshot, categoriesStore.getServerSnapshot);
  const [editing, setEditing] = useState<MenuItem | "new" | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const products = useMemo(() => parseProducts(productsRaw), [productsRaw]);
  const categories = useMemo<StoredCategory[]>(() => parseCategories(categoriesRaw), [categoriesRaw]);

  const categoryLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? "Uncategorised";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== "all" && p.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return [p.name, p.description ?? "", p.pieces ?? ""].some((field) => field.toLowerCase().includes(q));
    });
  }, [products, query, categoryFilter]);

  if (productsRaw === undefined || categoriesRaw === undefined) {
    return <p className="text-sm text-zinc-400">Loading products…</p>;
  }

  const update = (next: MenuItem[]) => saveProducts(next);

  const toggleAvailable = (item: MenuItem) =>
    update(products.map((p) => (p.id === item.id ? { ...p, available: p.available === false } : p)));

  const setStock = (item: MenuItem, stock: "in" | "out") =>
    update(products.map((p) => (p.id === item.id ? { ...p, stock } : p)));

  const remove = (id: string) => {
    update(products.filter((p) => p.id !== id));
    setConfirmId(null);
  };

  const save = (item: MenuItem) => {
    if (editing === "new") {
      update([...products, { ...item, id: createProductId() }]);
    } else {
      update(products.map((p) => (p.id === item.id ? item : p)));
    }
    setEditing(null);
  };

  const defaultCategoryId = categories[0]?.id ?? "";

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Management</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Products</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {products.length} products · {filtered.length} shown · switched-off items are hidden from the storefront
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          disabled={categories.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-[#ffd400] px-5 py-2.5 text-sm font-bold text-black transition-transform duration-200 hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add product
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <label className="relative block">
          <span className="sr-only">Search products</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, description or pieces"
            className={`${inputClass} pl-11`}
          />
        </label>
        <label className="block">
          <span className="sr-only">Filter by category</span>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputClass}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 px-6 py-12 text-center text-sm text-zinc-400">
          {products.length === 0 ? "No products yet. Add your first product." : "No products match these filters."}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-zinc-800 md:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Product</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Price</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Stock</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Storefront</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filtered.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-zinc-900/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb src={p.image} />
                        <div className="min-w-0">
                          <p className="font-semibold uppercase">{p.name}</p>
                          {p.pieces && <p className="text-xs text-zinc-500">{p.pieces}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{categoryLabel(p.categoryId)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPKR(p.price)}</td>
                    <td className="px-4 py-3">
                      <StockSelect value={p.stock ?? "in"} label={p.name} onChange={(v) => setStock(p, v)} />
                    </td>
                    <td className="px-4 py-3">
                      <AvailabilitySwitch on={p.available !== false} onToggle={() => toggleAvailable(p)} label={p.name} />
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
                        name={p.name}
                        confirming={confirmId === p.id}
                        onEdit={() => setEditing(p)}
                        onAskDelete={() => setConfirmId(p.id)}
                        onCancelDelete={() => setConfirmId(null)}
                        onDelete={() => remove(p.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {filtered.map((p) => (
              <li key={p.id} className="animate-card-in rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumb src={p.image} />
                    <div className="min-w-0">
                      <p className="font-semibold uppercase">{p.name}</p>
                      <p className="text-xs text-zinc-500">
                        {categoryLabel(p.categoryId)}
                        {p.pieces ? ` · ${p.pieces}` : ""}
                      </p>
                    </div>
                  </div>
                  <p className="font-bold tabular-nums">{formatPKR(p.price)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-3">
                  <StockSelect value={p.stock ?? "in"} label={p.name} onChange={(v) => setStock(p, v)} />
                  <AvailabilitySwitch on={p.available !== false} onToggle={() => toggleAvailable(p)} label={p.name} />
                  <RowActions
                    name={p.name}
                    confirming={confirmId === p.id}
                    onEdit={() => setEditing(p)}
                    onAskDelete={() => setConfirmId(p.id)}
                    onCancelDelete={() => setConfirmId(null)}
                    onDelete={() => remove(p.id)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <CategoryManager categories={categories} products={products} />

      {editing && (
        <ProductForm
          initial={editing === "new" ? null : editing}
          categories={categories}
          defaultCategoryId={defaultCategoryId}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}
    </div>
  );
}

function Thumb({ src }: { src?: string }) {
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-800 text-[10px] font-semibold text-zinc-500">
      {src ? <Image src={src} alt="" fill unoptimized sizes="44px" className="object-cover" /> : "No image"}
    </span>
  );
}

function StockSelect({ value, label, onChange }: { value: "in" | "out"; label: string; onChange: (value: "in" | "out") => void }) {
  return (
    <select
      value={value}
      aria-label={`Stock status for ${label}`}
      onChange={(e) => onChange(e.target.value as "in" | "out")}
      className={cn(
        "rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors focus:outline-none",
        value === "in" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300",
      )}
    >
      <option value="in">In stock</option>
      <option value="out">Sold out</option>
    </select>
  );
}

function AvailabilitySwitch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label} available`}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
        on ? "bg-emerald-500" : "bg-zinc-700",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200",
          on ? "translate-x-5" : "translate-x-0.5",
        )}
      />
      <span className="sr-only">{on ? "On" : "Off"}</span>
    </button>
  );
}

function RowActions({
  name,
  confirming,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  name: string;
  confirming: boolean;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  if (confirming) {
    return (
      <div className="flex items-center justify-end gap-2 text-xs">
        <span className="text-zinc-400">Delete {name}?</span>
        <button type="button" onClick={onDelete} className="rounded-full bg-red-500 px-3 py-1.5 font-semibold text-white transition-transform active:scale-95">
          Delete
        </button>
        <button type="button" onClick={onCancelDelete} className="rounded-full border border-zinc-700 px-3 py-1.5 font-semibold transition-colors hover:bg-zinc-800">
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${name}`}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 transition-transform hover:scale-105 active:scale-95"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onAskDelete}
        aria-label={`Delete ${name}`}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15 text-red-400 transition-transform hover:scale-105 active:scale-95"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
