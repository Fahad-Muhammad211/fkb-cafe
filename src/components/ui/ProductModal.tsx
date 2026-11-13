"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Minus, Plus, Share2, Trash2, X } from "lucide-react";
import { ProductImage } from "@/components/ui/ProductImage";
import { extraOptionGroups } from "@/data/menuOptions";
import { useCart } from "@/context/CartContext";
import type { MenuItem, ProductOption } from "@/types";
import { cn } from "@/lib/utils";

const MAX_QTY = 99;
const MAX_INSTRUCTIONS = 500;

interface ProductModalProps {
  item: MenuItem;
  onClose: () => void;
}

export function ProductModal({ item, onClose }: ProductModalProps) {
  const { addLine } = useCart();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  const [qty, setQty] = useState(1);
  const [instructions, setInstructions] = useState("");
  const [sizeId, setSizeId] = useState<string | undefined>(item.sizes?.[0]?.id);
  const [flavorId, setFlavorId] = useState<string | undefined>(item.flavors?.[0]?.id);

  const size = item.sizes?.find((o) => o.id === sizeId);
  const flavor = item.flavors?.find((o) => o.id === flavorId);
  // Category-wide choices such as "Make it a meal" (data/menuOptions.ts). First option is the default.
  const extraGroups = extraOptionGroups(item);
  const [extraSelected, setExtraSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(extraGroups.map((g) => [g.id, g.options[0].id])),
  );
  const extraChosen = extraGroups.map((g) => g.options.find((o) => o.id === extraSelected[g.id])).filter((o): o is ProductOption => Boolean(o));
  const unitPrice =
    item.price + (size?.priceDelta ?? 0) + (flavor?.priceDelta ?? 0) + extraChosen.reduce((sum, o) => sum + o.priceDelta, 0);
  const total = unitPrice * qty;

  // Keep the latest close handler in a ref so the effect below runs once per open,
  // not on every render (which would steal focus while typing).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Keyboard close, body scroll lock, and initial focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const handleAdd = () => {
    // The "No meal" / "No add-on" defaults are not worth listing on the cart line.
    const options = [size, flavor, ...extraChosen.filter((o) => o.priceDelta !== 0)]
      .filter((o): o is ProductOption => Boolean(o))
      .map((o) => o.label);
    addLine({
      itemId: item.id,
      name: item.name,
      unitPrice,
      qty,
      options,
      instructions: instructions.trim(),
    });
    onClose();
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: item.name, text: `${item.name} - Rs. ${unitPrice}` });
      } catch {
        // User dismissed the share sheet; nothing to do.
      }
    }
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end bg-black/70 backdrop-blur-sm md:items-center md:justify-center md:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-modal-in flex max-h-[92dvh] w-full flex-col overflow-y-auto rounded-t-2xl bg-zinc-900 text-white shadow-2xl md:max-h-[90vh] md:max-w-[1100px] md:flex-row md:overflow-hidden md:rounded-2xl"
      >
        {/* Media column */}
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-black md:aspect-auto md:min-h-[580px] md:w-[55%]">
          <ProductImage
            key={item.image ?? "none"}
            src={item.image}
            alt={item.name}
            sizes="(min-width: 768px) 55vw, 100vw"
            iconClassName="h-16 w-16"
            priority
          />
          <div className="absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/90 to-transparent p-6 md:block">
            <h2 id={titleId} className="text-2xl font-bold">{item.name}</h2>
            {item.pieces && <p className="text-sm text-zinc-300">{item.pieces}</p>}
          </div>
        </div>

        {/* Details column */}
        <div className="flex flex-1 flex-col p-5 md:max-h-[90vh] md:overflow-y-auto md:p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-2xl font-black">Rs. {unitPrice}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share item"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition-transform duration-200 hover:scale-105 active:scale-95"
              >
                <Share2 className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                ref={closeRef}
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white transition-transform duration-200 hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd400]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Name shown here on mobile, where the media column has no overlay */}
          <div className="mt-4 md:hidden">
            <h2 id={titleId} className="text-xl font-bold">{item.name}</h2>
            {item.pieces && <p className="text-sm text-zinc-400">{item.pieces}</p>}
          </div>

          {item.description && <p className="mt-3 text-sm text-zinc-300">{item.description}</p>}

          {item.sizes && item.sizes.length > 0 && (
            <OptionGroup label="Size" options={item.sizes} selected={sizeId} onSelect={setSizeId} />
          )}
          {item.flavors && item.flavors.length > 0 && (
            <OptionGroup label="Flavor" options={item.flavors} selected={flavorId} onSelect={setFlavorId} />
          )}
          {extraGroups.map((group) => (
            <OptionGroup
              key={group.id}
              label={group.label}
              options={group.options}
              selected={extraSelected[group.id]}
              onSelect={(id) => setExtraSelected((prev) => ({ ...prev, [group.id]: id }))}
            />
          ))}

          <div className="mt-6">
            <label htmlFor={`${titleId}-instructions`} className="text-sm font-semibold">
              Special Instructions
            </label>
            <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-800 p-3 focus-within:border-zinc-500">
              <textarea
                id={`${titleId}-instructions`}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS))}
                placeholder="Please enter instructions about this item"
                rows={4}
                className="w-full resize-none bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <p className="text-right text-xs text-zinc-500">
                {instructions.length}/{MAX_INSTRUCTIONS}
              </p>
            </div>
          </div>

          {/* Footer: quantity and add to cart */}
          <div className="mt-auto flex flex-col gap-3 border-t border-zinc-800 pt-5 md:flex-row md:items-center md:pt-6">
            <div className="flex items-center gap-1 self-start rounded-full border border-zinc-700 bg-zinc-800 p-1 md:self-auto">
              {qty === 1 ? (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Remove item"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15 text-red-400 transition-transform duration-200 hover:scale-105 active:scale-95"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700 transition-transform duration-200 hover:scale-105 active:scale-95"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <span className="min-w-[2ch] text-center font-semibold tabular-nums" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
                aria-label="Increase quantity"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black transition-transform duration-200 hover:scale-105 active:scale-95"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleAdd}
              disabled={item.stock === "out"}
              className="flex w-full items-center justify-between gap-4 whitespace-nowrap rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-zinc-800 active:scale-[0.98] md:w-auto md:min-w-[260px]"
            >
              <span>Rs. {total}</span>
              <span className="h-4 w-px bg-white/30" aria-hidden="true" />
              <span className="flex items-center gap-2">
                Add to Cart
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionGroup({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: ProductOption[];
  selected: string | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset className="mt-5">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isOn = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isOn}
              onClick={() => onSelect(option.id)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm transition-all duration-200 active:scale-95",
                isOn ? "border-[#ffd400] bg-[#ffd400] font-semibold text-black" : "border-zinc-700 bg-zinc-800 text-zinc-200 hover:border-zinc-500",
              )}
            >
              {option.label}
              {option.priceDelta !== 0 && (
                <span className="ml-1.5 text-xs opacity-70">
                  {option.priceDelta > 0 ? "+" : ""}Rs. {option.priceDelta}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
