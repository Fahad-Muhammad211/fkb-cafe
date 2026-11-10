import { Suspense } from "react";
import { StaffGate } from "@/components/admin/StaffGate";
import { CustomersView } from "@/components/admin/CustomersView";

// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminCustomersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <StaffGate permission="customers">
        <CustomersView />
      </StaffGate>
    </Suspense>
  );
}
