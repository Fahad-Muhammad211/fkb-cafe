import { AREAS } from "@/data/areas";
import { createStorageStore, writeJSON } from "@/lib/storage";

// The customer's chosen order type and area, like the reference site's location picker.

export const LOCATION_KEY = "meg-location-v1";
export const locationStore = createStorageStore(LOCATION_KEY);

export type OrderType = "delivery" | "pickup";

export interface SavedLocation {
  orderType: OrderType;
  city: string;
  area: string;
}

export const CITIES = ["Lahore", "Islamabad", "Rawalpindi", "Gujranwala"] as const;

// Area lists per city (see data/areas.ts). Customers can also type an area that is not listed.
export const AREA_SUGGESTIONS: Record<string, string[]> = AREAS;

// Areas matching a search, for one city or all of them, best matches first.
export function searchAreas(query: string, city: string | null, limit = 60): { area: string; city: string }[] {
  const q = query.trim().toLowerCase();
  const cities = city ? [city] : [...CITIES];
  const results: { area: string; city: string; rank: number }[] = [];
  for (const c of cities) {
    for (const area of AREAS[c] ?? []) {
      const name = area.toLowerCase();
      const at = q ? name.indexOf(q) : 0;
      if (at === -1) continue;
      // Prefer matches at the start of the name, then of any word.
      const rank = at === 0 ? 0 : name.includes(` ${q}`) || name.includes(`(${q}`) ? 1 : 2;
      results.push({ area, city: c, rank });
    }
  }
  results.sort((a, b) => a.rank - b.rank || a.area.localeCompare(b.area));
  return results.slice(0, limit).map(({ area, city: c }) => ({ area, city: c }));
}

export function parseLocation(raw: string | null | undefined): SavedLocation | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedLocation>;
    if ((parsed.orderType === "delivery" || parsed.orderType === "pickup") && typeof parsed.city === "string" && typeof parsed.area === "string") {
      return { orderType: parsed.orderType, city: parsed.city, area: parsed.area };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLocation(location: SavedLocation) {
  writeJSON(LOCATION_KEY, location);
  locationStore.notify();
}

// In-memory open/closed state for the location modal, shared by the header and the modal.
let modalOpen = false;
const modalListeners = new Set<() => void>();
const emitModal = () => modalListeners.forEach((l) => l());

export const locationModal = {
  subscribe(callback: () => void) {
    modalListeners.add(callback);
    return () => {
      modalListeners.delete(callback);
    };
  },
  getSnapshot: () => modalOpen,
  getServerSnapshot: () => false,
  open() {
    modalOpen = true;
    emitModal();
  },
  close() {
    modalOpen = false;
    emitModal();
  },
};
