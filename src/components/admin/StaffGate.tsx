import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { canAccess, type Permission } from "@/lib/permissions";
import { getAdminSession } from "@/lib/server/adminSession";

// Server-side guard for one admin page. Signed-out visitors go to the admin login. Staff who do not
// hold the area go back to the dashboard home. Use inside a Suspense boundary, as the admin layout does.
export async function StaffGate({ permission, children }: { permission: Permission; children: ReactNode }) {
  await connection();
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canAccess(session, permission)) redirect("/admin");
  return children;
}
