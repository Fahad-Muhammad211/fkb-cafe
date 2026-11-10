"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Search } from "lucide-react";
import { ordersStore, parseOrders } from "@/lib/orders";
import { formatPKR } from "@/lib/format";
import { inputClass } from "@/components/ui/FormField";
import type { AuthUser, Order } from "@/types";

// Registered customers come from the server; orders come from the shared in-memory orders store.
interface RegisteredState {
  users: AuthUser[];
  failed: boolean;
}

interface CustomerRow {
  key: string;
  name: string;
  contact: string;
  type: "Registered" | "Guest";
  orders: number;
  spent: number;
  lastOrder: string | null;
}

export function CustomersView() {
  const ordersRaw = useSyncExternalStore(ordersStore.subscribe, ordersStore.getSnapshot, ordersStore.getServerSnapshot);
  const [registered, setRegistered] = useState<RegisteredState | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/admin/customers", { credentials: "same-origin", cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ customers?: AuthUser[] }>) : null))
      .then((data) => {
        if (active) setRegistered({ users: data?.customers ?? [], failed: !data?.customers });
      })
      .catch(() => {
        if (active) setRegistered({ users: [], failed: true });
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo<CustomerRow[]>(() => {
    const orders: Order[] = parseOrders(ordersRaw);
    const users = registered?.users ?? [];
    const result: CustomerRow[] = [];

    const summarise = (matching: Order[]) => ({
      orders: matching.length,
      spent: matching.reduce((sum, o) => sum + o.total, 0),
      lastOrder: matching.length
        ? matching.reduce((latest, o) => (o.createdAt > latest ? o.createdAt : latest), matching[0].createdAt)
        : null,
    });

    for (const user of users) {
      const mine = orders.filter((o) => o.userId === user.id);
      result.push({
        key: user.id,
        name: user.name,
        contact: `${user.email} · ${user.phone}`,
        type: "Registered",
        ...summarise(mine),
      });
    }

    // Guests: orders placed without an account, grouped by phone number.
    const guestOrders = orders.filter((o) => !o.userId);
    const byPhone = new Map<string, Order[]>();
    for (const o of guestOrders) {
      const key = o.customer.phone.replace(/\s/g, "");
      byPhone.set(key, [...(byPhone.get(key) ?? []), o]);
    }
    for (const [phone, group] of byPhone) {
      const latestOrder = group.reduce((a, b) => (Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a));
      result.push({
        key: `guest-${phone}`,
        name: latestOrder.customer.name,
        contact: latestOrder.customer.phone,
        type: "Guest",
        ...summarise(group),
      });
    }

    return result.sort((a, b) => b.spent - a.spent);
  }, [registered, ordersRaw]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.contact.toLowerCase().includes(q));
  }, [rows, query]);

  const loading = registered === null || ordersRaw === undefined;

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Management</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Customers</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {rows.length} {rows.length === 1 ? "customer" : "customers"} · registered accounts and guests from orders
          </p>
        </div>
      </header>

      <label className="relative block max-w-md">
        <span className="sr-only">Search customers</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or phone" className={`${inputClass} pl-11`} />
      </label>

      {registered?.failed && (
        <p role="status" className="text-sm text-amber-400">
          Registered customers could not be loaded. Guest orders are still shown below.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-400">Loading customers…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 px-6 py-12 text-center text-sm text-zinc-400">
          No customers yet. Sign-ups and orders will appear here.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-2xl border border-zinc-800 md:block">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Contact</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Orders</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Spent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filtered.map((r) => (
                  <tr key={r.key} className="transition-colors hover:bg-zinc-900/60">
                    <td className="px-4 py-3 font-semibold">{r.name}</td>
                    <td className="px-4 py-3 text-zinc-300">{r.contact}</td>
                    <td className="px-4 py-3">
                      <TypeBadge type={r.type} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.orders}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPKR(r.spent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 md:hidden">
            {filtered.map((r) => (
              <li key={r.key} className="animate-card-in rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{r.name}</p>
                    <p className="truncate text-xs text-zinc-400">{r.contact}</p>
                  </div>
                  <TypeBadge type={r.type} />
                </div>
                <div className="mt-3 flex justify-between border-t border-zinc-800 pt-3 text-sm">
                  <span className="text-zinc-400">{r.orders} orders</span>
                  <span className="font-bold tabular-nums">{formatPKR(r.spent)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: "Registered" | "Guest" }) {
  return (
    <span
      className={
        type === "Registered"
          ? "rounded-full bg-[#ffd400]/15 px-2.5 py-1 text-xs font-semibold text-[#ffd400]"
          : "rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-300"
      }
    >
      {type}
    </span>
  );
}
