import { formatPKR } from "@/lib/format";
import { isCancelled, isDelivered, statusLabel } from "@/lib/orderStatus";
import type { Order, PaymentStatus } from "@/types";

// Display helpers shared by the customer dashboard pages.

export const dateTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
export const dateOnly = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { dateStyle: "medium" });
export const timeOnly = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export const money = formatPKR;

export function itemCount(order: Order): number {
  return order.lines.reduce((sum, line) => sum + line.qty, 0);
}

// "2 × Chicken Burger, 1 × Fries" with a "+N more" tail for long orders.
export function itemSummary(order: Order, max = 3): string {
  const parts = order.lines.slice(0, max).map((line) => `${line.qty} × ${line.name}`);
  const extra = order.lines.length - max;
  return extra > 0 ? `${parts.join(", ")} +${extra} more` : parts.join(", ");
}

// Delivery status tone: cancelled red, delivered green, everything else orange.
export function deliveryTone(order: Order): "red" | "green" | "orange" {
  if (isCancelled(order)) return "red";
  if (isDelivered(order)) return "green";
  return "orange";
}

export const deliveryLabel = (order: Order) => statusLabel(order);

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  pending: "Pay on delivery",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const PAYMENT_TONE: Record<PaymentStatus, "orange" | "green" | "red"> = {
  pending: "orange",
  paid: "green",
  cancelled: "red",
};

export const paymentOf = (order: Order): PaymentStatus => order.paymentStatus ?? "pending";

// Customers may cancel only a pending order; the server enforces the same rule.
export const canCustomerCancel = (order: Order) => order.status === "pending";

// Active = not cancelled and not yet delivered.
export const isActiveOrder = (order: Order) => !isCancelled(order) && !isDelivered(order);
