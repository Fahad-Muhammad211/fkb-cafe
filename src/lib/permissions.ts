// Staff roles and the Admin dashboard sections. Shared by the data handlers (route and page checks) and
// the browser (which sections to show).
//
// "admin" accounts are created by Admin sign-up at /admin/login. The Admin is the cafe's Owner and has
// full access to the Admin dashboard (/admin). "cafe_manager" accounts are added by the Admin from the
// Employees page and get the operational areas only (tables, takeaway, orders, stock, waiters).
// "owner" and "manager" accounts belong to one restaurant and work in the restaurant dashboard (/owner),
// limited to that restaurant (see lib/server/ownerAccess.ts). Accounts saved with the old
// pre-restaurant "manager" role are still read as owners; see roleOf in lib/server/adminAccounts.ts.

export const STAFF_ROLES = ["admin", "owner", "manager", "cafe_manager"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// Dashboard areas, used to label each section and its guard.
export type Permission = "orders" | "menu" | "customers" | "finance" | "staff" | "home" | "cafe" | "stock" | "waiters";

export interface StaffAccess {
  role: StaffRole;
}

// Day-to-day areas a cafe Manager may use. Money overviews, menu prices, customers, employees and
// salaries stay with the Owner.
const OPERATIONAL: ReadonlySet<Permission> = new Set<Permission>(["cafe", "orders", "stock", "waiters"]);

export function canAccess(access: StaffAccess, permission: Permission): boolean {
  if (access.role === "admin") return true;
  if (access.role === "cafe_manager") return OPERATIONAL.has(permission);
  return false;
}

// Roles that work in the Admin dashboard (/admin).
export const usesAdminDashboard = (role: StaffRole) => role === "admin" || role === "cafe_manager";

// Where a signed-in staff account belongs: the Admin dashboard for the Owner, the tables screen for a
// cafe Manager, or the restaurant dashboard for restaurant Owners and Managers.
export type StaffHome = "/admin" | "/admin/cafe" | "/owner";
export const homeForRole = (role: StaffRole): StaffHome => (role === "admin" ? "/admin" : role === "cafe_manager" ? "/admin/cafe" : "/owner");

export const ROLE_LABELS: Record<StaffRole, string> = { admin: "Owner", owner: "Restaurant owner", manager: "Restaurant manager", cafe_manager: "Manager" };

// The sections the Admin can open, in the order the sidebar shows them.
export const SECTIONS: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Dashboard", permission: "home" },
  { href: "/admin/cafe", label: "Cafe", permission: "cafe" },
  { href: "/admin/takeaway", label: "Takeaway", permission: "cafe" },
  { href: "/admin/stock", label: "Stock", permission: "stock" },
  { href: "/admin/waiters", label: "Waiter Performance", permission: "waiters" },
  { href: "/admin/orders", label: "Orders", permission: "orders" },
  { href: "/admin/customers", label: "Customers", permission: "customers" },
  { href: "/admin/products", label: "Products", permission: "menu" },
  { href: "/admin/analytics", label: "Analytics", permission: "finance" },
  { href: "/admin/employees", label: "Employees", permission: "staff" },
  { href: "/admin/restaurants", label: "Restaurants", permission: "staff" },
];
