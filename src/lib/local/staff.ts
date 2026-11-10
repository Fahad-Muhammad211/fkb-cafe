import { canAccess, type Permission } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";

// Sign-in check for admin API routes. Every admin route calls this before it reads or changes
// anything, so only a signed-in, active owner can reach the admin data.

export type StaffCheck = { ok: true; session: StaffSession } | { ok: false; status: 401 | 403; error: string };

export async function checkStaff(permission: Permission): Promise<StaffCheck> {
  const session = await getAdminSession();
  if (!session) return { ok: false, status: 401, error: "Please log in as an admin." };
  if (!canAccess(session, permission)) return { ok: false, status: 403, error: "Your role does not include this area." };
  return { ok: true, session };
}
