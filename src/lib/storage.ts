// Small helpers for localStorage-backed demo data. Every access is wrapped so a blocked or
// full storage never crashes the page.

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

// Creates a subscribe/getSnapshot pair for useSyncExternalStore over one storage key.
// The server snapshot is undefined so pages can show a loading state until hydration.
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
