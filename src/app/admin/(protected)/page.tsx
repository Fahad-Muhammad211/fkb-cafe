import { AdminHomeGate } from "@/components/admin/AdminHomeGate";

// Owners see the finance dashboard. Managers see a home page with only their own areas.
// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminDashboardPage() {
  return <AdminHomeGate />;
}
