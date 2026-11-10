import { getCollection } from "@/lib/server/collections";
import type { Coupon } from "@/types/customer";

// Coupons are read from the coupons collection. Nothing is seeded: until a coupon is added to the
// store, the offers page shows an empty state. Checkout does not apply coupons yet.

type CouponDoc = Omit<Coupon, "id"> & { _id: string; active: boolean; createdAt: string };

const couponsCollection = () => getCollection<CouponDoc>("coupons");

export async function listActiveCoupons(): Promise<Coupon[]> {
  const now = new Date().toISOString();
  const docs = await (await couponsCollection())
    .find({ active: true, $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  return docs.map((doc) => ({
    id: doc._id,
    code: doc.code,
    title: doc.title,
    description: doc.description,
    percentOff: doc.percentOff ?? null,
    amountOff: doc.amountOff ?? null,
    expiresAt: doc.expiresAt ?? null,
  }));
}
