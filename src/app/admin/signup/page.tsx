import type { Metadata } from "next";
import { AdminAuthGate } from "@/components/auth/SessionGates";

export const metadata: Metadata = {
  title: "Create admin account | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Same screen as /admin/login, opened on the Sign Up view. Admin sign-up is always open; Owners and
// Managers are added by an Admin from Employees.
export default function AdminSignupPage() {
  return <AdminAuthGate initialView="signup" />;
}
