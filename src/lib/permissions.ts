// Staff roles and the Admin dashboard sections. Shared by the data handlers (route and page checks) and
// the browser (which sections to show).
//
// "admin" is the account created by the one-time first-Admin setup. Only the Admin may open the Admin
// dashboard (/admin) and its APIs. "owner" and "manager" accounts belong to one restaurant and work in
// the restaurant dashboard (/owner), limited to that restaurant (see lib/server/ownerAccess.ts). The
// Admin creates both from the Employees page. Accounts saved with the old pre-restaurant "manager" role
// are still read as owners; see roleOf in lib/server/adminAccounts.ts.

export const STAFF_ROLES = ["admin", "owner", "manager"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// Dashboard areas, used to label each section and its guard.
export type Permission = "orders" | "menu" | "customers" | "finance" | "staff" | "home";

export interface StaffAccess {
  role: StaffRole;
}

// Every Admin dashboard section is Admin-only. The section is still passed by every guard so a finer
// split can be added later without touching the callers.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function canAccess(access: StaffAccess, _permission: Permission): boolean {
  return access.role === "admin";
}

// Where a signed-in staff account belongs: the Admin dashboard, or the restaurant dashboard for Owners
// and Managers.
export const homeForRole = (role: StaffRole): "/admin" | "/owner" => (role === "admin" ? "/admin" : "/owner");

// The sections the Admin can open, in the order the sidebar shows them.
export const SECTIONS: { href: string; label: string; permission: Permission }[] = [
  { href: "/admin", label: "Dashboard", permission: "home" },
  { href: "/admin/orders", label: "Orders", permission: "orders" },
  { href: "/admin/customers", label: "Customers", permission: "customers" },
  { href: "/admin/products", label: "Products", permission: "menu" },
  { href: "/admin/analytics", label: "Analytics", permission: "finance" },
  { href: "/admin/employees", label: "Employees", permission: "staff" },
  { href: "/admin/restaurants", label: "Restaurants", permission: "staff" },
];
