import { getAdminSession } from "@/lib/server/adminSession";
import { getCustomerSession } from "@/lib/server/customerSession";
import type { OrderActor } from "@/lib/server/orders";

// Who is calling: an admin, a signed-in customer, or nobody (null).
export async function currentActor(): Promise<OrderActor | null> {
  if (await getAdminSession()) return { admin: true };
  const customer = await getCustomerSession();
  return customer ? { userId: customer.id } : null;
}
