import type { CartLine } from "@/types";

// Browser-side client for a signed-in customer's saved cart. Guests never call these.

// The saved cart, or null when the request fails (the local cart is kept in that case).
export async function fetchSavedCart(): Promise<CartLine[] | null> {
  try {
    const res = await fetch("/api/customer/cart", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { lines?: CartLine[] };
    return Array.isArray(data.lines) ? data.lines : null;
  } catch {
    return null;
  }
}

export async function saveSavedCart(lines: CartLine[]): Promise<void> {
  try {
    const res = await fetch("/api/customer/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
      credentials: "same-origin",
    });
    if (!res.ok) console.error(`[cart] not saved (HTTP ${res.status})`);
  } catch {
    console.error("[cart] could not be reached");
  }
}
