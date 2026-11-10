"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, LifeBuoy, MapPin, Phone, RotateCcw, Truck } from "lucide-react";
import { Card, ErrorNote, LoadingBlock, Notice, Pill, dangerButton, primaryButton, secondaryButton } from "@/components/customer/ui";
import {
  PAYMENT_LABEL,
  PAYMENT_TONE,
  canCustomerCancel,
  dateTime,
  deliveryLabel,
  deliveryTone,
  money,
  paymentOf,
  timeOnly,
} from "@/components/customer/orderFormat";
import { useCustomerData } from "@/components/customer/useCustomerData";
import { useReorder } from "@/components/customer/useReorder";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import { cancelOrder } from "@/lib/orders";
import { DELIVERY_ESTIMATE_MINUTES } from "@/lib/constants";
import { currentStepIndex, isCancelled, isDelivered, stepTimes } from "@/lib/orderStatus";
import type { Order } from "@/types";

// The estimate is a rule of thumb from the time the restaurant confirmed the order, not a promise.
function estimateFor(order: Order): { label: string; value: string } {
  if (isCancelled(order)) return { label: "Status", value: "This order was cancelled." };
  const times = stepTimes(order);
  if (isDelivered(order)) {
    const at = times.get(4);
    return { label: "Delivered", value: at ? `at ${timeOnly(at)}` : "Delivered" };
  }
  if (order.status === "pending") return { label: "Estimated delivery", value: "Starts once the restaurant confirms your order." };
  if (order.fulfilment === "pickup") return { label: "Pickup", value: "We will update this page as your order is prepared." };
  const confirmedAt = times.get(1) ?? times.get(0);
  if (!confirmedAt) return { label: "Estimated delivery", value: "We will update this page as your order is prepared." };
  const eta = new Date(Date.parse(confirmedAt) + DELIVERY_ESTIMATE_MINUTES * 60_000).toISOString();
  return { label: "Estimated delivery", value: `around ${timeOnly(eta)} (about ${DELIVERY_ESTIMATE_MINUTES} minutes after confirmation)` };
}

export function CustomerOrderDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useCustomerData<{ order: Order }>(`/api/orders/${encodeURIComponent(id)}`, {
    intervalMs: 20_000,
    while: ({ order }) => !isCancelled(order) && !isDelivered(order),
  });
  const { reorder, pendingOrderId, notice } = useReorder();
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (loading) return <LoadingBlock label="Loading order…" />;
  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/account/orders" className="inline-flex w-fit items-center gap-2 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My orders
        </Link>
        <ErrorNote message={error ?? "This order could not be loaded."} onRetry={reload} />
      </div>
    );
  }

  const order = data.order;
  const index = currentStepIndex(order);
  const estimate = estimateFor(order);
  const isDelivery = order.fulfilment === "delivery";

  const handleCancel = async () => {
    if (!window.confirm(`Cancel order ${order.id}? This cannot be undone.`)) return;
    setCancelling(true);
    setCancelError(null);
    const result = await cancelOrder(order.id);
    setCancelling(false);
    if (!result.ok) setCancelError(result.error);
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <Link href="/account/orders" className="inline-flex w-fit items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My orders
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4 animate-card-in">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Live tracking</p>
          <h1 className="mt-1 text-3xl font-black uppercase tracking-tight md:text-4xl">{order.id}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Placed {dateTime(order.createdAt)} · <span className="capitalize">{order.fulfilment}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={deliveryTone(order)}>{deliveryLabel(order)}</Pill>
          <Pill tone={PAYMENT_TONE[paymentOf(order)]}>{PAYMENT_LABEL[paymentOf(order)]}</Pill>
        </div>
      </header>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {cancelError && <ErrorNote message={cancelError} />}

      <Card>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Progress</h2>
          <p className="flex items-center gap-2 rounded-full bg-orange-500/10 px-4 py-2 text-sm font-semibold text-orange-300 ring-1 ring-orange-500/30">
            {isDelivery ? <Truck className="h-4 w-4" aria-hidden="true" /> : <Clock className="h-4 w-4" aria-hidden="true" />}
            <span>
              {estimate.label}: {estimate.value}
            </span>
          </p>
        </div>
        <OrderTimeline order={order} currentIndex={index} />
        <p className="mt-6 text-xs text-zinc-500">The timeline updates when the restaurant changes the status of your order.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <h2 className="text-lg font-bold">Items ({order.lines.reduce((s, l) => s + l.qty, 0)})</h2>
          <ul className="mt-4 divide-y divide-zinc-800">
            {order.lines.map((line) => (
              <li key={line.id} className="flex justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {line.qty} × {line.name}
                  </p>
                  {line.options.length > 0 && <p className="text-xs text-zinc-400">{line.options.join(" · ")}</p>}
                  {line.instructions && <p className="text-xs italic text-zinc-500">“{line.instructions}”</p>}
                </div>
                <p className="shrink-0 font-semibold">{money(line.total)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-zinc-800 pt-4 text-sm">
            <div className="flex justify-between text-zinc-300">
              <dt>Subtotal</dt>
              <dd>{money(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-zinc-300">
              <dt>{isDelivery ? "Delivery fee" : "Pickup"}</dt>
              <dd>{isDelivery ? money(order.deliveryFee) : "Free"}</dd>
            </div>
            <div className="flex justify-between border-t border-zinc-800 pt-3 text-base font-black">
              <dt>Total</dt>
              <dd className="text-orange-400">{money(order.total)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-zinc-500">Payment: cash on delivery.</p>
        </Card>

        <Card className="h-fit">
          <h2 className="text-lg font-bold">Delivery details</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Name</dt>
              <dd className="font-semibold">{order.customer.name}</dd>
            </div>
            <div className="flex gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Phone</dt>
                <dd>{order.customer.phone}</dd>
              </div>
            </div>
            {isDelivery && (
              <div className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" aria-hidden="true" />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Address</dt>
                  <dd>{order.customer.address}</dd>
                </div>
              </div>
            )}
            {order.customer.notes && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Notes</dt>
                <dd className="text-zinc-300">{order.customer.notes}</dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={() => reorder(order)} disabled={pendingOrderId === order.id} className={primaryButton}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {pendingOrderId === order.id ? "Adding…" : "Reorder these items"}
        </button>
        {canCustomerCancel(order) && (
          <button type="button" onClick={handleCancel} disabled={cancelling} className={dangerButton}>
            {cancelling ? "Cancelling…" : "Cancel order"}
          </button>
        )}
        <Link href={`/account/support?order=${encodeURIComponent(order.id)}`} className={secondaryButton}>
          <LifeBuoy className="h-4 w-4 text-orange-500" aria-hidden="true" />
          Report a problem
        </Link>
      </div>
    </div>
  );
}
