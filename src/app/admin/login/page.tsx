import type { Metadata } from "next";
import { AdminAuthGate } from "@/components/auth/SessionGates";

// Session-dependent (redirects signed-in staff); skip instant-navigation validation, see (protected)/layout.tsx.
export const instant = false;

export const metadata: Metadata = {
  title: "Admin login | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Login by default, with an always-available Sign Up view. Signed-in accounts go straight to their dashboard.
export default function AdminLoginPage() {
  return <AdminAuthGate />;
}
