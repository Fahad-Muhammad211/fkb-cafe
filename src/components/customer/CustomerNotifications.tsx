"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import { Card, EmptyState, ErrorNote, LoadingBlock, Notice, PageHeader, Pill, secondaryButton } from "@/components/customer/ui";
import { dateTime } from "@/components/customer/orderFormat";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import type { CustomerNotification } from "@/types/customer";

export function CustomerNotifications() {
  const { data, error, loading, reload } = useCustomerData<{ items: CustomerNotification[]; unreadCount: number }>("/api/customer/notifications");
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  const items = data?.items ?? [];
  const unread = data?.unreadCount ?? 0;

  const markAllRead = async () => {
    setMarking(true);
    setMarkError(null);
    const result = await customerRequest("/api/customer/notifications", "POST");
    setMarking(false);
    if (!result.ok) {
      setMarkError(result.error);
      return;
    }
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Updates"
        title="Notifications"
        description="Updates on your orders, from when they are placed to when they arrive."
        action={
          items.length > 0 ? (
            <button type="button" onClick={markAllRead} disabled={marking || unread === 0} className={secondaryButton}>
              <CheckCheck className="h-4 w-4 text-orange-500" aria-hidden="true" />
              {marking ? "Saving…" : unread > 0 ? `Mark ${unread} as read` : "All read"}
            </button>
          ) : null
        }
      />

      {loading && <LoadingBlock label="Loading notifications…" />}
      {error && <ErrorNote message={error} onRetry={reload} />}
      {markError && <Notice tone="error">{markError}</Notice>}

      {data && items.length === 0 && (
        <EmptyState icon={Bell} title="No notifications" description="When an order is confirmed, prepared or delivered, you will see the update here." />
      )}

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((n) => (
            <li key={n.id}>
              <Link href={`/account/orders/${n.orderId}`} className="block transition-transform duration-200 hover:-translate-y-0.5">
                <Card className="flex items-start gap-4 p-4">
                  <span className="relative mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-500 ring-1 ring-orange-500/30">
                    <Bell className="h-5 w-5" aria-hidden="true" />
                    {n.unread && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-orange-500 ring-2 ring-zinc-900" aria-label="Unread" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold">{n.title}</p>
                      {n.unread && <Pill tone="orange">New</Pill>}
                    </div>
                    <p className="mt-1 text-sm text-zinc-300">{n.message}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      {n.orderId} · {dateTime(n.at)}
                    </p>
                  </div>
                  <ChevronRight className="mt-3 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
