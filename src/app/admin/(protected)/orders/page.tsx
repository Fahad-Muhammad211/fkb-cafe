import { Suspense } from "react";
import { StaffGate } from "@/components/admin/StaffGate";
import { OrdersView } from "@/components/admin/OrdersView";

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <StaffGate permission="orders">
        <OrdersView />
      </StaffGate>
    </Suspense>
  );
}
