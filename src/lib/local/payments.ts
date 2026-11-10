import type { Document } from "@/lib/local/collections";
import { getCollection } from "@/lib/local/collections";
import type { PaymentStatus } from "@/types";
import type { PaymentRecord } from "@/types/customer";

// Payment records written when an order is placed (see lib/local/orders.ts). Only records for the
// customer's own orders are returned.

type PaymentDoc = { _id: string; orderId: string; amount: number; method: "cod"; status: PaymentStatus; createdAt: string };

const paymentsCollection = () => getCollection<PaymentDoc>("payments");
const ordersCollection = () =>
  getCollection<{ _id: string; userId?: string; status?: PaymentRecord["orderStatus"] } & Document>("orders");

export async function listPaymentsForUser(userId: string): Promise<PaymentRecord[]> {
  const orders = await (await ordersCollection())
    .find({ userId }, { projection: { _id: 1, status: 1 } })
    .limit(500)
    .toArray();
  if (orders.length === 0) return [];

  const orderStatus = new Map(orders.map((o) => [o._id, o.status ?? "pending"]));
  const docs = await (await paymentsCollection())
    .find({ orderId: { $in: [...orderStatus.keys()] } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  return docs.map((doc) => ({
    id: doc._id,
    orderId: doc.orderId,
    amount: doc.amount,
    method: doc.method,
    status: doc.status,
    orderStatus: orderStatus.get(doc.orderId) ?? "pending",
    createdAt: doc.createdAt,
  }));
}
