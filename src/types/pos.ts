import type { Order } from "@/types";

// Types for the Owner dashboard, the restaurant POS and the Kitchen Display Screen.
//
// POS orders (dine-in and takeaway) and online orders from the website are the same kind of record:
// one document in the "orders" collection. These fields extend that record; nothing is copied into a
// second order store, so the Owner, Kitchen and Customer screens always read the same order.

// dine_in: linked to a table. takeaway: walk-in customer collects at the counter.
// online: placed by a customer on the website (delivery or pickup).
export type OrderType = "dine_in" | "takeaway" | "online";

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  dine_in: "Dine-in",
  takeaway: "Takeaway",
  online: "Online",
};

// Kitchen progress. It is derived from the order's status and fulfilment step (statusOverride), so
// there is only one progress field per order and every screen agrees on it.
export type KitchenStatus = "awaiting" | "pending" | "preparing" | "ready" | "served" | "delivered" | "cancelled";

export const KITCHEN_STATUS_LABELS: Record<KitchenStatus, string> = {
  awaiting: "Awaiting confirmation",
  pending: "Pending",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export type PosPaymentMethod = "cash" | "card" | "cod";

export const PAYMENT_METHOD_LABELS: Record<PosPaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  cod: "Cash on delivery",
};

export interface PaymentHistoryEntry {
  event: "created" | "paid" | "cancelled";
  amount: number;
  method: PosPaymentMethod;
  at: string;
  by: string;
}

export interface PaymentInfo {
  id: string;
  status: "pending" | "paid" | "cancelled";
  method: PosPaymentMethod;
  amount: number;
  paidAt: string | null;
  history: PaymentHistoryEntry[];
}

// An order as the Owner and Kitchen screens see it.
export interface PosOrder extends Order {
  orderType: OrderType;
  tableId?: string;
  tableNumber?: number;
  // Set once, when the order is confirmed. Never changed or reissued afterwards.
  invoiceNumber?: string;
  tokenNumber?: number;
  kitchenStatus: KitchenStatus;
  paymentInfo?: PaymentInfo;
}

export type TableStatus = "available" | "occupied" | "reserved";

export interface RestaurantTable {
  id: string;
  number: number;
  seats: number;
  reserved: boolean;
  status: TableStatus;
  // Unpaid, not-cancelled dine-in orders on this table.
  openOrders: { id: string; invoiceNumber?: string; tokenNumber?: number; total: number; kitchenStatus: KitchenStatus }[];
}

// One menu line sent by the POS. Prices are never sent: the server reads them from the menu.
// `choices` maps an option group ("size", "flavor", or an extra group such as "meal") to an option id.
export interface PosLineInput {
  itemId: string;
  qty: number;
  choices?: Record<string, string>;
  instructions?: string;
}

export interface SalesSummary {
  from: string;
  to: string;
  orders: number;
  paidOrders: number;
  unpaidOrders: number;
  cancelledOrders: number;
  grossSales: number;
  paidSales: number;
  unpaidSales: number;
  byType: Record<OrderType, { orders: number; sales: number }>;
  byMethod: Record<string, number>;
  expenses: number;
  days: { date: string; orders: number; sales: number }[];
}
