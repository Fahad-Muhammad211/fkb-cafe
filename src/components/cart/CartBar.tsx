"use client";

import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { useHydrated } from "@/hooks/useHydrated";
import { formatPKR } from "@/lib/format";

// Floating "View Cart" bar shown while the cart has items and the drawer is closed.
// Hidden on checkout, where the cart is already on screen.
export function CartBar() {
  const { count, total, isOpen, openCart } = useCart();
  const pathname = usePathname();
  // This bar hydrates inside a Suspense boundary, after the cart has loaded from storage, so it
  // waits until hydration is done to avoid a server/client mismatch when the cart has items.
  const hydrated = useHydrated();

  if (!hydrated || count === 0 || isOpen || pathname === "/checkout" || pathname.startsWith("/admin") || pathname.startsWith("/owner") || pathname.startsWith("/kitchen")) return null;

  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={`View cart, ${count} ${count === 1 ? "item" : "items"}, ${formatPKR(total)}`}
      className="animate-fade-in fixed bottom-5 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-4 rounded-full bg-black py-2 pl-2 pr-5 text-sm font-semibold text-white shadow-xl transition-transform duration-200 hover:scale-[1.03] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd400]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-xs font-bold text-black">
        {count}
      </span>
      <span>View Cart</span>
      <span className="h-4 w-px bg-white/30" aria-hidden="true" />
      <span className="tabular-nums">{formatPKR(total)}</span>
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
