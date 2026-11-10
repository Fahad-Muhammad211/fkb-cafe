import { getCollection } from "@/lib/server/collections";
import type { CartLine } from "@/types";

// Each signed-in customer has one saved cart, keyed by their user id. Guests keep their cart in
// the browser only.

export const MAX_CART_LINES = 30;
const MAX_QTY = 99;

type CartDoc = { _id: string; lines: CartLine[]; updatedAt: string };

const cartsCollection = () => getCollection<CartDoc>("carts");

const isText = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

// Checks the shape of one cart line. Prices are checked again when the order is placed.
export function sanitizeCartLine(raw: unknown): CartLine | null {
  if (typeof raw !== "object" || raw === null) return null;
  const l = raw as Record<string, unknown>;
  if (!isText(l.id, 80) || !l.id || !isText(l.itemId, 80) || !l.itemId || !isText(l.name, 120)) return null;
  if (!Number.isInteger(l.unitPrice) || (l.unitPrice as number) < 0 || (l.unitPrice as number) > 1_000_000) return null;
  if (!Number.isInteger(l.qty) || (l.qty as number) < 1 || (l.qty as number) > MAX_QTY) return null;
  if (!Array.isArray(l.options) || l.options.length > 10 || !l.options.every((o) => isText(o, 120))) return null;
  if (!isText(l.instructions, 300)) return null;
  const unitPrice = l.unitPrice as number;
  const qty = l.qty as number;
  return {
    id: l.id,
    itemId: l.itemId,
    name: l.name,
    unitPrice,
    qty,
    total: unitPrice * qty,
    options: l.options as string[],
    instructions: l.instructions,
  };
}

export async function getSavedCart(userId: string): Promise<CartLine[]> {
  const doc = await (await cartsCollection()).findOne({ _id: userId });
  return doc?.lines ?? [];
}

export async function saveCart(userId: string, lines: CartLine[]): Promise<void> {
  await (await cartsCollection()).updateOne(
    { _id: userId },
    { $set: { lines, updatedAt: new Date().toISOString() } },
    { upsert: true },
  );
}
