// Sign-in sessions for this browser. One record per role (customer or admin) in localStorage, holding
// the account id and an expiry. This is demo-grade: anyone with access to this browser can change it.

export type SessionKind = "admin" | "customer";

const KEYS: Record<SessionKind, string> = {
  admin: "meg.session.admin",
  customer: "meg.session.customer",
};

const MAX_AGE_MS: Record<SessionKind, number> = {
  admin: 8 * 60 * 60 * 1000,
  customer: 30 * 24 * 60 * 60 * 1000,
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function startSession(kind: SessionKind, accountId: string): void {
  const store = storage();
  if (!store) return;
  store.setItem(KEYS[kind], JSON.stringify({ id: accountId, exp: Date.now() + MAX_AGE_MS[kind] }));
}

export function endSession(kind: SessionKind): void {
  storage()?.removeItem(KEYS[kind]);
}

// The signed-in account id for this role, or null when there is no valid session.
export function readSession(kind: SessionKind): string | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(KEYS[kind]);
    if (!raw) return null;
    const data = JSON.parse(raw) as { id?: unknown; exp?: unknown };
    if (typeof data.id !== "string" || typeof data.exp !== "number" || data.exp < Date.now()) {
      store.removeItem(KEYS[kind]);
      return null;
    }
    return data.id;
  } catch {
    return null;
  }
}
