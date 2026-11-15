"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Phone } from "lucide-react";
import { cancelOrder, findOrder, ordersStore, parseOrders, saveAllOrders } from "@/lib/orders";
import { formatPKR } from "@/lib/format";
import { currentStepIndex, isAwaitingConfirmation, isCancelled, isDelivered, statusLabel, stepTimes } from "@/lib/orderStatus";
import { ETA_MINUTES } from "@/lib/constants";
import { OrderTimeline } from "@/components/orders/OrderTimeline";
import type { Order } from "@/types";

const TRACKING_REFRESH_MS = 5000;

// Re-reads this one order from the server every few seconds while the page is visible, so a status
// change made in the kitchen or by the restaurant shows here without a reload. Guests who are not
// signed in get 401 and keep the copy they already have.
function useLiveOrder(id: string) {
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { order?: Order };
        if (!active || !data.order) return;
        const others = parseOrders(ordersStore.getSnapshot()).filter((o) => o.id !== id);
        saveAllOrders([data.order, ...others].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
      } catch {
        // Offline for a moment: the next tick tries again.
      }
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, TRACKING_REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [id]);
}

export function OrderDetail({ id }: { id: string }) {
  const raw = useSyncExternalStore(ordersStore.subscribe, ordersStore.getSnapshot, ordersStore.getServerSnapshot);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  useLiveOrder(id);

  if (raw === undefined) {
    return <p className="text-sm text-zinc-400">Loading order…</p>;
  }

  const order = findOrder(parseOrders(raw), id);

  if (!order) {
    return (
      <div className="mx-auto flex max-w-md animate-card-in flex-col items-center gap-4 py-16 text-center">
        <p className="text-xl font-bold">Order not found</p>
        <p className="text-sm text-zinc-400">
          We could not find order {id} on your account.
        </p>
        <Link href="/account/orders" className="rounded-full bg-[#ffd400] px-6 py-3 text-sm font-bold text-black transition-transform duration-200 hover:scale-105">
          Back to my orders
        </Link>
      </div>
    );
  }

  const index = currentStepIndex(order);
  const delivered = isDelivered(order);
  const handleCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    const result = await cancelOrder(order.id);
    setCancelling(false);
    if (!result.ok) setCancelError(result.error);
  };
  const isDelivery = order.fulfilment === "delivery";
  const items = order.lines.reduce((sum, l) => sum + l.qty, 0);
  // Given once, when the restaurant confirms the order (see lib/server/pos.ts).
  const { invoiceNumber, tokenNumber } = order as Order & { invoiceNumber?: string; tokenNumber?: number };

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <Link href="/account/orders" className="inline-flex w-fit items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        My orders
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Order</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">{order.id}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Placed{" "}
            {new Date(order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
            <span className="capitalize">{order.fulfilment}</span>
          </p>
        </div>
        <p
          className={
            delivered
              ? "rounded-full bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-400"
              : "rounded-full bg-[#ffd400]/15 px-4 py-2 text-sm font-semibold text-[#ffd400]"
          }
          aria-live="polite"
        >
          {statusLabel(order)}
        </p>
      </header>

      <LiveStatus order={order} index={index} />

      {invoiceNumber && (
        <section aria-label="Invoice and token" className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-2xl bg-[#ffd400] p-4 text-black">
            <p className="text-xs font-semibold uppercase">Token number</p>
            <p className="text-3xl font-black">{tokenNumber}</p>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-xs font-semibold uppercase text-zinc-500">Invoice number</p>
            <p className="break-all font-bold">{invoiceNumber}</p>
          </div>
        </section>
      )}

      <section aria-labelledby="progress-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 md:p-8">
        <h2 id="progress-heading" className="mb-6 text-lg font-bold">
          Tracking
        </h2>
        <OrderTimeline order={order} currentIndex={index} />

        {isAwaitingConfirmation(order) && (
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-5">
            <p className="text-xs text-zinc-500">Waiting for the restaurant to confirm your order.</p>
            <button
              type="button"
              disabled={cancelling}
              onClick={handleCancel}
              className="inline-flex items-center gap-2 rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold transition-all duration-200 hover:bg-zinc-800 active:scale-95 disabled:opacity-50"
            >
              Cancel order
            </button>
          </div>
        )}
        {cancelError && (
          <p role="alert" className="mt-4 text-sm text-red-400">
            {cancelError}
          </p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <section aria-labelledby="items-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 id="items-heading" className="text-lg font-bold">
            Items ({items})
          </h2>
          <ul className="mt-4 divide-y divide-zinc-800">
            {order.lines.map((line) => (
              <li key={line.id} className="flex justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-semibold uppercase">
                    {line.qty} × {line.name}
                  </p>
                  {line.options.length > 0 && <p className="text-xs text-zinc-400">{line.options.join(" · ")}</p>}
                  {line.instructions && <p className="text-xs italic text-zinc-500">“{line.instructions}”</p>}
                </div>
                <p className="shrink-0">{formatPKR(line.total)}</p>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-zinc-800 pt-4 text-sm">
            <div className="flex justify-between text-zinc-300">
              <dt>Subtotal</dt>
              <dd>{formatPKR(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between text-zinc-300">
              <dt>{isDelivery ? "Delivery fee" : "Pickup"}</dt>
              <dd>{isDelivery ? formatPKR(order.deliveryFee) : "Free"}</dd>
            </div>
            {(order.discount ?? 0) > 0 && (
              <div className="flex justify-between text-emerald-400">
                <dt>Card discount</dt>
                <dd>− {formatPKR(order.discount ?? 0)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-800 pt-3 text-base font-bold">
              <dt>Total</dt>
              <dd>{formatPKR(order.total)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-zinc-500">
            Payment: {order.payment === "card" ? "Card" : "Cash"} on {isDelivery ? "delivery" : "pickup"} ({order.paymentStatus === "paid" ? "paid" : order.paymentStatus === "cancelled" ? "cancelled" : "unpaid"})
          </p>
        </section>

        <section aria-labelledby="details-heading" className="h-fit rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 id="details-heading" className="text-lg font-bold">
            Details
          </h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Name</dt>
              <dd className="font-semibold">{order.customer.name}</dd>
            </div>
            <div className="flex gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Phone</dt>
                <dd>{order.customer.phone}</dd>
              </div>
            </div>
            {isDelivery && (
              <div className="flex gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Delivery address</dt>
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
        </section>
      </div>
    </div>
  );
}

// Where the food is right now, the time left and the rider, refreshed with the order every few seconds.
function LiveStatus({ order, index }: { order: Order; index: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (isCancelled(order)) return null;
  const delivery = order.fulfilment === "delivery";
  const messages = [
    "Order sent. Waiting for the restaurant to see it…",
    "The restaurant has seen your order ✓",
    "Your food is being prepared in the kitchen 👨‍🍳",
    delivery ? `Your food is with the rider and on the way 🛵` : "Your food is ready. Collect it at the counter 🛍️",
    delivery ? "Delivered. Enjoy your meal!" : "Collected. Enjoy your meal!",
  ];
  const start = stepTimes(order).get(1);
  const due = start ? Date.parse(start) + ETA_MINUTES[delivery ? "delivery" : "pickup"] * 60_000 : null;
  const left = due ? due - now : null;
  const done = index >= 4;
  const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;
  return (
    <section aria-live="polite" className="grid gap-3 rounded-2xl border border-[#ffd400]/40 bg-[#ffd400]/10 p-5 sm:grid-cols-[1fr_auto]">
      <div>
        <p className="text-lg font-black">{messages[index] ?? messages[0]}</p>
        {index >= 3 && delivery && order.riderName && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            Rider: <b>{order.riderName}</b>
            {order.riderPhone && (
              <a href={`tel:${order.riderPhone}`} className="inline-flex items-center gap-1 rounded-full bg-[#ffd400] px-3 py-1 font-bold text-black">
                <Phone className="h-3.5 w-3.5" aria-hidden="true" /> {order.riderPhone}
              </a>
            )}
          </p>
        )}
      </div>
      {!done && (
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-zinc-400">{left === null ? "Time" : left > 0 ? "Time left" : "Running late"}</p>
          <p className="text-3xl font-black tabular-nums">{left === null ? "—" : mmss(Math.abs(left))}</p>
          {left === null && <p className="text-xs text-zinc-400">Starts when confirmed</p>}
        </div>
      )}
    </section>
  );
}
