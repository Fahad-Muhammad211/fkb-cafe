"use client";

import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { ProductImage } from "@/components/ui/ProductImage";
import { useCart } from "@/context/CartContext";
import type { MenuItem } from "@/types";

interface ProductCardProps {
  item: MenuItem;
  index?: number;
  onOpen: () => void;
  // Replaces the product photo, for example with a looping video. Defaults to the photo.
  media?: ReactNode;
}

export function ProductCard({ item, index = 0, onOpen, media }: ProductCardProps) {
  const { qtyForItem, stepItem } = useCart();
  const qty = qtyForItem(item.id);

  return (
    <article
      className="animate-card-in group relative flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-2 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-600 hover:shadow-xl hover:shadow-black/40"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Stretched button: the whole card opens the product modal. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${item.name}`}
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd400]"
      />

      <div className="pointer-events-none relative aspect-square w-full overflow-hidden rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-800">
        <div className="relative h-full w-full transition-transform duration-500 ease-out group-hover:scale-105">
          {media ?? (
            <ProductImage
              key={item.image ?? "none"}
              src={item.image}
              alt=""
              sizes="(min-width: 1280px) 300px, (min-width: 768px) 33vw, 50vw"
            />
          )}
        </div>
        {item.stock === "out" && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-bold uppercase tracking-wide text-white">
            Sold out
          </span>
        )}
        {item.badge && (
          <span className="absolute left-2 top-2 rounded-md bg-zinc-800/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
            {item.badge}
          </span>
        )}
      </div>

      <div className="pointer-events-none flex flex-1 flex-col px-1 pt-3">
        <h3 className="text-sm uppercase leading-snug text-white sm:text-base md:text-lg">
          {item.name}
        </h3>
        {item.pieces && <p className="mt-0.5 text-xs text-zinc-400">{item.pieces}</p>}
        {item.description && (
          <p className="mt-1 line-clamp-2 text-xs text-zinc-300">{item.description}</p>
        )}

        <div className="mt-auto pt-3">
          <div className="flex items-center justify-between gap-2">
          <span className="text-base font-medium text-white sm:text-lg">Rs. {item.price}</span>
          {qty > 0 && (
            <div className="pointer-events-auto relative z-10 flex items-center gap-1 rounded-lg bg-zinc-800 p-0.5">
              <button
                type="button"
                onClick={() => stepItem(item.id, -1)}
                aria-label={`Decrease ${item.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-700 transition-all duration-200 hover:bg-zinc-600 active:scale-95"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <span className="min-w-[2ch] text-center text-sm font-semibold tabular-nums" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => stepItem(item.id, 1)}
                aria-label={`Increase ${item.name}`}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-black transition-all duration-200 hover:bg-[#ffd400] active:scale-95"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
          </div>
          {qty === 0 && (
            <button
              type="button"
              onClick={onOpen}
              disabled={item.stock === "out"}
              aria-label={`Add ${item.name} to cart`}
              className="pointer-events-auto relative z-10 mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-[#ffd400] hover:text-black active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-zinc-700 disabled:hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd400] sm:text-sm"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add to cart
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
