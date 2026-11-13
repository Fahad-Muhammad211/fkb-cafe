"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Boxes, ClipboardList, Coffee, LayoutDashboard, LogOut, Menu, ShoppingBag, Store, Trophy, UserCog, UtensilsCrossed, Users, X, type LucideIcon } from "lucide-react";
import { adminLogoutRequest } from "@/lib/adminAuth";
import { saveAllOrders } from "@/lib/orders";
import { ROLE_LABELS, SECTIONS, canAccess, type StaffRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { DatabaseBanner } from "@/components/admin/DatabaseBanner";

const ICONS: Record<string, LucideIcon> = {
  "/admin": LayoutDashboard,
  "/admin/cafe": Coffee,
  "/admin/takeaway": ShoppingBag,
  "/admin/stock": Boxes,
  "/admin/waiters": Trophy,
  "/admin/orders": ClipboardList,
  "/admin/customers": Users,
  "/admin/products": UtensilsCrossed,
  "/admin/analytics": Activity,
  "/admin/employees": UserCog,
  "/admin/restaurants": Store,
};

// The signed-in staff member, as read on the server. Used only to decide which links to draw.
export interface ShellSession {
  name: string;
  role: StaffRole;
}

// Layout for the protected admin pages. Access is checked on the server before this renders
// (see app/admin/(protected)/layout.tsx and StaffGate), so this component only draws the chrome.
export function AdminShell({ session, children }: { session: ShellSession; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-950 text-white lg:pl-64">
      <Suspense fallback={null}>
        <Sidebar session={session} />
      </Suspense>
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-20 md:px-6 lg:pt-10">
        <DatabaseBanner className="mb-6" />
        {children}
      </main>
    </div>
  );
}

function Brand({ session }: { session: ShellSession }) {
  return (
    <div className="flex items-center gap-3 px-4 py-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black font-serif text-sm font-black text-white ring-1 ring-orange-500/40">
        RMS
      </span>
      <div className="min-w-0">
        <p className="truncate font-bold leading-tight">{session.name}</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">{ROLE_LABELS[session.role]}</p>
      </div>
    </div>
  );
}

function Sidebar({ session }: { session: ShellSession }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const items = SECTIONS.filter((s) => canAccess(session, s.permission));

  const handleLogout = async () => {
    setSigningOut(true);
    await adminLogoutRequest();
    // Staff may share a browser, so the cached order list is removed before the next person signs in.
    saveAllOrders([]);
    // Full page load: the server guard then sees no session and shows the login page.
    window.location.replace("/admin/login");
  };

  const nav = (
    <>
      <Brand session={session} />
      <nav aria-label="Admin" className="flex flex-col gap-1 px-3">
        {items.map((item) => {
          const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          const Icon = ICONS[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                active ? "bg-[#ffd400] text-black" : "text-zinc-300 hover:bg-zinc-800 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-3 pb-5">
        <button
          type="button"
          onClick={handleLogout}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-red-300 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {signingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-zinc-800 bg-zinc-900 lg:flex">{nav}</aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-4 backdrop-blur lg:hidden">
        <p className="font-bold">Restaurant Management System</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div
          className="animate-fade-in fixed inset-0 z-50 bg-black/70 lg:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <aside className="animate-drawer-left relative flex h-full w-72 max-w-[85vw] flex-col bg-zinc-900">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}
