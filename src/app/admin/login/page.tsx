import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminAuthPages";
import { hasAdminAccounts } from "@/lib/server/adminAccounts";
import { getAdminSession } from "@/lib/server/adminSession";

export const metadata: Metadata = {
  title: "Admin login | MEG Pakistan",
  robots: { index: false, follow: false },
};

// Already-signed-in admins go straight to the dashboard.
async function LoginGate() {
  await connection();
  if (await getAdminSession()) redirect("/admin");
  const signupOpen = !(await hasAdminAccounts());
  return <AdminLoginForm showSignupLink={signupOpen} />;
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-zinc-950" />}>
      <LoginGate />
    </Suspense>
  );
}
