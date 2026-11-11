"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminLoginForm, AdminSignupForm } from "@/components/admin/AdminAuthPages";
import { getAdminSession, getCustomerSession, type StaffSession } from "@/lib/sessionClient";
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

// /admin/login (and /admin/signup, which opens on the Sign Up view). Both views are always available.
//  - Signed-out visitors see Login by default and can switch to Sign Up and back. Sign Up is open to
//    anyone, whether or not an Admin already exists; each sign-up creates a new Admin and signs them in.
//  - A signed-in Admin who opens /admin/signup gets the form for creating another Admin (they stay signed in).
//  - Any other signed-in account (and a signed-in Admin on /admin/login) goes to its dashboard.
export function AdminAuthGate({ initialView = "login" }: { initialView?: "login" | "signup" }) {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const [view, setView] = useState(initialView);
  const adminAddsAdmin = status.state === "ready" && status.value.role === "admin" && initialView === "signup";

  useEffect(() => {
    if (status.state === "ready" && !adminAddsAdmin) router.replace(homeForRole(status.value.role));
  }, [status, router, adminAddsAdmin]);

  if (adminAddsAdmin) return <AdminSignupForm mode="additional" />;
  if (status.state !== "signedOut") return <div className="min-h-dvh bg-zinc-950" />;
  if (view === "login") return <AdminLoginForm onSignUp={() => setView("signup")} />;
  return <AdminSignupForm onLogin={() => setView("login")} />;
}
