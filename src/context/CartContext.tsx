"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchSavedCart, saveSavedCart } from "@/lib/cartApi";
import { CART_STORAGE_KEY, DELIVERY_FEE } from "@/lib/constants";
import { locationStore, parseLocation, type OrderType } from "@/lib/location";
import type { CartLine } from "@/types";

type NewCartLine = Omit<CartLine, "id" | "total">;

interface CartContextValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  deliveryFee: number;
  orderType: OrderType;
  total: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addLine: (line: NewCartLine) => void;
  updateQty: (lineId: string, qty: number) => void;
  removeLine: (lineId: string) => void;
  stepItem: (itemId: string, delta: 1 | -1) => void;
  qtyForItem: (itemId: string) => number;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const MAX_QTY = 99;
const TOAST_MS = 2500;

const clampQty = (qty: number) => Math.min(MAX_QTY, Math.max(1, Math.round(qty)));

const sameOptions = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.itemId === "string" &&
    typeof v.name === "string" &&
    typeof v.unitPrice === "number" &&
    typeof v.qty === "number" &&
    Array.isArray(v.options) &&
    typeof v.instructions === "string"
  );
}

// Parses the saved cart. Returns an empty cart for missing or malformed data.
function parseCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartLine).map((line) => {
      const qty = clampQty(line.qty);
      return { ...line, qty, total: line.unitPrice * qty };
    });
  } catch {
    return [];
  }
}

// Minimal external store over localStorage. useSyncExternalStore reads it without
// effects, and the server snapshot is null so server and client first renders match.
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CART_STORAGE_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string | null {
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function writeLocalCart(lines: CartLine[]) {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage full or blocked: the cart still works for this page session.
  }
  listeners.forEach((listener) => listener());
}

// The signed-in customer whose cart is saved to MongoDB; null for guests.
let cartOwnerId: string | null = null;

// Applies an update to the latest saved cart, persists it in the browser and, for a signed-in
// customer, on the server.
function updateCart(update: (prev: CartLine[]) => CartLine[]) {
  const next = update(parseCart(getSnapshot()));
  writeLocalCart(next);
  if (cartOwnerId) void saveSavedCart(next);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const lines = useMemo(() => parseCart(raw), [raw]);
  const [isOpen, setIsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { user } = useAuth();
  // undefined while the saved session loads, so the cart is left alone until we know who is signed in.
  const userId = user === undefined ? undefined : (user?.id ?? null);
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    if (userId === undefined) return;
    const previous = previousUserId.current;
    previousUserId.current = userId;
    cartOwnerId = userId;

    if (userId === null) {
      // Signed out: the account's cart should not stay on a shared device.
      if (previous) writeLocalCart([]);
      return;
    }

    let active = true;
    fetchSavedCart().then((saved) => {
      if (!active || saved === null) return;
      // Keep the saved cart and add anything put in the cart on this device before signing in.
      const savedIds = new Set(saved.map((line) => line.id));
      const local = parseCart(getSnapshot()).filter((line) => !savedIds.has(line.id));
      const merged = [...saved, ...local];
      writeLocalCart(merged);
      if (local.length > 0) void saveSavedCart(merged);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const showToast = useCallback((message: string) => setToast(message), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const addLine = useCallback(
    (line: NewCartLine) => {
      updateCart((prev) => {
        const index = prev.findIndex(
          (l) =>
            l.itemId === line.itemId &&
            l.unitPrice === line.unitPrice &&
            l.instructions === line.instructions &&
            sameOptions(l.options, line.options),
        );
        if (index >= 0) {
          return prev.map((l, i) => {
            if (i !== index) return l;
            const qty = clampQty(l.qty + line.qty);
            return { ...l, qty, total: l.unitPrice * qty };
          });
        }
        const qty = clampQty(line.qty);
        const id = `${line.itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        return [...prev, { ...line, id, qty, total: line.unitPrice * qty }];
      });
      showToast("Item added to cart");
    },
    [showToast],
  );

  const updateQty = useCallback((lineId: string, qty: number) => {
    updateCart((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        const next = clampQty(qty);
        return { ...l, qty: next, total: l.unitPrice * next };
      }),
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    updateCart((prev) => prev.filter((l) => l.id !== lineId));
  }, []);

  // Card-level stepper: changes the most recently added line for an item.
  const stepItem = useCallback((itemId: string, delta: 1 | -1) => {
    updateCart((prev) => {
      let index = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].itemId === itemId) {
          index = i;
          break;
        }
      }
      if (index < 0) return prev;
      const nextQty = prev[index].qty + delta;
      if (nextQty < 1) return prev.filter((_, i) => i !== index);
      const qty = clampQty(nextQty);
      return prev.map((l, i) => (i === index ? { ...l, qty, total: l.unitPrice * qty } : l));
    });
  }, []);

  const clearCart = useCallback(() => updateCart(() => []), []);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  // The delivery fee follows the order type chosen in the location picker (pick-up is free).
  const locationRaw = useSyncExternalStore(locationStore.subscribe, locationStore.getSnapshot, locationStore.getServerSnapshot);
  const orderType: OrderType = parseLocation(locationRaw)?.orderType ?? "delivery";

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((sum, l) => sum + l.qty, 0);
    const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
    const deliveryFee = count > 0 && orderType === "delivery" ? DELIVERY_FEE : 0;
    return {
      lines,
      count,
      subtotal,
      deliveryFee,
      orderType,
      total: subtotal + deliveryFee,
      isOpen,
      openCart,
      closeCart,
      addLine,
      updateQty,
      removeLine,
      stepItem,
      qtyForItem: (itemId: string) =>
        lines.filter((l) => l.itemId === itemId).reduce((sum, l) => sum + l.qty, 0),
      clearCart,
    };
  }, [lines, orderType, isOpen, openCart, closeCart, addLine, updateQty, removeLine, stepItem, clearCart]);

  return (
    <CartContext.Provider value={value}>
      {children}
      {toast && <Toast message={toast} onDone={dismissToast} />}
    </CartContext.Provider>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, TOAST_MS);
    return () => window.clearTimeout(id);
  }, [message, onDone]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-toast-in fixed left-1/2 top-4 z-[120] flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-xl"
    >
      <span className="h-2 w-2 rounded-full bg-white" aria-hidden="true" />
      {message}
    </div>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
