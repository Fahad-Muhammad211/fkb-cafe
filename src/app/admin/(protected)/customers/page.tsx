import { Suspense } from "react";
import { StaffGate } from "@/components/admin/StaffGate";
import { CustomersView } from "@/components/admin/CustomersView";

export default function AdminCustomersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <StaffGate permission="customers">
        <CustomersView />
      </StaffGate>
    </Suspense>
  );
}
