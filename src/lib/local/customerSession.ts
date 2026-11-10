import { findCustomer } from "@/lib/local/customers";
import { endSession, readSession, startSession } from "@/lib/local/session";
import type { AuthUser } from "@/types";

// Sign-in helpers for customers in this browser.

export function startCustomerSession(userId: string) {
  startSession("customer", userId);
}

export function endCustomerSession() {
  endSession("customer");
}

// Returns the signed-in customer, or null. Checks the account still exists on every call.
export async function getCustomerSession(): Promise<AuthUser | null> {
  const userId = readSession("customer");
  if (!userId) return null;
  const user = await findCustomer(userId);
  if (!user) endSession("customer");
  return user;
}
