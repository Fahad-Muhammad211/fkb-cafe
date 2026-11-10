import { getAdminSession } from "@/lib/local/adminSession";
import { getCustomerSession } from "@/lib/local/customerSession";
import type { OrderActor } from "@/lib/local/orders";

// Who is calling: an admin, a signed-in customer, or nobody (null).
export async function currentActor(): Promise<OrderActor | null> {
  if (await getAdminSession()) return { admin: true };
  const customer = await getCustomerSession();
  return customer ? { userId: customer.id } : null;
}
