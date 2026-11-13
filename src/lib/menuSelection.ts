// Shared "active category" for the homepage, so the sticky category bar and the menu tabs
// stay in sync. In memory only: a fresh visit starts on the first category.

let activeCategory: string | null = null;
const listeners = new Set<() => void>();

export const menuSelection = {
  subscribe(callback: () => void) {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
  getSnapshot: () => activeCategory,
  getServerSnapshot: () => null as string | null,
  set(id: string) {
    activeCategory = id;
    listeners.forEach((l) => l());
  },
};

// Request to open a product's detail window from outside the menu (for example a banner).
let requestedProduct: string | null = null;
const productListeners = new Set<() => void>();

export const productRequest = {
  subscribe(callback: () => void) {
    productListeners.add(callback);
    return () => {
      productListeners.delete(callback);
    };
  },
  getSnapshot: () => requestedProduct,
  getServerSnapshot: () => null as string | null,
  set(id: string | null) {
    requestedProduct = id;
    productListeners.forEach((l) => l());
  },
};

export function openProduct(id: string) {
  productRequest.set(id);
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// While a category jump is animating, the scroll-spy in the menu leaves the active category alone,
// so the highlight does not flicker through the categories in between. Released when the scroll ends.
let scrollLocked = false;
export const isCategoryScrollLocked = () => scrollLocked;

// Selects a category and smoothly scrolls to its section, just below the sticky category bar.
export function showCategory(id: string) {
  menuSelection.set(id);
  const target = document.getElementById(`menu-category-${id}`);
  if (!target) return;
  const reduced = prefersReducedMotion();
  const bar = document.getElementById("menu-category-nav");
  const offset = bar ? bar.getBoundingClientRect().bottom : 0;
  const top = target.getBoundingClientRect().top + window.scrollY - offset - 16;

  const release = () => {
    if (!scrollLocked) return;
    scrollLocked = false;
    window.clearTimeout(fallback);
    window.removeEventListener("scrollend", release);
    window.dispatchEvent(new Event("menu-scroll-settled"));
  };
  // "scrollend" is not in every browser, so a timeout releases the lock as well.
  const fallback = window.setTimeout(release, 1500);
  scrollLocked = true;
  window.addEventListener("scrollend", release, { once: true });
  window.scrollTo({ top: Math.max(0, top), behavior: reduced ? "auto" : "smooth" });
  if (reduced) release();
}

// Scrolls to the menu and focuses its search box.
export function focusMenuSearch() {
  const input = document.getElementById("menu-search") as HTMLInputElement | null;
  document.getElementById("menu")?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  input?.focus({ preventScroll: true });
}
