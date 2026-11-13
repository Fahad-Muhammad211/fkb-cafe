import { Suspense } from "react";
import { StaffGate } from "@/components/admin/StaffGate";
import { ProductsView } from "@/components/admin/ProductsView";

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <StaffGate permission="menu">
        <ProductsView />
      </StaffGate>
    </Suspense>
  );
}
