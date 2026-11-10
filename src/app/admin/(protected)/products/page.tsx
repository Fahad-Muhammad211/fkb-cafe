import { Suspense } from "react";
import { StaffGate } from "@/components/admin/StaffGate";
import { ProductsView } from "@/components/admin/ProductsView";

// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminProductsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <StaffGate permission="menu">
        <ProductsView />
      </StaffGate>
    </Suspense>
  );
}
