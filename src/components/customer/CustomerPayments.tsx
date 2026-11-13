"use client";

import Link from "next/link";
import { CreditCard, Wallet } from "lucide-react";
import { Card, EmptyState, ErrorNote, LoadingBlock, PageHeader, Pill, StatCard } from "@/components/customer/ui";
import { dateTime, money } from "@/components/customer/orderFormat";
import { useCustomerData } from "@/components/customer/useCustomerData";
import type { PaymentRecord } from "@/types/customer";

const STATUS_LABEL: Record<PaymentRecord["status"], string> = {
  pending: "Pending",
  paid: "Paid",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<PaymentRecord["status"], "orange" | "green" | "red"> = {
  pending: "orange",
  paid: "green",
  cancelled: "red",
};

export function CustomerPayments() {
  const { data, error, loading, reload } = useCustomerData<{ payments: PaymentRecord[] }>("/api/customer/payments");
  const payments = data?.payments ?? [];

  const paid = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);
  const due = payments.filter((p) => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);
  const cancelled = payments.filter((p) => p.status === "cancelled").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Billing" title="My payments" description="Every payment linked to your orders, with its current status." />

      {loading && <LoadingBlock label="Loading your payments…" />}
      {error && <ErrorNote message={error} onRetry={reload} />}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={Wallet} label="Paid" value={money(paid)} hint="Confirmed by the payment record" />
            <StatCard icon={CreditCard} label="To pay on delivery" value={money(due)} hint="Cash on delivery, not yet collected" />
            <StatCard icon={CreditCard} label="Cancelled" value={String(cancelled)} hint="Payments for cancelled orders" />
          </div>

          {payments.length === 0 ? (
            <EmptyState
              icon={CreditCard}
              title="No payments yet"
              description="When you place an order, its payment record appears here."
              action={
                <Link href="/" className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-black hover:bg-orange-400">
                  Browse the menu
                </Link>
              }
            />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="hidden grid-cols-[1.2fr_1fr_1fr_1fr_1fr] gap-4 border-b border-zinc-800 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-zinc-500 md:grid">
                <span>Order</span>
                <span>Date</span>
                <span>Method</span>
                <span>Amount</span>
                <span>Status</span>
              </div>
              <ul className="divide-y divide-zinc-800">
                {payments.map((p) => (
                  <li key={p.id} className="grid gap-2 px-6 py-4 text-sm md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr] md:items-center md:gap-4">
                    <Link href={`/account/orders/${p.orderId}`} className="font-bold text-white hover:text-orange-400">
                      {p.orderId}
                    </Link>
                    <span className="text-zinc-400">{dateTime(p.createdAt)}</span>
                    <span className="text-zinc-300">Cash on delivery</span>
                    <span className="font-semibold">{money(p.amount)}</span>
                    <span>
                      <Pill tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
