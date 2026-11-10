"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminLoginForm, AdminSignupClosed, AdminSignupForm } from "@/components/admin/AdminAuthPages";
import { hasAdminAccounts } from "@/lib/local/adminAccounts";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";
import { getCustomerSession } from "@/lib/local/customerSession";
import { Checking, useSession } from "@/lib/local/useSession";
import type { AuthUser } from "@/types";

// Guard for every /account page. Signed-out visitors go to the customer login.
export function CustomerGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useSession<AuthUser>(getCustomerSession);

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/login");
  }, [status.state, router]);

  if (status.state !== "ready") return <Checking text="Checking your session…" />;
  return <CustomerShell>{children}</CustomerShell>;
}

// Guard for the admin area. Signed-out visitors go to the admin login.
export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
  }, [status.state, router]);

  if (status.state !== "ready") return <Checking text="Checking admin session…" />;
  const session = status.value;
  return (
    <AdminShell session={{ name: session.name, role: session.role }}>{children}</AdminShell>
  );
}

// Admin login. Signed-in admins go straight to the dashboard. The sign-up link shows only while no admin exists.
export function AdminLoginGate() {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const [signupOpen, setSignupOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (status.state === "ready") router.replace("/admin");
    if (status.state === "signedOut") void hasAdminAccounts().then((exists) => setSignupOpen(!exists));
  }, [status.state, router]);

  if (status.state !== "signedOut" || signupOpen === null) return <div className="min-h-dvh bg-zinc-950" />;
  return <AdminLoginForm showSignupLink={signupOpen} />;
}

// Admin sign-up. Closed once the first admin exists; further staff are added by the owner.
export function AdminSignupGate() {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const [closed, setClosed] = useState<boolean | null>(null);

  useEffect(() => {
    if (status.state === "ready") router.replace("/admin");
    if (status.state === "signedOut") void hasAdminAccounts().then(setClosed);
  }, [status.state, router]);

  if (status.state !== "signedOut" || closed === null) return <div className="min-h-dvh bg-zinc-950" />;
  return closed ? <AdminSignupClosed /> : <AdminSignupForm />;
}
