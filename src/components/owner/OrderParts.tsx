"use client";

import { useState } from "react";
import Link from "next/link";
import { formatPKR } from "@/lib/format";
import { formatDateTime, ownerRequest } from "@/lib/ownerApi";
import { cn } from "@/lib/utils";
import { KITCHEN_STATUS_LABELS, ORDER_TYPE_LABELS, type KitchenStatus, type PosOrder } from "@/types/pos";

const KITCHEN_STYLES: Record<KitchenStatus, string> = {
  awaiting: "bg-orange-500/15 text-orange-300",
  pending: "bg-zinc-700 text-zinc-100",
  preparing: "bg-sky-500/15 text-sky-300",
  ready: "bg-[#ffd400]/15 text-[#ffd400]",
  served: "bg-emerald-500/15 text-emerald-300",
  delivered: "bg-emerald-500/15 text-emerald-300",
  cancelled: "bg-red-500/15 text-red-300",
};

export function KitchenBadge({ status }: { status: KitchenStatus }) {
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", KITCHEN_STYLES[status])}>{KITCHEN_STATUS_LABELS[status]}</span>;
}

export function PaymentBadge({ order }: { order: PosOrder }) {
  if (order.status === "cancelled") return <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs font-semibold text-zinc-400">Cancelled</span>;
  const paid = order.paymentStatus === "paid";
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", paid ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300")}>
      {paid ? "Paid" : "Unpaid"}
    </span>
  );
}

export function orderPlace(order: PosOrder): string {
  if (order.orderType === "dine_in") return `Table ${order.tableNumber ?? "?"}`;
  if (order.orderType === "takeaway") return "Takeaway";
  return order.fulfilment === "delivery" ? "Online · Delivery" : "Online · Pickup";
}

// Confirm (online), take payment, cancel and open the invoice. Each button calls the server and hands
// the updated order back, so the list shows the same record every other screen sees.
export function OrderActions({ order, onChange }: { order: PosOrder; onChange: (order: PosOrder) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, url: string, method: "POST" | "PUT", body?: unknown) => {
    setBusy(key);
    setError(null);
    const result = await ownerRequest<{ order: PosOrder }>(url, method, body);
    setBusy(null);
    if (result.ok) onChange(result.data.order);
    else setError(result.error);
  };
  const base = `/api/owner/orders/${encodeURIComponent(order.id)}`;
  const cancellable = order.status !== "cancelled" && order.paymentStatus !== "paid" && order.kitchenStatus !== "served" && order.kitchenStatus !== "delivered";
  const payable = order.status === "confirmed" && order.paymentStatus !== "paid";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {order.status === "pending" && (
          <button type="button" disabled={busy !== null} onClick={() => run("confirm", `${base}/confirmation`, "POST")} className="rounded-full bg-[#ffd400] px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50">
            {busy === "confirm" ? "Confirming…" : "Confirm & send to kitchen"}
          </button>
        )}
        {payable && (
          <>
            <button type="button" disabled={busy !== null} onClick={() => run("cash", `${base}/payment`, "PUT", { method: "cash" })} className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black disabled:opacity-50">
              {busy === "cash" ? "Saving…" : "Paid · Cash"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => run("card", `${base}/payment`, "PUT", { method: "card" })} className="rounded-full border border-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-300 disabled:opacity-50">
              {busy === "card" ? "Saving…" : "Paid · Card"}
            </button>
          </>
        )}
        {order.invoiceNumber && (
          <Link href={`/owner/invoices/${encodeURIComponent(order.id)}`} target="_blank" className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-800">
            Invoice
          </Link>
        )}
        {cancellable && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm(`Cancel order ${order.invoiceNumber ?? order.id}?`)) void run("cancel", `${base}/cancellation`, "POST");
            }}
            className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-red-400 hover:text-red-300 disabled:opacity-50"
          >
            {busy === "cancel" ? "Cancelling…" : "Cancel"}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function OrderCard({ order, onChange }: { order: PosOrder; onChange: (order: PosOrder) => void }) {
  return (
    <li className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {order.tokenNumber !== undefined && (
              <span className="rounded-lg bg-[#ffd400] px-2 py-0.5 text-sm font-black text-black">Token {order.tokenNumber}</span>
            )}
            <p className="font-bold">{order.invoiceNumber ?? order.id}</p>
            <span className="text-xs text-zinc-400">{ORDER_TYPE_LABELS[order.orderType]}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            {orderPlace(order)} · {formatDateTime(order.createdAt)} · {order.customer.name}
            {order.customer.phone ? ` · ${order.customer.phone}` : ""}
          </p>
          {order.orderType === "online" && order.fulfilment === "delivery" && order.customer.address && (
            <p className="mt-0.5 text-xs text-zinc-500">{order.customer.address}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <KitchenBadge status={order.kitchenStatus} />
          <PaymentBadge order={order} />
          <p className="font-bold">{formatPKR(order.total)}</p>
        </div>
      </div>
      <p className="mt-2 text-sm text-zinc-300">{order.lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</p>
      <div className="mt-3">
        <OrderActions order={order} onChange={onChange} />
      </div>
    </li>
  );
}

// A list of orders that replaces an entry in place when an action returns the updated order.
export function OrderList({ orders, onChange, empty }: { orders: PosOrder[]; onChange: (order: PosOrder) => void; empty: string }) {
  if (orders.length === 0) return <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-400">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} onChange={onChange} />
      ))}
    </ul>
  );
}
