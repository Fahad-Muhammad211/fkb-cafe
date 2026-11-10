import type { Metadata } from "next";
import { AdminSignupGate } from "@/components/auth/SessionGates";

export const metadata: Metadata = {
  title: "Create admin account | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Once the first admin exists, this page stays closed for everyone else. Further admins are created
// by a signed-in admin.
export default function AdminSignupPage() {
  return <AdminSignupGate />;
}
