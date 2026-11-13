"use client";

import { useSyncExternalStore } from "react";
import { ArrowUp, Search } from "lucide-react";
import { focusMenuSearch } from "@/lib/menuSelection";
import { cn } from "@/lib/utils";

const SHOW_AFTER_PX = 600;

const subscribeScroll = (callback: () => void) => {
  window.addEventListener("scroll", callback, { passive: true });
  return () => window.removeEventListener("scroll", callback);
};

// Floating search (bottom left) and back-to-top (bottom right) buttons, as on the reference site.
export function FloatingActions() {
  const scrolled = useSyncExternalStore(subscribeScroll, () => window.scrollY > SHOW_AFTER_PX, () => false);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <>
      <button
        type="button"
        onClick={focusMenuSearch}
        aria-label="Search the menu"
        className="fixed bottom-5 left-4 z-[80] flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white shadow-xl ring-1 ring-zinc-800 transition-transform duration-200 hover:scale-105 active:scale-95 md:left-6"
      >
        <Search className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={toTop}
        aria-label="Back to top"
        tabIndex={scrolled ? 0 : -1}
        aria-hidden={!scrolled}
        className={cn(
          "fixed bottom-5 right-4 z-[80] flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white shadow-xl ring-1 ring-zinc-800 transition-all duration-300 hover:scale-105 active:scale-95 md:right-6",
          scrolled ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <ArrowUp className="h-5 w-5" aria-hidden="true" />
      </button>
    </>
  );
}
