import { PRODUCT_IMAGES } from "@/data/assets";
import { MENU_ITEMS } from "@/data/menu";
import { saveCatalogList } from "@/lib/catalogApi";
import { createStorageStore, writeJSON } from "@/lib/storage";
import type { MenuItem } from "@/types";

export const PRODUCTS_STORAGE_KEY = "meg-products-v1";

// Shared store: the storefront menu and the admin product manager both read it.
export const productsStore = createStorageStore(PRODUCTS_STORAGE_KEY);

// Fills in a configured photo (data/assets.ts) for products that have no image of their own.
const withAssetImage = (item: MenuItem): MenuItem =>
  item.image || !PRODUCT_IMAGES[item.id] ? item : { ...item, image: PRODUCT_IMAGES[item.id] };

const SEED_PRODUCTS = MENU_ITEMS.map(withAssetImage);

// Returns the saved product list, or the seed menu when nothing has been saved yet.
export function parseProducts(raw: string | null | undefined): MenuItem[] {
  if (raw === null || raw === undefined) return SEED_PRODUCTS;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MenuItem[]).map(withAssetImage) : SEED_PRODUCTS;
  } catch {
    return SEED_PRODUCTS;
  }
}

// Stores the list in this browser only. Used when loading the menu from the server.
export function cacheProducts(products: MenuItem[]): boolean {
  const saved = writeJSON(PRODUCTS_STORAGE_KEY, products);
  productsStore.notify();
  return saved;
}

// Admin save: updates this browser straight away, then stores the full list in MongoDB.
export function saveProducts(products: MenuItem[]): boolean {
  const saved = cacheProducts(products);
  void saveCatalogList("/api/admin/products", { products });
  return saved;
}

export function createProductId(): string {
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
