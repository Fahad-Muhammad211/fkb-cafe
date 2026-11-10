"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  ChefHat,
  ClipboardList,
  Globe,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  Receipt,
  Settings,
  ShoppingBag,
  UserCog,
  UtensilsCrossed,
  X,
  type LucideIcon,
} from "lucide-react";
import { adminLogoutRequest } from "@/lib/adminAuth";
import { ownerRequest } from "@/lib/ownerApi";
import { cn } from "@/lib/utils";

export interface OwnerInfo {
  owner: { id: string; name: string; email: string };
  restaurant: { id: string; name: string; area: string; logo: string };
}

const OwnerContext = createContext<OwnerInfo | null>(null);

export function useOwner(): OwnerInfo {
  const value = useContext(OwnerContext);
  if (!value) throw new Error("useOwner must be used inside OwnerGate.");
  return value;
}

const SECTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/owner", label: "Dashboard", icon: LayoutDashboard },
  { href: "/owner/tables", label: "Tables", icon: LayoutGrid },
  { href: "/owner/orders", label: "Orders", icon: ClipboardList },
  { href: "/owner/online-orders", label: "Online Orders", icon: Globe },
  { href: "/owner/takeaway", label: "Takeaway", icon: ShoppingBag },
  { href: "/owner/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/owner/employees", label: "Employees", icon: UserCog },
  { href: "/owner/expenses", label: "Expenses", icon: Receipt },
  { href: "/owner/sales", label: "Sales", icon: Banknote },
  { href: "/owner/settings", label: "Settings", icon: Settings },
];

type GateState = { state: "loading" } | { state: "ready"; info: OwnerInfo } | { state: "denied"; error: string };

// Asks the server who is signed in and which restaurant they own. Signed-out visitors go to the login
// page; accounts without a restaurant see why they cannot use this area. The server checks the same
// thing again on every Owner API request, so this gate only decides what to draw.
export function OwnerGate({ children, bare = false }: { children: ReactNode; bare?: boolean }) {
  const router = useRouter();
  const [gate, setGate] = useState<GateState>({ state: "loading" });

  useEffect(() => {
    let active = true;
    void ownerRequest<OwnerInfo>("/api/owner/session").then((result) => {
      if (!active) return;
      if (result.ok) setGate({ state: "ready", info: result.data });
      else if (result.status === 401) router.replace("/login");
      else setGate({ state: "denied", error: result.error });
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (gate.state === "loading") {
    return <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-sm text-zinc-400">Checking owner session…</div>;
  }
  if (gate.state === "denied") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-zinc-950 px-4 text-center">
        <p className="text-xl font-bold">Owner dashboard unavailable</p>
        <p className="max-w-md text-sm text-zinc-400">{gate.error}</p>
        <Link href="/admin" className="rounded-full bg-[#ffd400] px-5 py-2.5 text-sm font-bold text-black">
          Go to the Admin dashboard
        </Link>
      </div>
    );
  }
  return (
    <OwnerContext.Provider value={gate.info}>{bare ? children : <OwnerShell info={gate.info}>{children}</OwnerShell>}</OwnerContext.Provider>
  );
}

function OwnerShell({ info, children }: { info: OwnerInfo; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-950 text-white lg:pl-60 print:pl-0">
      <Sidebar info={info} />
      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-20 md:px-6 lg:pt-8 print:p-0">{children}</main>
    </div>
  );
}

function Sidebar({ info }: { info: OwnerInfo }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const logout = async () => {
    setSigningOut(true);
    await adminLogoutRequest();
    window.location.replace("/login");
  };

  const nav = (
    <>
      <div className="px-4 py-5">
        <p className="truncate font-bold leading-tight">{info.restaurant.name}</p>
        <p className="truncate text-xs text-zinc-400">{info.owner.name}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-orange-500">Owner</p>
      </div>
      <nav aria-label="Owner" className="flex flex-col gap-0.5 px-3">
        {SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = href === "/owner" ? pathname === "/owner" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                active ? "bg-[#ffd400] text-black" : "text-zinc-300 hover:bg-zinc-800 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
        <Link
          href="/kitchen"
          target="_blank"
          className="mt-2 flex items-center gap-3 rounded-xl border border-zinc-700 px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          <ChefHat className="h-4 w-4" aria-hidden="true" />
          Kitchen screen
        </Link>
      </nav>
      <div className="mt-auto px-3 pb-5 pt-4">
        <button
          type="button"
          onClick={logout}
          disabled={signingOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-red-300 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          {signingOut ? "Logging out…" : "Log out"}
        </button>
      </div>
    </>
  );

  return (
    <div className="print:hidden">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col overflow-y-auto border-r border-zinc-800 bg-zinc-900 lg:flex">{nav}</aside>
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-4 backdrop-blur lg:hidden">
        <p className="truncate font-bold">{info.restaurant.name}</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800"
        >
          <MenuIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 lg:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-zinc-900">
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
    </div>
  );
}

// Shared page heading for the Owner sections.
export function OwnerHeading({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
