import { Suspense } from "react";
import type { Metadata } from "next";
import { CustomerOrderDetail } from "@/components/customer/CustomerOrderDetail";

export const metadata: Metadata = {
  title: "Order tracking | Restaurant Management System",
  robots: { index: false, follow: false },
};

// Route params are only known at request time, so they are read inside Suspense (as in /orders/[id]).
// The order itself is fetched from the API with the customer's session, so another customer's order shows "not found".
async function OrderContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerOrderDetail id={id} />;
}

export default function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-400">Loading order…</p>}>
      <OrderContent params={params} />
    </Suspense>
  );
}
