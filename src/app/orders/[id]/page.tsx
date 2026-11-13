import { Suspense } from "react";
import type { Metadata } from "next";
import { PageFrame } from "@/components/layout/PageFrame";
import { OrderDetail } from "@/components/orders/OrderDetail";

export const metadata: Metadata = {
  title: "Track order | MEG Pakistan",
};

// Route params are only known at request time, so they are read inside Suspense
// to keep the static shell prerenderable.
async function OrderContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetail id={id} />;
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageFrame>
      <Suspense fallback={<p className="text-sm text-zinc-400">Loading order…</p>}>
        <OrderContent params={params} />
      </Suspense>
    </PageFrame>
  );
}
