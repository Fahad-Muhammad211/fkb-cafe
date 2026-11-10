"use client";

import { Printer } from "lucide-react";
import { useOwner } from "@/components/owner/OwnerShell";
import { formatPKR } from "@/lib/format";
import { usePolled } from "@/lib/ownerApi";
import { ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, type PosOrder } from "@/types/pos";

// Printable receipt for one order. It shows the order's one invoice number and token, read from the
// server, so a reprint is always the same invoice.
export function InvoiceView({ orderId }: { orderId: string }) {
  const { restaurant } = useOwner();
  const result = usePolled<{ order: PosOrder }>(`/api/owner/orders/${encodeURIComponent(orderId)}`, 0);
  const order = result.data?.order;

  if (!order) {
    return <p className="p-8 text-center text-sm text-zinc-400">{result.error ?? "Loading invoice…"}</p>;
  }
  if (!order.invoiceNumber) {
    return <p className="p-8 text-center text-sm text-zinc-400">This order has no invoice yet. Confirm it first.</p>;
  }
  const created = new Date(order.createdAt);
  const payment = order.paymentInfo;
  const paid = order.paymentStatus === "paid";

  return (
    <div className="min-h-dvh bg-zinc-200 px-4 py-8 text-black print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-sm justify-end print:hidden">
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-bold text-white">
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </button>
      </div>
      <article className="mx-auto max-w-sm bg-white p-6 font-mono text-sm shadow print:max-w-none print:shadow-none">
        <header className="text-center">
          <p className="text-lg font-bold uppercase">{restaurant.name}</p>
          <p className="text-xs">{restaurant.area}</p>
          <p className="mt-3 text-xs uppercase tracking-widest">Invoice</p>
        </header>
        <div className="my-4 border-y-2 border-dashed border-black py-3 text-center">
          <p className="text-xs uppercase">Token</p>
          <p className="text-4xl font-black">{order.tokenNumber}</p>
        </div>
        <dl className="space-y-0.5 text-xs">
          <Row label="Invoice No." value={order.invoiceNumber} />
          <Row label="Order No." value={order.id} />
          <Row label="Order type" value={`${ORDER_TYPE_LABELS[order.orderType]}${order.orderType === "online" ? ` (${order.fulfilment})` : ""}`} />
          {order.tableNumber !== undefined && <Row label="Table" value={String(order.tableNumber)} />}
          <Row label="Date" value={created.toLocaleDateString("en-GB")} />
          <Row label="Time" value={created.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} />
          <Row label="Customer" value={order.customer.name} />
          {order.customer.phone && <Row label="Phone" value={order.customer.phone} />}
        </dl>
        <table className="mt-4 w-full text-xs">
          <thead>
            <tr className="border-b border-dashed border-black text-left">
              <th className="py-1">Item</th>
              <th className="py-1 text-right">Qty</th>
              <th className="py-1 text-right">Rate</th>
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id} className="align-top">
                <td className="py-1 pr-1">
                  {line.name}
                  {line.options.length > 0 && <span className="block text-[10px]">{line.options.join(", ")}</span>}
                </td>
                <td className="py-1 text-right">{line.qty}</td>
                <td className="py-1 text-right">{line.unitPrice.toLocaleString("en-US")}</td>
                <td className="py-1 text-right">{line.total.toLocaleString("en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-2 space-y-0.5 border-t border-dashed border-black pt-2 text-xs">
          <Row label="Subtotal" value={formatPKR(order.subtotal)} />
          {order.deliveryFee > 0 && <Row label="Delivery fee" value={formatPKR(order.deliveryFee)} />}
          <div className="flex justify-between pt-1 text-base font-bold">
            <dt>TOTAL</dt>
            <dd>{formatPKR(order.total)}</dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-dashed border-black pt-2 text-center text-xs font-bold uppercase">
          {order.status === "cancelled" ? "Cancelled" : paid ? `Paid · ${payment ? PAYMENT_METHOD_LABELS[payment.method] : ""}` : "Unpaid"}
        </p>
        {paid && payment?.paidAt && <p className="text-center text-[10px]">Paid at {new Date(payment.paidAt).toLocaleString("en-GB")}</p>}
        <p className="mt-4 text-center text-[10px]">Thank you!</p>
      </article>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
