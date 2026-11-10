import { EmployeesGate } from "@/components/admin/EmployeesGate";

// Owner only. Managers are sent back to the dashboard home.
// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminEmployeesPage() {
  return <EmployeesGate />;
}
