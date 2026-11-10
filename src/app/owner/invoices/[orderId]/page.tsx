import { Suspense } from "react";
import { OwnerGate } from "@/components/owner/OwnerShell";
import { InvoiceView } from "@/components/owner/InvoiceView";

async function InvoiceContent({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return (
    <OwnerGate bare>
      <InvoiceView orderId={decodeURIComponent(orderId)} />
    </OwnerGate>
  );
}

// Printable invoice, without the dashboard sidebar.
export default function OwnerInvoicePage({ params }: { params: Promise<{ orderId: string }> }) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-zinc-400">Loading invoice…</p>}>
      <InvoiceContent params={params} />
    </Suspense>
  );
}