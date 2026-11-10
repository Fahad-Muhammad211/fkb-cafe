import { EmployeesGate } from "@/components/admin/EmployeesGate";

// Owner page. Signed-out visitors go to the admin login.
// Session-dependent admin page; see the note in (protected)/layout.tsx.
export const instant = false;

export default function AdminEmployeesPage() {
  return <EmployeesGate />;
}
