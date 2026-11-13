"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { BookOpen, Search, X } from "lucide-react";
import { categoriesStore, parseCategories, toMenuCategory } from "@/lib/categories";
import { isCategoryScrollLocked, menuSelection, productRequest, showCategory } from "@/lib/menuSelection";
import { MenuPagesDialog } from "@/components/sections/MenuPagesDialog";
import { parseProducts, productsStore } from "@/lib/products";
import { CategoryImageNav } from "@/components/ui/CategoryImageNav";
import { FeaturedVideo } from "@/components/ui/FeaturedVideo";
import { ProductCard } from "@/components/ui/ProductCard";
import { Reveal } from "@/components/ui/Reveal";

// The product modal loads on first open, keeping it out of the initial page bundle.
const ProductModal = dynamic(() => import("@/components/ui/ProductModal").then((m) => m.ProductModal), { ssr: false });

// Pixels of breathing room between the sticky category bar and a section when it is "current".
const SPY_OFFSET_PX = 24;

// Popular Items: the featured card plays its video, and the rest are photo cards.
const FEATURED_ID = "meg-classic";
const FEATURED_VIDEO = "/images/menu/1790591229-Meg-Classic-Webm-1.webm";
const FEATURED_POSTER = "/images/products/meg-classic.webp";
const POPULAR_IDS = ["flaming-hot", "smokehouse", "chicken-loaded-fries"];

// Full-width banners shown at the top of a category section, keyed by category id.
const CATEGORY_BANNERS: Record<string, { src: string; alt: string }> = {
  "light-eats": { src: "/images/menu/1790262029-Light-Eats.png", alt: "Light Eats: balanced bites for a better you" },
  "beef-burgers": { src: "/images/menu/1790262039-Beef-Burger.png", alt: "Beef Burgers" },
  "chicken-burgers": { src: "/images/menu/1790262043-Chicken-Burgers.png", alt: "Chicken Burgers" },
  wraps: { src: "/images/menu/1790262049-wraps.png", alt: "Wraps" },
  fries: { src: "/images/menu/1790262053-Fries.png", alt: "Fries" },
  pasta: { src: "/images/menu/1790262059-Pasta.png", alt: "Pasta" },
  "iced-blends": { src: "/images/menu/1790262065-Iced-Blends.png", alt: "Iced Blends" },
  "hot-beverages": { src: "/images/menu/1790262072-Hot-Beverages.png", alt: "Hot Beverages" },
  "sweet-treats": { src: "/images/menu/1790262079-Sweet-Treats.png", alt: "Sweet Treats" },
  cheers: { src: "/images/menu/1790262083-Cheers.png", alt: "Cheers" },
  "meg-dips": { src: "/images/menu/1790262089-MEG-Dips.png", alt: "MEG Dips" },
};

export function Menu() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const productsRaw = useSyncExternalStore(productsStore.subscribe, productsStore.getSnapshot, productsStore.getServerSnapshot);
  const categoriesRaw = useSyncExternalStore(categoriesStore.subscribe, categoriesStore.getSnapshot, categoriesStore.getServerSnapshot);

  // Products switched off in the admin dashboard are hidden from the storefront.
  const products = useMemo(() => parseProducts(productsRaw).filter((p) => p.available !== false), [productsRaw]);
  const categories = useMemo(() => parseCategories(categoriesRaw).map(toMenuCategory), [categoriesRaw]);
  const featuredItem = products.find((p) => p.id === FEATURED_ID) ?? null;
  const popularItems = POPULAR_IDS.map((id) => products.find((p) => p.id === id)).filter((p) => p !== undefined);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const searchResults = searching
    ? products.filter((p) => [p.name, p.description ?? "", p.pieces ?? ""].some((field) => field.toLowerCase().includes(q)))
    : [];

  // A banner can also ask for a product to be opened (see openProduct in lib/menuSelection).
  const requestedId = useSyncExternalStore(productRequest.subscribe, productRequest.getSnapshot, productRequest.getServerSnapshot);
  const openId = selectedId ?? requestedId;
  const selectedItem = products.find((item) => item.id === openId) ?? null;
  const [showMenuPages, setShowMenuPages] = useState(false);

  const closeModal = useCallback(() => {
    setSelectedId(null);
    productRequest.set(null);
  }, []);

  // Scroll-spy: the category whose section has reached the sticky bar becomes the active one.
  // It is paused while a category jump is animating (see showCategory in lib/menuSelection).
  useEffect(() => {
    if (searching) return;
    const update = () => {
      if (isCategoryScrollLocked()) return;
      const bar = document.getElementById("menu-category-nav");
      const line = (bar ? bar.getBoundingClientRect().bottom : 0) + SPY_OFFSET_PX;
      let current = categories[0]?.id;
      for (const c of categories) {
        const el = document.getElementById(`menu-category-${c.id}`);
        if (el && el.getBoundingClientRect().top <= line) current = c.id;
      }
      if (current && current !== menuSelection.getSnapshot()) menuSelection.set(current);
    };
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("menu-scroll-settled", update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("menu-scroll-settled", update);
    };
  }, [categories, searching]);

  return (
    <section
      id="menu"
      aria-labelledby="menu-heading"
      className="w-full scroll-mt-28 bg-zinc-950 text-white md:scroll-mt-36"
    >
      <div className="mx-auto max-w-[1260px] px-3 py-10 sm:px-4 md:py-14 lg:px-0">
        <h2 id="menu-heading" className="sr-only">
          Our menu
        </h2>

        {/* Food-image category row at the top; the compact header bar takes over when scrolled. */}
        <CategoryImageNav
          categories={categories}
          onSelect={(id) => {
            setQuery("");
            showCategory(id);
          }}
        />

        {/* Search, as on the reference site */}
        <div className="mx-auto w-full max-w-md">
          <label htmlFor="menu-search" className="sr-only">
            Search the menu
          </label>
          <div className="flex items-center gap-3 rounded-full border border-zinc-700 bg-zinc-900 py-1.5 pl-4 pr-1.5 transition-colors focus-within:border-zinc-500">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
            <input
              id="menu-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for burgers, fries, tacos…"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none"
            />
            {searching && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 transition-transform hover:scale-105 active:scale-95"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setShowMenuPages(true)}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              View full menu
            </button>
          </div>
        </div>

        {!searching && (featuredItem || popularItems.length > 0) && (
          <section id="menu-popular" aria-labelledby="menu-popular-heading" className="mt-12">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-zinc-800 pb-3">
                <div>
                  <h3 id="menu-popular-heading" className="text-2xl font-black uppercase tracking-tight sm:text-3xl md:text-4xl">
                    Popular Items
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-zinc-300">The dishes our guests order again and again.</p>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {featuredItem && (
                  <ProductCard
                    item={featuredItem}
                    index={0}
                    onOpen={() => setSelectedId(featuredItem.id)}
                    media={<FeaturedVideo src={FEATURED_VIDEO} poster={FEATURED_POSTER} />}
                  />
                )}
                {popularItems.map((item, index) => (
                  <ProductCard key={item.id} item={item} index={index + 1} onOpen={() => setSelectedId(item.id)} />
                ))}
              </div>
            </Reveal>
          </section>
        )}

        {searching ? (
          <Reveal>
            <div className="mt-10 text-center">
              <h3 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">Search results</h3>
              <p className="mt-2 text-sm text-zinc-400" aria-live="polite">
                {searchResults.length} {searchResults.length === 1 ? "match" : "matches"} for “{query.trim()}”
              </p>
            </div>
            {searchResults.length > 0 ? (
              <div key={`search-${q}`} className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {searchResults.map((item, index) => (
                  <ProductCard key={item.id} item={item} index={index} onOpen={() => setSelectedId(item.id)} />
                ))}
              </div>
            ) : (
              <div className="mt-8 rounded-xl border border-dashed border-zinc-700 px-6 py-12 text-center text-sm text-zinc-400">
                No dishes match your search. Try another word.
              </div>
            )}
          </Reveal>
        ) : (
          categories.map((category) => {
            const items = products.filter((item) => item.categoryId === category.id);
            return (
              <section
                key={category.id}
                id={`menu-category-${category.id}`}
                aria-labelledby={`menu-category-${category.id}-heading`}
                className="mt-12 scroll-mt-0 first:mt-10"
              >
                {CATEGORY_BANNERS[category.id] && (
                  <div className="relative mb-6 h-[160px] w-full overflow-hidden rounded-2xl bg-zinc-900 md:h-[220px] lg:h-[280px]">
                    <Image
                      src={CATEGORY_BANNERS[category.id].src}
                      alt={CATEGORY_BANNERS[category.id].alt}
                      fill
                      sizes="(min-width: 1260px) 1260px, 100vw"
                      className="object-cover object-center"
                    />
                  </div>
                )}
                <Reveal>
                  <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-zinc-800 pb-3">
                    <div>
                      <h3
                        id={`menu-category-${category.id}-heading`}
                        className="text-2xl font-black uppercase tracking-tight sm:text-3xl md:text-4xl"
                      >
                        {category.label}
                      </h3>
                      {category.tagline && <p className="mt-1 text-sm font-semibold text-zinc-300">{category.tagline}</p>}
                    </div>
                    <span className="text-xs uppercase tracking-wide text-zinc-500">
                      {items.length} {items.length === 1 ? "item" : "items"}
                    </span>
                  </div>

                  {items.length > 0 ? (
                    <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                      {items.map((item, index) => (
                        <ProductCard key={item.id} item={item} index={index} onOpen={() => setSelectedId(item.id)} />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-6 rounded-xl border border-dashed border-zinc-700 px-6 py-10 text-center text-sm text-zinc-400">
                      Items for {category.label} will appear here soon.
                    </div>
                  )}
                </Reveal>
              </section>
            );
          })
        )}
      </div>

      {selectedItem && (
        <ProductModal key={selectedItem.id} item={selectedItem} onClose={closeModal} />
      )}
      {showMenuPages && <MenuPagesDialog onClose={() => setShowMenuPages(false)} />}
    </section>
  );
}
