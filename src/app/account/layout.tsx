import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { CustomerShell } from "@/components/customer/CustomerShell";
import { getCustomerSession } from "@/lib/server/customerSession";

export const metadata: Metadata = {
  title: "My account | MEG Pakistan",
  robots: { index: false, follow: false },
};

// Server-side guard for every /account page. Signed-out visitors never receive the dashboard HTML.
// Each API the pages call checks the session again and only returns that customer's data.
async function AccountGuard({ children }: { children: ReactNode }) {
  // Session cookies are per visitor, so the dashboard is rendered at request time.
  await connection();
  if (!(await getCustomerSession())) redirect("/login");
  return <CustomerShell>{children}</CustomerShell>;
}

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-sm text-zinc-400">Checking your session…</div>}>
      <AccountGuard>{children}</AccountGuard>
    </Suspense>
  );
}
