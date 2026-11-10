"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnalyticsView } from "@/components/admin/AnalyticsView";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";
import { useSession } from "@/lib/local/useSession";

// Owners see the finance dashboard. Signed-out visitors go to the admin login.
export function AdminHomeGate() {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
  }, [status.state, router]);

  if (status.state !== "ready") return <p className="text-sm text-zinc-400">Loading dashboard…</p>;
  return <AnalyticsView />;
}
