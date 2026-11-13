"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { categoriesStore, parseCategories } from "@/lib/categories";
import { menuSelection, showCategory } from "@/lib/menuSelection";
import { cn } from "@/lib/utils";

// Sticky category pills under the header. Uses the same categories as the menu (managed in
// the admin dashboard). Clicking one scrolls to its section, and the active pill follows the
// section the reader is in.
export function CategoryBar() {
  const raw = useSyncExternalStore(categoriesStore.subscribe, categoriesStore.getSnapshot, categoriesStore.getServerSnapshot);
  const selected = useSyncExternalStore(menuSelection.subscribe, menuSelection.getSnapshot, menuSelection.getServerSnapshot);
  const categories = useMemo(() => parseCategories(raw), [raw]);
  const active = selected ?? categories[0]?.id;
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the active pill visible when the bar scrolls sideways (only the bar itself moves).
  useEffect(() => {
    const pill = listRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    pill?.scrollIntoView({ block: "nearest", inline: "center", behavior: reduced ? "auto" : "smooth" });
  }, [active]);

  return (
    <nav
      id="menu-category-nav"
      aria-label="Menu categories"
      className="border-t border-white/5 bg-zinc-900"
    >
      <ul ref={listRef} className="no-scrollbar mx-auto flex max-w-[1800px] snap-x gap-2 overflow-x-auto px-3 py-2.5 sm:px-4 md:px-6 md:pt-5 lg:px-10">
        {categories.map((category) => {
          const isActive = category.id === active;
          return (
            <li key={category.id} className="shrink-0 snap-start">
              <button
                type="button"
                aria-current={isActive ? "true" : undefined}
                onClick={() => showCategory(category.id)}
                className={cn(
                  "whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd400]",
                  isActive
                    ? "border-zinc-600 bg-zinc-700 text-white"
                    : "border-transparent text-gray-200 hover:bg-zinc-800 hover:text-white",
                )}
              >
                {category.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
