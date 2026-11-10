"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChefHat } from "lucide-react";
import { ProductImage } from "@/components/ui/ProductImage";
import { OwnerHeading, useOwner } from "@/components/owner/OwnerShell";
import { OrderList } from "@/components/owner/OrderParts";
import { PosTerminal } from "@/components/owner/PosTerminal";
import { formatPKR } from "@/lib/format";
import { ownerRequest, usePolled } from "@/lib/ownerApi";
import { cn } from "@/lib/utils";
import type { ProductOption } from "@/types";
import type { OrderType, PosOrder, RestaurantTable, SalesSummary } from "@/types/pos";

const LIVE_MS = 4000;

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

function LoadState({ loading, error }: { loading: boolean; error: string | null }) {
  if (error) return <p role="alert" className="text-sm text-red-400">{error}</p>;
  if (loading) return <p className="text-sm text-zinc-400">Loading…</p>;
  return null;
}

// ---- Dashboard -------------------------------------------------------------------------------------

export function OwnerDashboard() {
  const { restaurant } = useOwner();
  const sales = usePolled<{ sales: SalesSummary }>("/api/owner/sales", 15_000);
  const tables = usePolled<{ tables: RestaurantTable[] }>("/api/owner/tables", LIVE_MS);
  const kitchen = usePolled<{ orders: PosOrder[] }>("/api/kitchen/orders", LIVE_MS);
  const open = usePolled<{ orders: PosOrder[] }>("/api/owner/orders?open=1", LIVE_MS);

  const s = sales.data?.sales;
  const tableList = tables.data?.tables ?? [];
  const openOrders = open.data?.orders ?? [];
  const awaiting = openOrders.filter((o) => o.status === "pending").length;

  return (
    <>
      <OwnerHeading title="Dashboard" subtitle={`${restaurant.name} · ${restaurant.area}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Sales today" value={formatPKR(s?.grossSales ?? 0)} hint={`${formatPKR(s?.paidSales ?? 0)} paid`} />
        <Stat label="Orders today" value={s?.orders ?? 0} />
        <Stat label="Unpaid bills" value={openOrders.filter((o) => o.status === "confirmed" && o.paymentStatus !== "paid").length} />
        <Stat label="Tables occupied" value={`${tableList.filter((t) => t.status === "occupied").length}/${tableList.length}`} />
        <Stat label="In kitchen" value={kitchen.data?.orders.length ?? 0} />
        <Stat label="Online to confirm" value={awaiting} />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/owner/tables" className="rounded-full bg-[#ffd400] px-5 py-2.5 text-sm font-bold text-black">
          New dine-in order
        </Link>
        <Link href="/owner/takeaway" className="rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold hover:bg-zinc-800">
          New takeaway order
        </Link>
        <Link href="/kitchen" target="_blank" className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-5 py-2.5 text-sm font-semibold hover:bg-zinc-800">
          <ChefHat className="h-4 w-4" aria-hidden="true" /> Kitchen screen
        </Link>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-bold">Open orders</h2>
      <LoadState loading={open.loading && !open.data} error={open.data ? null : open.error} />
      {open.data && <OrderList orders={openOrders} onChange={() => void open.reload()} empty="No open orders right now." />}
    </>
  );
}

// ---- Tables ----------------------------------------------------------------------------------------

const TABLE_STYLES: Record<RestaurantTable["status"], string> = {
  available: "border-emerald-500/50 bg-emerald-500/10",
  occupied: "border-red-500/60 bg-red-500/10",
  reserved: "border-[#ffd400]/60 bg-[#ffd400]/10",
};
const TABLE_LABELS: Record<RestaurantTable["status"], string> = { available: "Available", occupied: "Occupied", reserved: "Reserved" };

export function TablesView() {
  const tables = usePolled<{ tables: RestaurantTable[] }>("/api/owner/tables", LIVE_MS);
  const [error, setError] = useState<string | null>(null);
  const list = tables.data?.tables ?? [];

  const toggleReserved = async (table: RestaurantTable) => {
    setError(null);
    const result = await ownerRequest(`/api/owner/tables/${encodeURIComponent(table.id)}`, "PATCH", { reserved: !table.reserved });
    if (!result.ok) setError(result.error);
    void tables.reload();
  };

  return (
    <>
      <OwnerHeading title="Tables" subtitle="Tap a table to open the menu and take its order." />
      <div className="mb-4 flex flex-wrap gap-4 text-xs text-zinc-400">
        {(Object.keys(TABLE_LABELS) as RestaurantTable["status"][]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-full border", TABLE_STYLES[s])} /> {TABLE_LABELS[s]}
          </span>
        ))}
      </div>
      <LoadState loading={tables.loading && !tables.data} error={tables.data ? null : tables.error} />
      {error && <p role="alert" className="mb-3 text-sm text-red-400">{error}</p>}
      {tables.data && list.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">
          No tables yet. Add your tables in <Link href="/owner/settings" className="font-semibold text-[#ffd400] underline">Settings</Link>.
        </p>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {list.map((table) => (
          <li key={table.id} className={cn("flex flex-col rounded-2xl border p-4", TABLE_STYLES[table.status])}>
            <Link href={`/owner/tables/${encodeURIComponent(table.id)}`} className="flex-1">
              <p className="text-xl font-black">Table {table.number}</p>
              <p className="text-xs text-zinc-400">{table.seats} seats</p>
              <p className="mt-2 text-sm font-semibold">{TABLE_LABELS[table.status]}</p>
              {table.openOrders.length > 0 && (
                <p className="mt-1 text-xs text-zinc-300">
                  {table.openOrders.map((o) => `Token ${o.tokenNumber ?? "–"}`).join(", ")} · {formatPKR(table.openOrders.reduce((s, o) => s + o.total, 0))}
                </p>
              )}
            </Link>
            {table.status !== "occupied" && (
              <button type="button" onClick={() => void toggleReserved(table)} className="mt-3 rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold hover:bg-zinc-800">
                {table.reserved ? "Clear reservation" : "Reserve"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

// One table: its open orders (bill, payment, invoice) and the POS for a new order.
export function TableOrderView({ tableId }: { tableId: string }) {
  const tables = usePolled<{ tables: RestaurantTable[] }>("/api/owner/tables", LIVE_MS);
  const orders = usePolled<{ orders: PosOrder[] }>(`/api/owner/orders?type=dine_in&open=1&tableId=${encodeURIComponent(tableId)}`, LIVE_MS);
  const table = tables.data?.tables.find((t) => t.id === tableId);

  if (tables.data && !table) {
    return (
      <>
        <BackLink href="/owner/tables" label="Tables" />
        <p className="text-sm text-zinc-400">This table does not exist in your restaurant.</p>
      </>
    );
  }
  const openOrders = orders.data?.orders ?? [];
  return (
    <>
      <BackLink href="/owner/tables" label="Tables" />
      <OwnerHeading
        title={table ? `Table ${table.number}` : "Table"}
        subtitle={table ? `${table.seats} seats · ${TABLE_LABELS[table.status]}` : undefined}
      />
      {openOrders.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold">Open orders on this table</h2>
          <OrderList orders={openOrders} onChange={() => { void orders.reload(); void tables.reload(); }} empty="" />
        </section>
      )}
      {table && (
        <section>
          <h2 className="mb-3 text-lg font-bold">New order</h2>
          <PosTerminal
            orderType="dine_in"
            table={{ id: table.id, number: table.number }}
            onCreated={() => {
              void orders.reload();
              void tables.reload();
            }}
          />
        </section>
      )}
    </>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-white">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {label}
    </Link>
  );
}

// ---- Orders ----------------------------------------------------------------------------------------

const TYPE_TABS: { id: OrderType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "dine_in", label: "Dine-in" },
  { id: "takeaway", label: "Takeaway" },
  { id: "online", label: "Online" },
];

export function OrdersView() {
  const [type, setType] = useState<OrderType | "all">("all");
  const [openOnly, setOpenOnly] = useState(true);
  const params = new URLSearchParams();
  if (type !== "all") params.set("type", type);
  if (openOnly) params.set("open", "1");
  const orders = usePolled<{ orders: PosOrder[] }>(`/api/owner/orders?${params.toString()}`, LIVE_MS);

  return (
    <>
      <OwnerHeading title="Orders" subtitle="Every order of your restaurant, with its invoice, token and payment." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setType(tab.id)}
            className={cn("rounded-full px-3.5 py-1.5 text-xs font-semibold", type === tab.id ? "bg-[#ffd400] text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700")}
          >
            {tab.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} className="accent-[#ffd400]" />
          Open orders only
        </label>
      </div>
      <LoadState loading={orders.loading && !orders.data} error={orders.data ? null : orders.error} />
      {orders.data && <OrderList orders={orders.data.orders} onChange={() => void orders.reload()} empty="No orders match these filters." />}
    </>
  );
}

export function OnlineOrdersView() {
  const orders = usePolled<{ orders: PosOrder[] }>("/api/owner/orders?type=online", LIVE_MS);
  const list = orders.data?.orders ?? [];
  const awaiting = list.filter((o) => o.status === "pending");
  const active = list.filter((o) => o.status === "confirmed" && (o.kitchenStatus !== "served" && o.kitchenStatus !== "delivered" || o.paymentStatus !== "paid"));
  const done = list.filter((o) => !awaiting.includes(o) && !active.includes(o)).slice(0, 30);
  const reload = () => void orders.reload();

  return (
    <>
      <OwnerHeading title="Online Orders" subtitle="Orders customers placed on the website. Confirming one gives it an invoice and token and sends it to the kitchen." />
      <LoadState loading={orders.loading && !orders.data} error={orders.data ? null : orders.error} />
      {orders.data && (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-lg font-bold">Awaiting confirmation ({awaiting.length})</h2>
            <OrderList orders={awaiting} onChange={reload} empty="No new online orders." />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-bold">In progress or unpaid ({active.length})</h2>
            <OrderList orders={active} onChange={reload} empty="Nothing in progress." />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-bold">Recent completed and cancelled</h2>
            <OrderList orders={done} onChange={reload} empty="None yet." />
          </section>
        </div>
      )}
    </>
  );
}

export function TakeawayView() {
  const orders = usePolled<{ orders: PosOrder[] }>("/api/owner/orders?type=takeaway&open=1", LIVE_MS);
  return (
    <>
      <OwnerHeading title="Takeaway" subtitle="Walk-in customers who collect their order at the counter." />
      <PosTerminal orderType="takeaway" onCreated={() => void orders.reload()} />
      <h2 className="mb-3 mt-10 text-lg font-bold">Open takeaway orders</h2>
      <LoadState loading={orders.loading && !orders.data} error={orders.data ? null : orders.error} />
      {orders.data && <OrderList orders={orders.data.orders} onChange={() => void orders.reload()} empty="No open takeaway orders." />}
    </>
  );
}

// ---- Menu ------------------------------------------------------------------------------------------

type MenuData = {
  categories: { id: string; label: string }[];
  items: { id: string; categoryId: string; name: string; price: number; image?: string; available: boolean; groups: { id: string; label: string; options: ProductOption[] }[] }[];
};

export function MenuView() {
  const menu = usePolled<MenuData>("/api/owner/menu", 60_000);
  return (
    <>
      <OwnerHeading title="Menu" subtitle="The food items and prices your POS uses. The menu is shared by all branches and edited by the Admin." />
      <LoadState loading={menu.loading && !menu.data} error={menu.data ? null : menu.error} />
      {menu.data?.categories.map((category) => {
        const items = menu.data!.items.filter((i) => i.categoryId === category.id);
        if (items.length === 0) return null;
        return (
          <section key={category.id} className="mb-8">
            <h2 className="mb-3 text-lg font-bold">{category.label}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                    <ProductImage src={item.image} alt="" sizes="64px" iconClassName="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight">{item.name}</p>
                    <p className="text-sm font-bold text-[#ffd400]">{formatPKR(item.price)}</p>
                    <p className={cn("text-xs", item.available ? "text-emerald-400" : "text-red-400")}>{item.available ? "Available" : "Sold out"}</p>
                    {item.groups.length > 0 && <p className="text-xs text-zinc-500">Options: {item.groups.map((g) => g.label).join(", ")}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
