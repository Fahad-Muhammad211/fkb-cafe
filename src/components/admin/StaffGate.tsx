"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { canAccess, type Permission } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";
import { Checking, useSession } from "@/lib/local/useSession";

// Guard for one admin page. Signed-out visitors go to the admin login. Staff who do not hold the
// area go back to the dashboard home.
export function StaffGate({ permission, children }: { permission: Permission; children: ReactNode }) {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const allowed = status.state === "ready" && canAccess(status.value, permission);

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
    else if (status.state === "ready" && !allowed) router.replace("/admin");
  }, [status.state, allowed, router]);

  if (!allowed) return <Checking text="Checking admin session…" />;
  return <>{children}</>;
}
