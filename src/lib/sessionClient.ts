import type { StaffSession } from "@/lib/server/adminSession";
import type { AuthUser } from "@/types";

export type { StaffSession };

// Browser helpers that ask the server who is signed in. Sessions live on the server (MongoDB, behind an
// httpOnly cookie), so the browser keeps no account or session data of its own. A failed request
// throws, and useSession treats that as signed out.

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return (await res.json()) as T;
}

// The signed-in staff member (admin area), or null.
export async function getAdminSession(): Promise<StaffSession | null> {
  return (await getJson<{ session?: StaffSession | null }>("/api/admin/session")).session ?? null;
}

// The signed-in customer, or null.
export async function getCustomerSession(): Promise<AuthUser | null> {
  return (await getJson<{ user?: AuthUser | null }>("/api/customer/profile")).user ?? null;
}

export type AdminSetupStatus = { adminExists: boolean; open: boolean; keyConfigured: boolean };

// Whether first-Admin setup is open (no Admin yet and the server has ADMIN_SETUP_KEY set).
export async function getAdminSetupStatus(): Promise<AdminSetupStatus> {
  return getJson<AdminSetupStatus>("/api/admin/setup");
}
