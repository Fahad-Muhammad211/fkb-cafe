// Staff roles and what each one may do. Shared by the server (route and page checks) and the browser
// (which sections to show). The server is the one that enforces these rules; the browser only hides links.

// Areas a manager can be given. Owners always have every area.
export const RESPONSIBILITIES = ["orders", "menu", "customers"] as const;
export type Responsibility = (typeof RESPONSIBILITIES)[number];

export const RESPONSIBILITY_LABELS: Record<Responsibility, string> = {
  orders: "Orders",
  menu: "Menu and products",
  customers: "Customers",
};

export const STAFF_ROLES = ["owner", "manager"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// Roles the owner can give a new staff account from the Employees form. The owner role is never listed here.
// To allow another role later (for example an admin), add it to this list with its label. The form dropdown
// and the server check both read this list, so nothing else needs to change for the choice itself.
export const ASSIGNABLE_ROLES: readonly { value: StaffRole; label: string }[] = [{ value: "manager", label: "Manager" }];

export function parseAssignableRole(value: unknown): StaffRole | null {
  return ASSIGNABLE_ROLES.find((role) => role.value === value)?.value ?? null;
}

// The owner no longer picks areas when adding a manager, so a new manager gets all of them.
// Managers saved before this change keep the areas on their record.
export const DEFAULT_MANAGER_RESPONSIBILITIES: Responsibility[] = [...RESPONSIBILITIES];

// A manager needs at least one responsibility, and each one must be a known area with no repeats.
export function parseResponsibilities(value: unknown): Responsibility[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const known = new Set<string>(RESPONSIBILITIES);
  const unique = [...new Set(value)];
  if (unique.length !== value.length) return null;
  if (!unique.every((item): item is Responsibility => typeof item === "string" && known.has(item))) return null;
  return RESPONSIBILITIES.filter((r) => unique.includes(r));
}

// finance and staff are owner-only and cannot be delegated to a manager.
// home is the staff landing page, which every signed-in staff member can open.
export type Permission = Responsibility | "finance" | "staff" | "home";

export interface StaffAccess {
  role: StaffRole;
  responsibilities: Responsibility[];
}

export function canAccess(access: StaffAccess, permission: Permission): boolean {
  if (access.role === "owner" || permission === "home") return true;
  if (permission === "finance" || permission === "staff") return false;
  return access.responsibilities.includes(permission);
}

// The sections a staff member can open, in the order the sidebar shows them.
export const SECTIONS: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Dashboard", permission: "home" },
  { href: "/admin/orders", label: "Orders", permission: "orders" },
  { href: "/admin/customers", label: "Customers", permission: "customers" },
  { href: "/admin/products", label: "Products", permission: "menu" },
  { href: "/admin/analytics", label: "Analytics", permission: "finance" },
  { href: "/admin/employees", label: "Employees", permission: "staff" },
  { href: "/admin/offices", label: "Offices", permission: "staff" },
  { href: "/admin/restaurants", label: "Restaurants", permission: "staff" },
];
