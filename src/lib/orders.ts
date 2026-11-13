import { createStorageStore, writeJSON } from "@/lib/storage";
import type { CartLine, Order } from "@/types";

export const ORDERS_STORAGE_KEY = "meg-orders-v1";

// Shared store so the history and detail views update when an order changes.
// Orders are kept in MongoDB; this list is a copy for this browser.
export const ordersStore = createStorageStore(ORDERS_STORAGE_KEY);

export function parseOrders(raw: string | null | undefined): Order[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Order[]) : [];
  } catch {
    return [];
  }
}

function readOrders(): Order[] {
  return parseOrders(window.localStorage.getItem(ORDERS_STORAGE_KEY));
}

// Replaces the browser copy of the order list (used when loading orders from the server).
export function saveAllOrders(orders: Order[]): boolean {
  const saved = writeJSON(ORDERS_STORAGE_KEY, orders);
  ordersStore.notify();
  return saved;
}

// Puts one order from the server into the browser copy, keeping newest first.
function upsertOrder(order: Order) {
  const others = readOrders().filter((o) => o.id !== order.id);
  saveAllOrders([order, ...others].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
}

export function findOrder(orders: Order[], id: string): Order | null {
  return orders.find((o) => o.id === id) ?? null;
}

// A random id for one checkout attempt. Sent with the order so a retried request cannot place it twice.
export function createClientOrderId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type OrderActionResult = { ok: true; order: Order } | { ok: false; error: string; errors?: Record<string, string> };

type ApiBody = { order?: Order; error?: string; errors?: Record<string, string> };

// Sends one request and reads the server's { error, errors? } shape. Updates the browser copy on success.
async function orderRequest(url: string, method: "POST" | "PATCH", body?: unknown): Promise<OrderActionResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => null)) as ApiBody | null;
    if (res.ok && data?.order) {
      upsertOrder(data.order);
      return { ok: true, order: data.order };
    }
    return { ok: false, error: data?.error ?? "Something went wrong. Please try again.", errors: data?.errors };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

// Sends a new order. The server checks the cart against the menu, sets the totals and numbers the order.
export function placeOrder(draft: {
  clientOrderId: string;
  customer: Order["customer"];
  fulfilment: Order["fulfilment"];
  lines: CartLine[];
}): Promise<OrderActionResult> {
  return orderRequest("/api/orders", "POST", draft);
}

export function confirmOrder(id: string): Promise<OrderActionResult> {
  return orderRequest(`/api/orders/${encodeURIComponent(id)}/confirm`, "POST");
}

export function cancelOrder(id: string): Promise<OrderActionResult> {
  return orderRequest(`/api/orders/${encodeURIComponent(id)}/cancel`, "POST");
}

// Admin: sets the fulfilment step (index into ORDER_STEPS).
export function setOrderProgress(id: string, step: number): Promise<OrderActionResult> {
  return orderRequest(`/api/orders/${encodeURIComponent(id)}`, "PATCH", { statusOverride: step });
}

// Fetches orders from the server into this browser. Returns null when the request fails or
// the caller is not allowed to see them, so the cached copy is left alone.
export async function fetchOrders(scope: "admin" | "customer"): Promise<Order[] | null> {
  try {
    const url = scope === "admin" ? "/api/admin/orders" : "/api/orders";
    const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { orders?: Order[] };
    return Array.isArray(data.orders) ? data.orders : null;
  } catch {
    return null;
  }
}
