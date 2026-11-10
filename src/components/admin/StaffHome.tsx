import Link from "next/link";
import { ArrowRight, ClipboardList, UtensilsCrossed, Users, type LucideIcon } from "lucide-react";
import { RESPONSIBILITY_LABELS, SECTIONS, canAccess, type Responsibility, type StaffRole } from "@/lib/permissions";

// Home page for managers. It lists only the areas the owner has given this manager. Finance and staff
// pages are not offered to managers, so no revenue figures appear here.

const ICONS: Record<string, LucideIcon> = {
  "/admin/orders": ClipboardList,
  "/admin/customers": Users,
  "/admin/products": UtensilsCrossed,
};

const DESCRIPTIONS: Record<string, string> = {
  "/admin/orders": "Confirm orders, move them along and cancel when needed.",
  "/admin/customers": "Look up registered customers and their details.",
  "/admin/products": "Update the menu, prices, photos and availability.",
  "/admin/offices": "Create the offices that managers are assigned to.",
  "/admin/restaurants": "Open each restaurant's orders, staff, stock, purchases, attendance and riders.",
};

export function StaffHome({ name, role, responsibilities }: { name: string; role: StaffRole; responsibilities: Responsibility[] }) {
  const sections = SECTIONS.filter((s) => s.href !== "/admin" && canAccess({ role, responsibilities }, s.permission));
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Manager</p>
          <h1 className="mt-1 text-3xl font-black uppercase tracking-tight md:text-4xl">Welcome, {name}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Your areas:{" "}
            {responsibilities.length > 0 ? responsibilities.map((r) => RESPONSIBILITY_LABELS[r]).join(", ") : "none yet"}. Ask the owner if you need access to something else.
          </p>
        </div>
      </header>

      {sections.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-700 px-6 py-12 text-center text-sm text-zinc-400">
          No areas have been assigned to your account yet.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => {
            const Icon = ICONS[section.href] ?? ClipboardList;
            return (
              <li key={section.href}>
                <Link
                  href={section.href}
                  className="group flex h-full flex-col gap-4 rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black p-6 shadow-xl shadow-black/40 transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-500/60"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div className="flex-1">
                    <p className="text-lg font-black uppercase">{section.label}</p>
                    <p className="mt-1 text-sm text-zinc-400">{DESCRIPTIONS[section.href]}</p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-orange-400">
                    Open
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
