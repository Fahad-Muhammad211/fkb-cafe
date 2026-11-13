import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminSession } from "@/lib/server/adminSession";

export const metadata: Metadata = {
  title: "Admin | MEG Pakistan",
  robots: { index: false, follow: false },
};

// Server-side guard: signed-out requests never reach the dashboard pages.
async function AdminGuard({ children }: { children: ReactNode }) {
  // The admin area is per-visitor and time-sensitive, so render it at request time.
  await connection();
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return <AdminShell session={{ name: session.name, role: session.role, responsibilities: session.responsibilities }}>{children}</AdminShell>;
}

export default function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-sm text-zinc-400">Checking admin session…</div>}>
      <AdminGuard>{children}</AdminGuard>
    </Suspense>
  );
}
