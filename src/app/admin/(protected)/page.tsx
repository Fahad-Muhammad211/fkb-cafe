import { AdminHomeGate } from "@/components/admin/AdminHomeGate";

// Owners see the finance dashboard.
// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminDashboardPage() {
  return <AdminHomeGate />;
}
