import { Suspense } from "react";
import { StaffGate } from "@/components/admin/StaffGate";
import { AnalyticsReports } from "@/components/admin/AnalyticsReports";

export default function AdminAnalyticsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <StaffGate permission="finance">
        <AnalyticsReports />
      </StaffGate>
    </Suspense>
  );
}
