import type { Metadata } from "next";
import { AdminAuthGate } from "@/components/auth/SessionGates";

export const metadata: Metadata = {
  title: "Admin login | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Login by default, with an always-available Sign Up view. Signed-in accounts go straight to their dashboard.
export default function AdminLoginPage() {
  return <AdminAuthGate />;
}
