import type { MenuItem, StoredCategory } from "@/types";

// Browser-side client for the menu API. Reads are public; saves need an admin session.

export interface CatalogSnapshot {
  products: MenuItem[];
  categories: StoredCategory[];
}

export async function fetchCatalog(): Promise<CatalogSnapshot | null> {
  try {
    const res = await fetch("/api/catalog", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<CatalogSnapshot>;
    return Array.isArray(data.products) && Array.isArray(data.categories)
      ? { products: data.products, categories: data.categories }
      : null;
  } catch {
    return null;
  }
}

// Sends one saved list to the server. Returns false if the server did not store it.
export async function saveCatalogList(url: "/api/admin/products" | "/api/admin/categories", body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    if (!res.ok) console.error(`[catalog] ${url} was not saved (HTTP ${res.status})`);
    return res.ok;
  } catch {
    console.error(`[catalog] ${url} could not be reached`);
    return false;
  }
}
