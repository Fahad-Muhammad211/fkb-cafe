"use client";

import { useState } from "react";
import { Check, Copy, Percent, Ticket } from "lucide-react";
import { Card, EmptyState, ErrorNote, LoadingBlock, Notice, PageHeader, Pill, secondaryButton } from "@/components/customer/ui";
import { dateOnly, money } from "@/components/customer/orderFormat";
import { useCustomerData } from "@/components/customer/useCustomerData";
import type { Coupon } from "@/types/customer";

function discountLabel(coupon: Coupon): string {
  if (coupon.percentOff) return `${coupon.percentOff}% off`;
  if (coupon.amountOff) return `${money(coupon.amountOff)} off`;
  return "Special offer";
}

export function CustomerOffers() {
  const { data, error, loading, reload } = useCustomerData<{ coupons: Coupon[] }>("/api/customer/offers");
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const copyCode = async (code: string) => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      window.setTimeout(() => setCopied((current) => (current === code ? null : current)), 2000);
    } catch {
      setCopyError(`Copy this code by hand: ${code}`);
    }
  };

  const coupons = data?.coupons ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Rewards" title="Offers & coupons" description="Active discount codes from MEG Pakistan." />

      {loading && <LoadingBlock label="Loading offers…" />}
      {error && <ErrorNote message={error} onRetry={reload} />}
      {copyError && <Notice tone="error">{copyError}</Notice>}

      {data && coupons.length === 0 && (
        <EmptyState
          icon={Ticket}
          title="No offers right now"
          description="There are no active coupons at the moment. Check back soon for new deals."
        />
      )}

      {coupons.length > 0 && (
        <ul className="grid gap-5 md:grid-cols-2">
          {coupons.map((coupon) => (
            <li key={coupon.id}>
              <Card className="relative flex h-full flex-col gap-4 overflow-hidden">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-orange-500/15 blur-2xl" aria-hidden="true" />
                <div className="relative flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-black">
                    <Percent className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <Pill tone="orange">{discountLabel(coupon)}</Pill>
                </div>
                <div className="relative">
                  <p className="text-lg font-black">{coupon.title}</p>
                  {coupon.description && <p className="mt-1 text-sm text-zinc-400">{coupon.description}</p>}
                </div>
                <div className="relative mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
                  <div>
                    <p className="font-mono text-sm font-bold tracking-widest text-white">{coupon.code}</p>
                    <p className="text-xs text-zinc-500">{coupon.expiresAt ? `Valid until ${dateOnly(coupon.expiresAt)}` : "No expiry date"}</p>
                  </div>
                  <button type="button" onClick={() => copyCode(coupon.code)} className={secondaryButton}>
                    {copied === coupon.code ? <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" /> : <Copy className="h-4 w-4 text-orange-500" aria-hidden="true" />}
                    {copied === coupon.code ? "Copied" : "Copy code"}
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {coupons.length > 0 && (
        <p className="text-xs text-zinc-500">Coupons are not applied automatically at checkout yet.</p>
      )}
    </div>
  );
}
