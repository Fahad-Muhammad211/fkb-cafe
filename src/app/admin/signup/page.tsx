import type { Metadata } from "next";
import { AdminAuthGate } from "@/components/auth/SessionGates";

export const metadata: Metadata = {
  title: "Create admin account | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Same screen as /admin/login, opened on the Sign Up view. Once the first Admin exists, sign-up stays
// closed for everyone; Owners are added by the Admin from Employees.
export default function AdminSignupPage() {
  return <AdminAuthGate initialView="signup" />;
}
