// Browser-side storage helpers.
//
// localStorage holds personal preferences only (the cart and the chosen delivery location). Accounts,
// sessions and business records (menu, orders, restaurants, staff, payments, ...) live in MongoDB on the
// server; the browser keeps them in memory for the current page only (createMemoryStore). Every
// localStorage access is wrapped so a blocked or full storage never crashes the page.

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to remove if storage is blocked.
  }
}

// Creates a subscribe/getSnapshot pair for useSyncExternalStore over one localStorage key (personal
// preferences only). The server snapshot is undefined so pages can show a loading state until hydration.
export function createStorageStore(key: string) {
  const listeners = new Set<() => void>();

  const subscribe = (callback: () => void) => {
    listeners.add(callback);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) callback();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(callback);
      window.removeEventListener("storage", onStorage);
    };
  };

  const getSnapshot = (): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const getServerSnapshot = (): string | null | undefined => undefined;

  const notify = () => listeners.forEach((listener) => listener());

  return { subscribe, getSnapshot, getServerSnapshot, notify };
}

// The same interface over a value held in memory, for data loaded from the server. Nothing is written
// to the browser's storage, so it is gone when the page is closed. The snapshot is undefined until the
// first value arrives, so pages show their loading state instead of an empty list.
export function createMemoryStore() {
  const listeners = new Set<() => void>();
  let value: string | undefined;

  const notify = () => listeners.forEach((listener) => listener());

  return {
    subscribe(callback: () => void) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    getSnapshot: (): string | undefined => value,
    getServerSnapshot: (): string | undefined => undefined,
    // Replaces the value (JSON text) and tells every subscriber.
    set(next: unknown) {
      value = JSON.stringify(next);
      notify();
    },
    // True once a value has been set.
    loaded: () => value !== undefined,
    notify,
  };
}

// localStorage keys this app used before accounts and business data moved to MongoDB. They held demo
// accounts, password hashes, sessions and copies of business records, and are no longer read anywhere.
const LEGACY_KEY_PREFIXES = ["meg-local:", "meg.session."];
const LEGACY_KEYS = ["meg-orders-v1", "meg-products-v1", "meg-categories-v1"];

// Removes the legacy keys from this browser. Personal preferences (cart, location) are kept. Returns the
// keys it removed. Safe to run on every page load: once they are gone it does nothing.
export function purgeLegacyBrowserData(): string[] {
  const removed: string[] = [];
  try {
    const storage = window.localStorage;
    // Collect the keys first: the order of storage.key(i) can change after a removal.
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key !== null) keys.push(key);
    }
    for (const key of keys) {
      if (LEGACY_KEYS.includes(key) || LEGACY_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        storage.removeItem(key);
        removed.push(key);
      }
    }
  } catch {
    // Storage blocked: there is nothing this page can read or remove.
  }
  return removed;
}
