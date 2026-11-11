import { Suspense } from "react";
import { StaffGate } from "@/components/admin/StaffGate";
import { CafeView } from "@/components/admin/cafe/CafeView";

// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminCafePage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <StaffGate permission="cafe">
        <CafeView />
      </StaffGate>
    </Suspense>
  );
}
