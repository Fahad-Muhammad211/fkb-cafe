import type { Order } from "@/types";

export const ORDER_STEPS = ["Placed", "Confirmed", "Preparing", "Out for Delivery", "Delivered"] as const;

const LAST_STEP = ORDER_STEPS.length - 1;

export const isCancelled = (order: Order) => order.status === "cancelled";
export const isAwaitingConfirmation = (order: Order) => order.status === "pending";

// Step shown for an order. Progress comes from the server: a pending order sits at "Placed", and a
// confirmed order is at least at "Confirmed". Cancelled orders report step 0 and show "Cancelled".
export function currentStepIndex(order: Order): number {
  if (isCancelled(order) || isAwaitingConfirmation(order)) return 0;
  return Math.min(LAST_STEP, Math.max(1, order.statusOverride ?? 1));
}

export function isDelivered(order: Order): boolean {
  return !isCancelled(order) && currentStepIndex(order) >= LAST_STEP;
}

// Text for a step. Pickup orders end at "Ready for Pickup", and a pending order's first step
// reads "Awaiting confirmation".
export function stepLabel(order: Order, index: number): string {
  if (isCancelled(order)) return "Cancelled";
  if (index === 0 && isAwaitingConfirmation(order)) return "Awaiting confirmation";
  if (index === 3 && order.fulfilment === "pickup") return "Ready for Pickup";
  return ORDER_STEPS[index];
}

// Label for the order's current state, used in lists and filters.
export function statusLabel(order: Order): string {
  return stepLabel(order, currentStepIndex(order));
}

// When each step was reached, from the server's history. Missing steps have no time yet.
export function stepTimes(order: Order): Map<number, string> {
  const times = new Map<number, string>();
  for (const event of order.history ?? []) {
    if (event.event === "placed") times.set(0, event.at);
    if (event.event === "confirmed") times.set(1, event.at);
    if (event.event === "progress" && event.step !== undefined) times.set(event.step, event.at);
  }
  return times;
}
