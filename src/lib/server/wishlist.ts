import { getCollection } from "@/lib/server/collections";
import { readCatalog } from "@/lib/server/catalog";
import type { MenuItem } from "@/types";

// Each customer has one wishlist document, keyed by their user id. Only product ids are stored; the
// product details always come from the current menu, so price and availability stay correct.

export const MAX_WISHLIST = 100;

type WishlistDoc = { _id: string; itemIds: string[]; updatedAt: string };

const wishlistCollection = () => getCollection<WishlistDoc>("wishlists");

export async function getWishlist(userId: string): Promise<{ products: MenuItem[]; unavailableIds: string[] }> {
  const doc = await (await wishlistCollection()).findOne({ _id: userId });
  const ids = doc?.itemIds ?? [];
  if (ids.length === 0) return { products: [], unavailableIds: [] };

  const { products } = await readCatalog();
  const byId = new Map(products.map((p) => [p.id, p]));
  return {
    products: ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as MenuItem] : [])),
    unavailableIds: ids.filter((id) => !byId.has(id)),
  };
}

export async function addToWishlist(userId: string, itemId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { products } = await readCatalog();
  if (!products.some((p) => p.id === itemId)) return { ok: false, status: 404, error: "That item is not on the menu." };

  const collection = await wishlistCollection();
  const doc = await collection.findOne({ _id: userId });
  if (doc?.itemIds.includes(itemId)) return { ok: true };
  if ((doc?.itemIds.length ?? 0) >= MAX_WISHLIST) {
    return { ok: false, status: 409, error: `Your wishlist can hold up to ${MAX_WISHLIST} items.` };
  }
  await collection.updateOne(
    { _id: userId },
    { $addToSet: { itemIds: itemId }, $set: { updatedAt: new Date().toISOString() } },
    { upsert: true },
  );
  return { ok: true };
}

export async function removeFromWishlist(userId: string, itemId: string): Promise<void> {
  await (await wishlistCollection()).updateOne(
    { _id: userId },
    { $pull: { itemIds: itemId }, $set: { updatedAt: new Date().toISOString() } },
  );
}
