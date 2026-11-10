import type { StaffAccess } from "@/lib/permissions";
import { findAdminAccount } from "@/lib/local/adminAccounts";
import { endSession, readSession, startSession } from "@/lib/local/session";

// Sign-in helpers for admins and staff in this browser.

export async function startAdminSession(accountId: string) {
  startSession("admin", accountId);
}

export async function endAdminSession() {
  endSession("admin");
}

export type StaffSession = { id: string; name: string; email: string } & StaffAccess;

// Returns the signed-in staff member, or null. The account is read on every call, so a role change
// applies at once and a switched-off account loses access straight away.
export async function getAdminSession(): Promise<StaffSession | null> {
  const accountId = readSession("admin");
  if (!accountId) return null;
  const account = await findAdminAccount(accountId);
  if (!account || !account.active) return null;
  return { id: account.id, name: account.name, email: account.email, role: account.role, responsibilities: account.responsibilities };
}
