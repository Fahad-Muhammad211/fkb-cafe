"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, ShoppingBag, Trash2, UtensilsCrossed } from "lucide-react";
import { Card, EmptyState, ErrorNote, LoadingBlock, Notice, PageHeader, Pill, dangerButton, primaryButton, secondaryButton } from "@/components/customer/ui";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import { ProductImage } from "@/components/ui/ProductImage";
import { useCart } from "@/context/CartContext";
import { extraOptionGroups } from "@/data/menuOptions";
import { money } from "@/components/customer/orderFormat";
import type { MenuItem } from "@/types";

interface WishlistResponse {
  products: MenuItem[];
  unavailableIds: string[];
}

// A product can go straight into the cart only when it has no size, flavour or extra options to choose.
const needsOptions = (item: MenuItem) => Boolean(item.sizes?.length || item.flavors?.length || extraOptionGroups(item).length);

export function CustomerWishlist() {
  const { data, error, loading, reload } = useCustomerData<WishlistResponse>("/api/customer/wishlist");
  const { data: catalog } = useCustomerData<{ products: MenuItem[] }>("/api/catalog");
  const { addLine, openCart } = useCart();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const save = async (item: MenuItem) => {
    setSavingId(item.id);
    setNotice(null);
    const result = await customerRequest("/api/customer/wishlist", "POST", { itemId: item.id });
    setSavingId(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setNotice({ tone: "success", text: `${item.name} was saved to your wishlist.` });
    reload();
  };

  const remove = async (itemId: string, name: string) => {
    setRemovingId(itemId);
    setNotice(null);
    const result = await customerRequest(`/api/customer/wishlist/${encodeURIComponent(itemId)}`, "DELETE");
    setRemovingId(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setNotice({ tone: "success", text: `${name} was removed from your wishlist.` });
    reload();
  };

  const buyAgain = (item: MenuItem) => {
    addLine({ itemId: item.id, name: item.name, unitPrice: item.price, qty: 1, options: [], instructions: "" });
    setNotice({ tone: "success", text: `${item.name} was added to your cart.` });
    openCart();
  };

  const products = data?.products ?? [];
  const unavailable = data?.unavailableIds ?? [];
  const saved = new Set(products.map((p) => p.id));
  const query = search.trim().toLowerCase();
  const addable = (catalog?.products ?? []).filter(
    (p) => !saved.has(p.id) && (query === "" || p.name.toLowerCase().includes(query)),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Favourites" title="My wishlist" description="Save the items you love and add them to your cart in one tap." />

      {notice && <Notice tone={notice.tone === "error" ? "error" : "success"}>{notice.text}</Notice>}
      {loading && <LoadingBlock label="Loading your wishlist…" />}
      {error && <ErrorNote message={error} onRetry={reload} />}

      {data && products.length === 0 && unavailable.length === 0 && (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Tap the heart on any item in the menu, or save an item you enjoyed here."
          action={
            <Link href="/" className={primaryButton}>
              <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
              Browse the menu
            </Link>
          }
        />
      )}

      {products.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((item) => {
            const soldOut = item.available === false || item.stock === "out";
            const options = needsOptions(item);
            return (
              <li key={item.id}>
                <Card className="flex h-full flex-col gap-4 p-4">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-zinc-800">
                    <ProductImage src={item.image} alt={item.name} sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 90vw" className="h-full w-full object-cover" />
                    {soldOut && <div className="absolute inset-0 flex items-center justify-center bg-black/60"><Pill tone="red">Sold out</Pill></div>}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold uppercase">{item.name}</p>
                    {item.description && <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{item.description}</p>}
                    <p className="mt-2 font-black text-orange-400">
                      {options ? `From ${money(item.price)}` : money(item.price)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-4">
                    {options ? (
                      <Link href="/" className={secondaryButton}>
                        Choose options
                      </Link>
                    ) : (
                      <button type="button" onClick={() => buyAgain(item)} disabled={soldOut} className={primaryButton}>
                        <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                        Add to cart
                      </button>
                    )}
                    <button type="button" onClick={() => remove(item.id, item.name)} disabled={removingId === item.id} className={dangerButton}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Remove
                    </button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {catalog && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-bold">Save items from the menu</h2>
              <p className="text-xs text-zinc-400">Pick the things you order often.</p>
            </div>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the menu"
              aria-label="Search the menu"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none sm:w-64"
            />
          </div>
          {addable.length === 0 ? (
            <p className="text-sm text-zinc-500">{query ? "No menu items match your search." : "Every menu item is already saved."}</p>
          ) : (
            <ul className="grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {addable.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/40 px-4 py-3 ring-1 ring-zinc-800">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold uppercase">{item.name}</p>
                    <p className="text-xs text-zinc-400">{money(item.price)}</p>
                  </div>
                  <button type="button" onClick={() => save(item)} disabled={savingId === item.id} className={secondaryButton}>
                    <Heart className="h-4 w-4 text-orange-500" aria-hidden="true" />
                    {savingId === item.id ? "Saving…" : "Save"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {unavailable.length > 0 && (
        <Card>
          <p className="font-bold">No longer on the menu</p>
          <p className="mt-1 text-sm text-zinc-400">These saved items have been removed from the menu. You can remove them from your wishlist.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {unavailable.map((id) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/40 px-4 py-3 text-sm ring-1 ring-zinc-800">
                <span className="text-zinc-300">{id}</span>
                <button type="button" onClick={() => remove(id, id)} disabled={removingId === id} className={dangerButton}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
