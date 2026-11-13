"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShoppingBag } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { formatPKR } from "@/lib/format";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import type { Order } from "@/types";

export function CheckoutView() {
  const { user } = useAuth();
  const { lines } = useCart();
  const [order, setOrder] = useState<Order | null>(null);

  // Wait for the saved session to load so the form can be prefilled for signed-in users.
  if (user === undefined) {
    return <p className="text-sm text-zinc-400">Loading checkout…</p>;
  }

  if (order) {
    return <OrderConfirmation order={order} signedIn={Boolean(user)} />;
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
          <ShoppingBag className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-black uppercase">Your cart is empty</h1>
        <p className="text-sm text-zinc-400">Add some items from the menu before checking out.</p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#ffd400] px-6 py-3 text-sm font-bold text-black transition-transform duration-200 hover:scale-105 active:scale-95"
        >
          Browse the menu
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    );
  }

  return <CheckoutForm key={user?.id ?? "guest"} user={user} lines={lines} onPlaced={setOrder} />;
}

function OrderConfirmation({ order, signedIn }: { order: Order; signedIn: boolean }) {
  return (
    <section aria-labelledby="confirmation-heading" className="mx-auto flex w-full max-w-xl animate-card-in flex-col items-center gap-5 py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
        <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
      </span>
      <div>
        <h1 id="confirmation-heading" className="text-3xl font-black uppercase tracking-tight">
          Order placed
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Thanks, {order.customer.name}. Your order number is{" "}
          <span className="font-semibold text-white">{order.id}</span>.
        </p>
      </div>

      <dl className="w-full divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900 text-left text-sm">
        <div className="flex justify-between px-5 py-3">
          <dt className="text-zinc-400">Fulfilment</dt>
          <dd className="font-semibold capitalize">{order.fulfilment}</dd>
        </div>
        <div className="flex justify-between px-5 py-3">
          <dt className="text-zinc-400">Payment</dt>
          <dd className="font-semibold">Cash on Delivery</dd>
        </div>
        <div className="flex justify-between px-5 py-3">
          <dt className="text-zinc-400">Items</dt>
          <dd className="font-semibold">{order.lines.reduce((sum, l) => sum + l.qty, 0)}</dd>
        </div>
        <div className="flex justify-between px-5 py-3 text-base">
          <dt className="font-bold">Total</dt>
          <dd className="font-bold">{formatPKR(order.total)}</dd>
        </div>
      </dl>

      <p className="text-xs text-zinc-500">Your order has been sent to the restaurant for confirmation.</p>

      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-full bg-[#ffd400] px-6 py-3 text-sm font-bold text-black transition-transform duration-200 hover:scale-105 active:scale-95">
          Back to menu
        </Link>
        <Link href={`/orders/${order.id}`} className="rounded-full border border-zinc-700 px-6 py-3 text-sm font-semibold transition-colors hover:bg-zinc-800">
          Track order
        </Link>
        {signedIn && (
          <Link href="/account/orders" className="rounded-full border border-zinc-700 px-6 py-3 text-sm font-semibold transition-colors hover:bg-zinc-800">
            View my orders
          </Link>
        )}
      </div>
    </section>
  );
}
