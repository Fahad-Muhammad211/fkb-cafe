import { findCustomer } from "@/lib/server/customers";
import { endSession, readSession, startSession } from "@/lib/server/session";
import type { AuthUser } from "@/types";

// Sign-in helpers for customers. The session lives in MongoDB behind an httpOnly cookie.

export async function startCustomerSession(userId: string) {
  await startSession("customer", userId);
}

export async function endCustomerSession() {
  await endSession("customer");
}

// Returns the signed-in customer, or null. Checks the account still exists on every call.
export async function getCustomerSession(): Promise<AuthUser | null> {
  const userId = await readSession("customer");
  if (!userId) return null;
  const user = await findCustomer(userId);
  if (!user) await endSession("customer");
  return user;
}
