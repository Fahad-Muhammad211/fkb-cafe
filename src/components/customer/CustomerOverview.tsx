"use client";

import Link from "next/link";
import { ArrowRight, CircleCheck, Clock, MapPin, ReceiptText, UtensilsCrossed, Wallet } from "lucide-react";
import { Card, EmptyState, ErrorNote, LoadingBlock, PageHeader, Pill, StatCard, primaryButton, secondaryButton } from "@/components/customer/ui";
import { deliveryLabel, deliveryTone, dateTime, isActiveOrder, itemSummary, money } from "@/components/customer/orderFormat";
import { useCustomerData } from "@/components/customer/useCustomerData";
import { useAuth } from "@/context/AuthContext";
import { isCancelled, isDelivered } from "@/lib/orderStatus";
import type { Order } from "@/types";

export function CustomerOverview() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useCustomerData<{ orders: Order[] }>("/api/orders");

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const orders = data?.orders ?? [];
  const active = orders.filter(isActiveOrder);
  const completed = orders.filter(isDelivered);
  const spent = orders.filter((o) => !isCancelled(o)).reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Customer dashboard"
        title={`Welcome back, ${firstName}`}
        description="Track your orders, manage your details and see what's new at Restaurant Management System."
        action={
          <Link href="/" className={primaryButton}>
            <UtensilsCrossed className="h-4 w-4" aria-hidden="true" />
            Order now
          </Link>
        }
      />

      {loading && <LoadingBlock label="Loading your dashboard…" />}
      {error && <ErrorNote message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={ReceiptText} label="Total orders" value={String(orders.length)} />
            <StatCard icon={Clock} label="Pending" value={String(active.length)} hint="Not yet delivered" />
            <StatCard icon={CircleCheck} label="Completed" value={String(completed.length)} hint="Delivered orders" />
            <StatCard icon={Wallet} label="Total spending" value={money(spent)} hint="Excludes cancelled orders" />
          </div>

          <section aria-labelledby="recent-heading" className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 id="recent-heading" className="text-lg font-bold">
                Recent orders
              </h2>
              {orders.length > 0 && (
                <Link href="/account/orders" className="inline-flex items-center gap-1 text-sm font-semibold text-orange-400 hover:text-orange-300">
                  View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              )}
            </div>

            {orders.length === 0 ? (
              <EmptyState
                icon={ReceiptText}
                title="No orders yet"
                description="Orders you place while signed in will show up here, with live tracking."
                action={
                  <Link href="/" className={primaryButton}>
                    Browse the menu
                  </Link>
                }
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {orders.slice(0, 5).map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/account/orders/${order.id}`}
                      className="group flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-orange-500/50 hover:shadow-lg hover:shadow-orange-500/10 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-bold">{order.id}</p>
                        <p className="text-xs text-zinc-400">{dateTime(order.createdAt)}</p>
                        <p className="mt-1 truncate text-sm text-zinc-300">{itemSummary(order)}</p>
                      </div>
                      <div className="flex items-center justify-between gap-4 md:justify-end">
                        <Pill tone={deliveryTone(order)}>{deliveryLabel(order)}</Pill>
                        <span className="font-black">{money(order.total)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="quick-heading" className="grid gap-4 md:grid-cols-2">
            <h2 id="quick-heading" className="sr-only">
              Quick links
            </h2>
            <Card className="flex flex-col gap-3">
              <p className="font-bold">Delivery addresses</p>
              <p className="text-sm text-zinc-400">Save the places you order to, so they are ready when you need them.</p>
              <Link href="/account/addresses" className={`${secondaryButton} w-fit`}>
                <MapPin className="h-4 w-4 text-orange-500" aria-hidden="true" />
                Manage addresses
              </Link>
            </Card>
            <Card className="flex flex-col gap-3">
              <p className="font-bold">Need help with an order?</p>
              <p className="text-sm text-zinc-400">Send a complaint from your account and link it to the order it is about.</p>
              <Link href="/account/support" className={`${secondaryButton} w-fit`}>
                Contact support
              </Link>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
