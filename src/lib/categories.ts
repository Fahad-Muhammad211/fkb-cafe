import { CATEGORY_IMAGES } from "@/data/assets";
import { ICON_MAP, MENU_CATEGORIES } from "@/data/menu";
import { saveCatalogList } from "@/lib/catalogApi";
import { createMemoryStore } from "@/lib/storage";
import type { MenuCategory, StoredCategory } from "@/types";
import { Utensils } from "lucide-react";

// Shared store: the storefront tabs and the admin category manager both read it. Categories live in
// MongoDB; this is the page's in-memory copy, loaded by DataSync and never written to browser storage.
export const categoriesStore = createMemoryStore();

export const ICON_NAMES = Object.keys(ICON_MAP);

const iconNameFor = (icon: MenuCategory["icon"]) =>
  Object.keys(ICON_MAP).find((name) => ICON_MAP[name] === icon) ?? "Utensils";

// The five starting categories, in storable form.
const SEED: StoredCategory[] = MENU_CATEGORIES.map((c) => ({
  id: c.id,
  label: c.label,
  tagline: c.tagline,
  iconName: iconNameFor(c.icon),
}));

// Returns the saved categories, or the seed list when nothing has been saved yet.
export function parseCategories(raw: string | null | undefined): StoredCategory[] {
  if (raw === null || raw === undefined) return SEED;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SEED;
    const valid = parsed.filter(
      (c): c is StoredCategory =>
        typeof c === "object" && c !== null && typeof (c as StoredCategory).id === "string" && typeof (c as StoredCategory).label === "string",
    );
    return valid.length > 0 ? valid : SEED;
  } catch {
    return SEED;
  }
}

export function toMenuCategory(c: StoredCategory): MenuCategory {
  return {
    id: c.id,
    label: c.label,
    tagline: c.tagline || undefined,
    icon: ICON_MAP[c.iconName] ?? Utensils,
    image: CATEGORY_IMAGES[c.id],
  };
}

// Keeps the list in memory for this page. Used when loading the menu from the server.
export function cacheCategories(categories: StoredCategory[]): boolean {
  categoriesStore.set(categories);
  return true;
}

// Admin save: updates this page straight away, then stores the full list on the server.
export function saveCategories(categories: StoredCategory[]): boolean {
  const saved = cacheCategories(categories);
  void saveCatalogList("/api/admin/categories", { categories });
  return saved;
}

// Creates a URL-safe id from a label, adding a numeric suffix if it is already taken.
export function categoryIdFor(label: string, existing: StoredCategory[]): string {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "category";
  let id = base;
  let n = 2;
  while (existing.some((c) => c.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}
