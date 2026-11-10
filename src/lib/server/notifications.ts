import type { Document } from "@/lib/server/collections";
import { ORDER_STEPS } from "@/lib/orderStatus";
import { getCollection } from "@/lib/server/collections";
import { listOrdersForUser } from "@/lib/server/orders";
import type { CustomerNotification } from "@/types/customer";

// Order notifications come from each order's own history, so they always match the order's status.
// The only thing stored here is when the customer last opened the notifications page.

const customersCollection = () => getCollection<{ _id: string; notificationsReadAt?: string } & Document>("customers");

const MAX_NOTIFICATIONS = 50;

function describeEvent(event: { event: string; step?: number }): { title: string; message: string } {
  switch (event.event) {
    case "placed":
      return { title: "Order placed", message: "Your order was placed and is waiting for confirmation." };
    case "confirmed":
      return { title: "Order confirmed", message: "The restaurant confirmed your order." };
    case "cancelled":
      return { title: "Order cancelled", message: "This order was cancelled." };
    default: {
      const step = event.step ?? 0;
      const label = ORDER_STEPS[step] ?? ORDER_STEPS[0];
      return { title: `Order: ${label}`, message: `Your order is now at the "${label}" step.` };
    }
  }
}

export async function listNotifications(userId: string): Promise<{ items: CustomerNotification[]; unreadCount: number }> {
  const [orders, customer] = await Promise.all([
    listOrdersForUser(userId),
    (await customersCollection()).findOne({ _id: userId }, { projection: { notificationsReadAt: 1 } }),
  ]);
  const readAt = customer?.notificationsReadAt ? Date.parse(customer.notificationsReadAt) : 0;

  const items: CustomerNotification[] = [];
  for (const order of orders) {
    for (const event of order.history ?? []) {
      const { title, message } = describeEvent(event);
      items.push({
        id: `${order.id}-${event.event}-${event.step ?? ""}-${event.at}`,
        orderId: order.id,
        title,
        message,
        at: event.at,
        unread: Date.parse(event.at) > readAt,
      });
    }
  }
  items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const limited = items.slice(0, MAX_NOTIFICATIONS);
  return { items: limited, unreadCount: items.filter((n) => n.unread).length };
}

export async function markNotificationsRead(userId: string): Promise<void> {
  await (await customersCollection()).updateOne({ _id: userId }, { $set: { notificationsReadAt: new Date().toISOString() } });
}
