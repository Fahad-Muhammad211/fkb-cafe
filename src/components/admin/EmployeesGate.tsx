"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { EmployeesView } from "@/components/admin/EmployeesView";
import { canAccess } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";
import { useSession } from "@/lib/local/useSession";

// Owner only. Managers are sent back to the dashboard home.
export function EmployeesGate() {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const allowed = status.state === "ready" && canAccess(status.value, "staff");

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
    else if (status.state === "ready" && !allowed) router.replace("/admin");
  }, [status.state, allowed, router]);

  if (status.state !== "ready") return <p className="text-sm text-zinc-400">Loading staff…</p>;
  if (!allowed) return null;
  return <EmployeesView currentId={status.value.id} />;
}
