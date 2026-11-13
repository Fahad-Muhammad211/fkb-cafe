"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CreditCard,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MapPin,
  ReceiptText,
  Ticket,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { focusRing } from "@/components/customer/ui";
import { useAuth } from "@/context/AuthContext";
import { logOutRequest } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const CUSTOMER_NAV: NavEntry[] = [
  { href: "/account", label: "Overview", icon: LayoutDashboard },
  { href: "/account/orders", label: "My orders", icon: ReceiptText },
  { href: "/account/profile", label: "Profile", icon: UserRound },
  { href: "/account/addresses", label: "Addresses", icon: MapPin },
  { href: "/account/wishlist", label: "Wishlist", icon: Heart },
  { href: "/account/payments", label: "Payments", icon: CreditCard },
  { href: "/account/offers", label: "Offers", icon: Ticket },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/account/support", label: "Support", icon: LifeBuoy },
];

// The customer dashboard frame: a sidebar on large screens and a scrolling tab bar on small ones.
// Only the signed-in customer sees it; the server layout redirects everyone else to /login.
export function CustomerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const isActive = (href: string) => (href === "/account" ? pathname === "/account" : pathname.startsWith(href));

  const handleLogout = async () => {
    setSigningOut(true);
    // Clear the httpOnly cookie on the server first, then reload so no account data stays on screen.
    await logOutRequest();
    window.location.replace("/");
  };

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 text-white">
      <div className="sticky top-0 z-50">
        <Header />
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 py-6 md:px-6 md:py-10">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-28 flex flex-col gap-6 rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4 shadow-2xl shadow-black/50 backdrop-blur">
            <div className="flex items-center gap-3 rounded-2xl bg-black/60 p-3 ring-1 ring-zinc-800">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500 font-black text-black">
                {(user?.name ?? "M").charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{user?.name ?? "Welcome"}</p>
                <p className="truncate text-xs text-zinc-400">{user?.email ?? ""}</p>
              </div>
            </div>

            <nav aria-label="Customer dashboard" className="flex flex-col gap-1">
              {CUSTOMER_NAV.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200",
                      active ? "bg-orange-500 text-black shadow-lg shadow-orange-500/20" : "text-zinc-300 hover:bg-zinc-800 hover:text-white",
                      focusRing,
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110", active ? "text-black" : "text-orange-500")} aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </nav>

            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className={cn(
                "flex items-center gap-3 rounded-xl border border-zinc-700 px-3 py-2.5 text-sm font-semibold text-zinc-200 transition-colors duration-200 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50",
                focusRing,
              )}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {signingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <nav aria-label="Customer dashboard" className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 lg:hidden">
            {CUSTOMER_NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                    active ? "bg-orange-500 text-black" : "border border-zinc-800 bg-zinc-900 text-zinc-300",
                    focusRing,
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              disabled={signingOut}
              className={cn("flex shrink-0 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-300 disabled:opacity-50", focusRing)}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Log out
            </button>
          </nav>

          {children}
        </main>
      </div>

      <Footer />
    </div>
  );
}
