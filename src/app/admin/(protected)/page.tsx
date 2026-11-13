import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AnalyticsView } from "@/components/admin/AnalyticsView";
import { StaffHome } from "@/components/admin/StaffHome";
import { canAccess } from "@/lib/permissions";
import { getAdminSession } from "@/lib/server/adminSession";

// Owners see the finance dashboard. Managers see a home page with only their own areas.
async function HomeByRole() {
  await connection();
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (canAccess(session, "finance")) return <AnalyticsView />;
  return <StaffHome name={session.name} role={session.role} responsibilities={session.responsibilities} />;
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading dashboard…</p>}>
      <HomeByRole />
    </Suspense>
  );
}
