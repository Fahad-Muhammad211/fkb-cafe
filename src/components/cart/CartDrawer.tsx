"use client";

import { useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Flame, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { DELIVERY_ESTIMATE_MINUTES } from "@/lib/constants";
import { formatPKR } from "@/lib/format";
import { parseProducts, productsStore } from "@/lib/products";
import { ProductImage } from "@/components/ui/ProductImage";

const SUGGESTION_COUNT = 4;

export function CartDrawer() {
  const { isOpen, closeCart, lines, count, subtotal, deliveryFee, total, orderType, updateQty, removeLine, addLine } = useCart();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const productsRaw = useSyncExternalStore(productsStore.subscribe, productsStore.getSnapshot, productsStore.getServerSnapshot);
  const products = useMemo(() => parseProducts(productsRaw), [productsRaw]);

  // "Popular with your order": simple products (no options) that are on sale and not in the cart yet.
  const suggestions = useMemo(() => {
    const inCart = new Set(lines.map((l) => l.itemId));
    return products
      .filter((p) => p.available !== false && p.stock !== "out" && !p.sizes?.length && !p.flavors?.length && !inCart.has(p.id))
      .slice(0, SUGGESTION_COUNT);
  }, [products, lines]);

  const imageFor = (itemId: string) => products.find((p) => p.id === itemId)?.image;

  // Escape to close, body scroll lock, and focus the close button on open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCart();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, closeCart]);

  if (!isOpen) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[110] flex items-end bg-black/70 backdrop-blur-sm md:justify-end"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeCart();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85dvh] w-full flex-col rounded-t-2xl bg-zinc-900 text-white shadow-2xl animate-sheet-up md:h-full md:max-h-none md:w-[420px] md:rounded-none md:animate-drawer-in"
      >
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            <div>
              <h2 id={titleId} className="text-lg font-bold">Your Cart</h2>
              <p className="text-xs text-zinc-400">
                {count} {count === 1 ? "item" : "items"}
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={closeCart}
            aria-label="Close cart"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd400]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
              <ShoppingBag className="h-7 w-7" aria-hidden="true" />
            </span>
            <p className="font-semibold">Your cart is empty</p>
            <p className="text-sm text-zinc-400">Add items from the menu to get started.</p>
            <button
              type="button"
              onClick={closeCart}
              className="mt-2 rounded-full border border-zinc-700 px-5 py-2 text-sm font-semibold transition-colors hover:bg-zinc-800"
            >
              Browse menu
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <ul className="flex flex-col gap-3 px-4 pt-4">
                {lines.map((line) => (
                  <li key={line.id} className="animate-card-in flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                      <ProductImage key={imageFor(line.itemId) ?? "none"} src={imageFor(line.itemId)} alt="" sizes="64px" iconClassName="h-6 w-6" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-sm font-semibold leading-snug">{line.name}</p>
                      {line.options.length > 0 && <p className="text-xs text-zinc-400">{line.options.join(" · ")}</p>}
                      {line.instructions && <p className="line-clamp-2 text-xs italic text-zinc-400">“{line.instructions}”</p>}
                      <p className="mt-auto text-sm font-bold">{formatPKR(line.total)}</p>
                    </div>
                    <div className="flex shrink-0 items-start">
                      <div className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 p-1">
                        {line.qty === 1 ? (
                          <button
                            type="button"
                            onClick={() => removeLine(line.id)}
                            aria-label={`Remove ${line.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15 text-red-400 transition-transform duration-200 hover:scale-105 active:scale-95"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateQty(line.id, line.qty - 1)}
                            aria-label={`Decrease ${line.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 transition-transform duration-200 hover:scale-105 active:scale-95"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                        <span className="min-w-[2ch] text-center text-sm font-semibold tabular-nums" aria-live="polite">
                          {line.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(line.id, line.qty + 1)}
                          aria-label={`Increase ${line.name}`}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-black transition-transform duration-200 hover:scale-105 active:scale-95"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="px-4 pt-3">
                <button
                  type="button"
                  onClick={closeCart}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-600 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-800"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add more items
                </button>
              </div>

              {suggestions.length > 0 && (
                <section aria-labelledby={`${titleId}-popular`} className="px-4 pb-2 pt-5">
                  <h3 id={`${titleId}-popular`} className="mb-3 flex items-center gap-2 text-sm font-bold">
                    <Flame className="h-4 w-4 text-[#ffd400]" aria-hidden="true" />
                    Popular with your order
                  </h3>
                  <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
                    {suggestions.map((p) => (
                      <li key={p.id} className="w-28 shrink-0 snap-start">
                        <div className="relative aspect-square w-full overflow-hidden rounded-xl">
                          <ProductImage key={p.image ?? "none"} src={p.image} alt="" sizes="112px" iconClassName="h-6 w-6" />
                          <button
                            type="button"
                            onClick={() => addLine({ itemId: p.id, name: p.name, unitPrice: p.price, qty: 1, options: [], instructions: "" })}
                            aria-label={`Add ${p.name} to cart`}
                            className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black text-white shadow transition-transform duration-200 hover:scale-110 active:scale-95"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                        <p className="mt-1.5 text-xs font-bold">{formatPKR(p.price)}</p>
                        <p className="truncate text-[11px] text-zinc-400">{p.name}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <div className="space-y-2 border-t border-zinc-800 px-5 py-4">
              <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="flex justify-between text-sm text-zinc-300">
                  <span>Total</span>
                  <span>{formatPKR(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-zinc-300">
                  <span>{orderType === "pickup" ? "Pick-up" : "Delivery Fee"}</span>
                  <span>{orderType === "pickup" ? "Free" : formatPKR(deliveryFee)}</span>
                </div>
                <div className="flex justify-between border-t border-zinc-800 pt-3 text-base font-bold">
                  <span>Grand Total</span>
                  <span>{formatPKR(total)}</span>
                </div>
              </div>
              <Link
                href="/checkout"
                onClick={closeCart}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white ring-1 ring-zinc-700 transition-all duration-200 hover:bg-zinc-800 active:scale-[0.98]"
              >
                Checkout
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              {orderType === "delivery" && (
                <p className="pt-1 text-center text-xs text-zinc-400">
                  Your order will be delivered in approximately {DELIVERY_ESTIMATE_MINUTES} minutes.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
