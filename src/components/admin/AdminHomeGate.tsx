"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardView } from "@/components/admin/DashboardView";
import { canAccess, homeForRole } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/sessionClient";
import { useSession } from "@/lib/useSession";

// The Owner sees the business dashboard. A Manager (operational access) goes to the tables screen.
// Signed-out visitors go to the admin login.
export function AdminHomeGate() {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const allowed = status.state === "ready" && canAccess(status.value, "home");

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
    else if (status.state === "ready" && !allowed) router.replace(homeForRole(status.value.role));
  }, [status, allowed, router]);

  if (!allowed) return <p className="text-sm text-zinc-400">Loading dashboard…</p>;
  return <DashboardView />;
}
