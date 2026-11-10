import type { StaffAccess } from "@/lib/permissions";
import { findAdminAccount } from "@/lib/server/adminAccounts";
import { endSession, readSession, startSession } from "@/lib/server/session";

// Sign-in helpers for admins and staff. The session lives in MongoDB behind an httpOnly cookie.

export async function startAdminSession(accountId: string) {
  await startSession("admin", accountId);
}

export async function endAdminSession() {
  await endSession("admin");
}

export type StaffSession = { id: string; name: string; email: string } & StaffAccess;

// Returns the signed-in staff member, or null. The account is read on every call, so a role change
// applies at once and a switched-off account loses access straight away.
export async function getAdminSession(): Promise<StaffSession | null> {
  const accountId = await readSession("admin");
  if (!accountId) return null;
  const account = await findAdminAccount(accountId);
  if (!account) {
    // The account was deleted: drop the saved session so it cannot be used again.
    await endSession("admin");
    return null;
  }
  if (!account.active) return null;
  return { id: account.id, name: account.name, email: account.email, role: account.role };
}
