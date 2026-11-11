import { Suspense } from "react";
import { StaffGate } from "@/components/admin/StaffGate";
import { StockView } from "@/components/admin/StockView";

// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminStockPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
      <StaffGate permission="stock">
        <StockView />
      </StaffGate>
    </Suspense>
  );
}
