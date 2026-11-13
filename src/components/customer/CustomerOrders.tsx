"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ReceiptText, RotateCcw, X } from "lucide-react";
import { Card, EmptyState, ErrorNote, LoadingBlock, Notice, PageHeader, Pill, dangerButton, primaryButton, secondaryButton } from "@/components/customer/ui";
import {
  PAYMENT_LABEL,
  PAYMENT_TONE,
  canCustomerCancel,
  dateTime,
  deliveryLabel,
  deliveryTone,
  isActiveOrder,
  itemCount,
  itemSummary,
  money,
  paymentOf,
} from "@/components/customer/orderFormat";
import { useCustomerData } from "@/components/customer/useCustomerData";
import { useReorder } from "@/components/customer/useReorder";
import { cancelOrder } from "@/lib/orders";
import { isCancelled, isDelivered } from "@/lib/orderStatus";
import { cn } from "@/lib/utils";
import type { Order } from "@/types";

type Filter = "all" | "active" | "completed" | "cancelled";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

const matches = (order: Order, filter: Filter) => {
  if (filter === "all") return true;
  if (filter === "active") return isActiveOrder(order);
  if (filter === "completed") return isDelivered(order);
  return isCancelled(order);
};

export function CustomerOrders() {
  const { data, error, loading, reload } = useCustomerData<{ orders: Order[] }>("/api/orders");
  const { reorder, pendingOrderId, notice, clearNotice } = useReorder();
  const [filter, setFilter] = useState<Filter>("all");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const orders = data?.orders ?? [];
  const visible = orders.filter((o) => matches(o, filter));

  const handleCancel = async (order: Order) => {
    if (!window.confirm(`Cancel order ${order.id}? This cannot be undone.`)) return;
    setCancellingId(order.id);
    setCancelError(null);
    const result = await cancelOrder(order.id);
    setCancellingId(null);
    if (!result.ok) setCancelError(result.error);
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Orders" title="My orders" description="Every order you have placed while signed in, with its payment and delivery status." />

      <div role="group" aria-label="Filter orders" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = orders.filter((o) => matches(o, f.id)).length;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200",
                filter === f.id ? "bg-orange-500 text-black" : "border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-orange-500/50",
              )}
            >
              {f.label} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Notice tone={notice.tone}>{notice.text}</Notice>
          </div>
          <button type="button" onClick={clearNotice} aria-label="Dismiss" className="rounded-full p-2 text-zinc-400 hover:text-white">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {cancelError && <ErrorNote message={cancelError} />}

      {loading && <LoadingBlock label="Loading your orders…" />}
      {error && <ErrorNote message={error} onRetry={reload} />}

      {data && orders.length === 0 && (
        <EmptyState
          icon={ReceiptText}
          title="No orders yet"
          description="Orders you place while signed in will appear here."
          action={
            <Link href="/" className={primaryButton}>
              Browse the menu
            </Link>
          }
        />
      )}

      {data && orders.length > 0 && visible.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-700 px-6 py-10 text-center text-sm text-zinc-400">No orders match this filter.</p>
      )}

      {visible.length > 0 && (
        <ul className="flex flex-col gap-4">
          {visible.map((order) => (
            <li key={order.id}>
              <Card className="flex flex-col gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black">{order.id}</p>
                    <p className="text-xs text-zinc-400">
                      {dateTime(order.createdAt)} · <span className="capitalize">{order.fulfilment}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Pill tone={deliveryTone(order)}>{deliveryLabel(order)}</Pill>
                    <Pill tone={PAYMENT_TONE[paymentOf(order)]}>{PAYMENT_LABEL[paymentOf(order)]}</Pill>
                  </div>
                </div>

                <div className="rounded-xl bg-black/40 p-4 ring-1 ring-zinc-800">
                  <p className="text-sm text-zinc-200">{itemSummary(order, 6)}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {itemCount(order)} {itemCount(order) === 1 ? "item" : "items"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
                  <p className="text-xl font-black">{money(order.total)}</p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/account/orders/${order.id}`} className={secondaryButton}>
                      View details
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => reorder(order)}
                      disabled={pendingOrderId === order.id}
                      className={secondaryButton}
                    >
                      <RotateCcw className="h-4 w-4 text-orange-500" aria-hidden="true" />
                      {pendingOrderId === order.id ? "Adding…" : "Reorder"}
                    </button>
                    {canCustomerCancel(order) && (
                      <button
                        type="button"
                        onClick={() => handleCancel(order)}
                        disabled={cancellingId === order.id}
                        className={dangerButton}
                      >
                        {cancellingId === order.id ? "Cancelling…" : "Cancel order"}
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
