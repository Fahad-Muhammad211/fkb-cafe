"use client";

import Image from "next/image";
import type { MenuCategory } from "@/types";

interface CategoryImageNavProps {
  categories: MenuCategory[];
  onSelect: (id: string) => void;
}

// Food-image category row shown at the top of the menu. It scrolls away with the page, and the
// compact pill bar in the header takes over while the reader is further down.
export function CategoryImageNav({ categories, onSelect }: CategoryImageNavProps) {
  return (
    <nav aria-label="Browse categories" className="-mx-3 sm:mx-0">
      <ul className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-3 py-2 sm:justify-center sm:px-0">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <li key={category.id} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onSelect(category.id)}
                className="group flex w-20 flex-col items-center gap-2 text-center transition-transform duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ffd400] sm:w-24"
              >
                <span className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-800 transition-colors duration-200 group-hover:border-[#ffd400] sm:h-20 sm:w-20">
                  {category.image ? (
                    <Image src={category.image} alt="" fill sizes="80px" className="object-cover" />
                  ) : (
                    <Icon className="h-6 w-6 text-zinc-400" aria-hidden="true" />
                  )}
                </span>
                <span className="text-xs font-semibold leading-tight text-zinc-200 group-hover:text-white">{category.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
