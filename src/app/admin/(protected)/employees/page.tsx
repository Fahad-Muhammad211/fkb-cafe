import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { EmployeesView } from "@/components/admin/EmployeesView";
import { canAccess } from "@/lib/permissions";
import { getAdminSession } from "@/lib/server/adminSession";

// Owner only. Managers are sent back to the dashboard home.
async function EmployeesGate() {
  await connection();
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (!canAccess(session, "staff")) redirect("/admin");
  return <EmployeesView currentId={session.id} />;
}

export default function AdminEmployeesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading staff…</p>}>
      <EmployeesGate />
    </Suspense>
  );
}
