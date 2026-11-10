"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnalyticsView } from "@/components/admin/AnalyticsView";
import { StaffHome } from "@/components/admin/StaffHome";
import { canAccess } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";
import { useSession } from "@/lib/local/useSession";

// Owners see the finance dashboard. Managers see a home page with only their own areas.
export function AdminHomeGate() {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
  }, [status.state, router]);

  if (status.state !== "ready") return <p className="text-sm text-zinc-400">Loading dashboard…</p>;
  if (canAccess(status.value, "finance")) return <AnalyticsView />;
  return <StaffHome name={status.value.name} role={status.value.role} responsibilities={status.value.responsibilities} />;
}
