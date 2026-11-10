import type { ReactNode } from "react";
import { OwnerGate } from "@/components/owner/OwnerShell";

// The Owner dashboard: only the signed-in owner of a restaurant, and only that restaurant.
export default function OwnerDashboardLayout({ children }: { children: ReactNode }) {
  return <OwnerGate>{children}</OwnerGate>;
}