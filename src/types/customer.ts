// Shapes shared by the customer dashboard API routes and its screens. Kept free of server imports so
// client components can use them too.

export const MAX_ADDRESSES = 10;

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  area: string;
  createdAt: string;
  updatedAt: string;
}

export const COMPLAINT_TOPICS = ["order", "delivery", "payment", "other"] as const;
export type ComplaintTopic = (typeof COMPLAINT_TOPICS)[number];

export const COMPLAINT_TOPIC_LABELS: Record<ComplaintTopic, string> = {
  order: "My order",
  delivery: "Delivery",
  payment: "Payment",
  other: "Something else",
};

export interface SupportTicket {
  id: string;
  topic: ComplaintTopic;
  orderId: string | null;
  message: string;
  status: "open";
  createdAt: string;
}

export interface CustomerNotification {
  id: string;
  orderId: string;
  title: string;
  message: string;
  at: string;
  unread: boolean;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  amount: number;
  method: "cod";
  status: "pending" | "paid" | "cancelled";
  orderStatus: "pending" | "confirmed" | "cancelled";
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string;
  percentOff: number | null;
  amountOff: number | null;
  expiresAt: string | null;
}
