import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
}

export interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface MenuCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  tagline?: string;
  // Optional tab photo (see CATEGORY_IMAGES in data/assets.ts); the icon is used otherwise.
  image?: string;
}

export interface ProductOption {
  id: string;
  label: string;
  priceDelta: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  pieces?: string;
  description?: string;
  badge?: string;
  image?: string;
  sizes?: ProductOption[];
  flavors?: ProductOption[];
  // Products are shown on the storefront unless explicitly switched off by an admin.
  available?: boolean;
  // "out" marks the product as sold out: it stays visible but cannot be added to the cart.
  stock?: "in" | "out";
}

// Category as saved in the database. The icon is stored by name (see ICON_MAP in data/menu).
export interface StoredCategory {
  id: string;
  label: string;
  tagline?: string;
  iconName: string;
}

export interface CartLine {
  id: string;
  itemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  total: number;
  options: string[];
  instructions: string;
}

export type FulfilmentType = "delivery" | "pickup";

export type PaymentMethod = "cod";

export interface CheckoutValues {
  name: string;
  phone: string;
  address: string;
  notes: string;
  fulfilment: FulfilmentType;
}

// pending: placed and waiting for the restaurant to confirm. confirmed: accepted, progress applies.
// cancelled: stopped by the customer or an admin.
export type OrderStatus = "pending" | "confirmed" | "cancelled";

// "paid" is only set after a verified payment-provider confirmation. No provider is configured yet,
// so orders never reach "paid" and cash-on-delivery orders stay "pending".
export type PaymentStatus = "pending" | "paid" | "cancelled";

export interface OrderEvent {
  event: "placed" | "confirmed" | "cancelled" | "progress";
  // Index into ORDER_STEPS, set for "progress" events.
  step?: number;
  at: string;
  actor: "customer" | "admin";
}

export interface Order {
  id: string;
  createdAt: string;
  updatedAt?: string;
  userId?: string;
  // Random id made in the browser, so a retried checkout cannot create a second order.
  clientOrderId?: string;
  customer: { name: string; phone: string; address: string; notes: string };
  fulfilment: FulfilmentType;
  payment: PaymentMethod;
  paymentStatus?: PaymentStatus;
  // Missing on orders saved in a browser before the server took over; treated as "confirmed".
  status?: OrderStatus;
  lines: CartLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  // Index into ORDER_STEPS for the fulfilment progress. Set by an admin once the order is confirmed.
  statusOverride?: number;
  history?: OrderEvent[];
  // The restaurant the customer chose at checkout. Missing on orders placed before restaurants existed.
  restaurantId?: string;
  restaurantName?: string;
  // The rider assigned to deliver this order, or null when none is assigned.
  riderId?: string | null;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
}
