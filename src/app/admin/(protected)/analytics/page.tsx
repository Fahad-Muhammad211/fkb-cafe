import { Suspense } from "react";
import { StaffGate } from "@/components/admin/StaffGate";
import { AnalyticsReports } from "@/components/admin/AnalyticsReports";

// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminAnalyticsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <StaffGate permission="finance">
        <AnalyticsReports />
      </StaffGate>
    </Suspense>
  );
}
