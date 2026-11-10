// Job roles for the staff who work under a manager (for example a cashier or a cook). These describe
// the job only; they do not give access to the admin dashboard. Admin access is set by the manager
// role and responsibilities in lib/permissions.ts.

export const STAFF_JOB_ROLES = ["Cashier", "Cook", "Server", "Delivery rider", "Cleaner"] as const;
export type StaffJobRole = (typeof STAFF_JOB_ROLES)[number];

export function parseJobRole(value: unknown): StaffJobRole | null {
  return typeof value === "string" && (STAFF_JOB_ROLES as readonly string[]).includes(value) ? (value as StaffJobRole) : null;
}
