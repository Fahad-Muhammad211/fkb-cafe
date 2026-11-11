import { Suspense } from "react";
import { StaffGate } from "@/components/admin/StaffGate";
import { TakeawayView } from "@/components/admin/cafe/TakeawayView";

// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminTakeawayPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <StaffGate permission="cafe">
        <TakeawayView />
      </StaffGate>
    </Suspense>
  );
}
