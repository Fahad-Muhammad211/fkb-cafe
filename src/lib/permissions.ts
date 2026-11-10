// Staff role and the dashboard sections. Shared by the data handlers (route and page checks) and the
// browser (which sections to show).
//
// There is one role: owner. Every owner account has access to every section. Accounts saved with the
// old "manager" role are read as owners (see lib/local/adminAccounts.ts).

export const STAFF_ROLES = ["owner"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// Dashboard areas, used to label each section and its guard.
export type Permission = "orders" | "menu" | "customers" | "finance" | "staff" | "home";

export interface StaffAccess {
  role: StaffRole;
}

// The section is still passed by every guard, but with a single role it does not change the answer.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function canAccess(access: StaffAccess, _permission: Permission): boolean {
  return access.role === "owner";
}

// The sections an owner can open, in the order the sidebar shows them.
export const SECTIONS: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Dashboard", permission: "home" },
  { href: "/admin/orders", label: "Orders", permission: "orders" },
  { href: "/admin/customers", label: "Customers", permission: "customers" },
  { href: "/admin/products", label: "Products", permission: "menu" },
  { href: "/admin/analytics", label: "Analytics", permission: "finance" },
  { href: "/admin/employees", label: "Employees", permission: "staff" },
  { href: "/admin/restaurants", label: "Restaurants", permission: "staff" },
];
