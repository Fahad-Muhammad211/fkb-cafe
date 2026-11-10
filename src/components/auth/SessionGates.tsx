"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminLoginForm, AdminSignupClosed, AdminSignupForm } from "@/components/admin/AdminAuthPages";
import { getAdminSession, getAdminSetupStatus, getCustomerSession, type AdminSetupStatus, type StaffSession } from "@/lib/sessionClient";
import { Checking, useSession } from "@/lib/useSession";
import { homeForRole } from "@/lib/permissions";
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

// Guard for the admin area. Signed-out visitors go to the admin login; a signed-in Owner goes to the
// Owner dashboard. This only decides what to render: every admin API checks the role on the server too.
export function AdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const isAdmin = status.state === "ready" && status.value.role === "admin";

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
    else if (status.state === "ready" && status.value.role !== "admin") router.replace(homeForRole(status.value.role));
  }, [status, router]);

  if (status.state !== "ready" || !isAdmin) return <Checking text="Checking admin session…" />;
  const session = status.value;
  return (
    <AdminShell session={{ name: session.name, role: session.role }}>{children}</AdminShell>
  );
}

// Setup status as the sign-up pages need it. If the server cannot answer, setup is treated as closed.
const CLOSED_STATUS: AdminSetupStatus = { adminExists: true, open: false, keyConfigured: false };
const loadSetupStatus = () => getAdminSetupStatus().catch(() => CLOSED_STATUS);

// /admin/login (and /admin/signup, which opens on the Sign Up view). Signed-in accounts go to their
// dashboard. Signed-out visitors see Login by default and can switch to Sign Up and back. The Sign Up
// view shows the form only while first-Admin signup is open (no Admin yet and ADMIN_SETUP_KEY configured
// on the server); otherwise it says signup is closed. The server enforces the same rule on every request.
export function AdminAuthGate({ initialView = "login" }: { initialView?: "login" | "signup" }) {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const [setup, setSetup] = useState<AdminSetupStatus | null>(null);
  const [view, setView] = useState(initialView);

  useEffect(() => {
    if (status.state === "ready") router.replace(homeForRole(status.value.role));
    if (status.state === "signedOut") void loadSetupStatus().then(setSetup);
  }, [status, router]);

  if (status.state !== "signedOut" || setup === null) return <div className="min-h-dvh bg-zinc-950" />;
  const showLogin = () => setView("login");
  if (view === "login") return <AdminLoginForm onSignUp={() => setView("signup")} />;
  if (setup.open) return <AdminSignupForm onLogin={showLogin} />;
  return <AdminSignupClosed reason={setup.adminExists ? "adminExists" : "notConfigured"} onLogin={showLogin} />;
}
