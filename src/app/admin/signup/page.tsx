import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AdminSignupClosed, AdminSignupForm } from "@/components/admin/AdminAuthPages";
import { hasAdminAccounts } from "@/lib/server/adminAccounts";
import { getAdminSession } from "@/lib/server/adminSession";

export const metadata: Metadata = {
  title: "Create admin account | MEG Pakistan",
  robots: { index: false, follow: false },
};

// Already-signed-in admins go straight to the dashboard. Once the first admin exists, this page
// stays closed for everyone else. Further admins are created by a signed-in admin via the API.
async function SignupGate() {
  await connection();
  if (await getAdminSession()) redirect("/admin");
  if (await hasAdminAccounts()) return <AdminSignupClosed />;
  return <AdminSignupForm />;
}

export default function AdminSignupPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-zinc-950" />}>
      <SignupGate />
    </Suspense>
  );
}
