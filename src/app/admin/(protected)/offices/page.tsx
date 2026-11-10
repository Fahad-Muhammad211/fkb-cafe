import { OfficesGate } from "@/components/admin/OfficesView";

// Owner page. Owners added from the Employees page are assigned to the offices created here.
// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminOfficesPage() {
  return <OfficesGate />;
}
