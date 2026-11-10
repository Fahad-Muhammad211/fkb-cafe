import { canAccess, type Permission } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";

// Server-side role check for admin API routes. Every admin route calls this before it reads or
// changes anything, so a manager cannot reach an area they were not given.

export type StaffCheck = { ok: true; session: StaffSession } | { ok: false; status: 401 | 403; error: string };

export async function checkStaff(permission: Permission): Promise<StaffCheck> {
  const session = await getAdminSession();
  if (!session) return { ok: false, status: 401, error: "Please log in as an admin." };
  if (!canAccess(session, permission)) return { ok: false, status: 403, error: "Your role does not include this area." };
  return { ok: true, session };
}
