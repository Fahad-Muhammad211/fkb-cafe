import type { Metadata } from "next";
import { AdminLoginGate } from "@/components/auth/SessionGates";

export const metadata: Metadata = {
  title: "Admin login | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Signed-in admins go straight to the dashboard.
export default function AdminLoginPage() {
  return <AdminLoginGate />;
}
