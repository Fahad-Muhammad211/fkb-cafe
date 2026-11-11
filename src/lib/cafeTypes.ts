// Shapes shared by the cafe server module (lib/server/cafe.ts) and the Cafe, Takeaway and Dashboard screens.

export type CafeTableStatus = "free" | "occupied" | "cleaning";
export type CafeOrderStatus = "preparing" | "ready" | "completed";

export interface CafeTable {
  id: string;
  number: number;
  status: CafeTableStatus;
  waiterId: string | null;
  orderId: string | null;
  occupiedAt?: string;
  cleaningSince?: string;
}

// A waiter as the Cafe screen needs it (from the staff directory).
export interface CafeWaiter {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
}

export type CafeStaffKind = "manager" | "waiter" | "employee";

// One person in the cafe's staff directory (Employees page).
export interface CafeStaff {
  id: string;
  kind: CafeStaffKind;
  name: string;
  // Job title: "Manager", "Waiter", or for employees e.g. "Chef", "Cleaner", "Cashier".
  title: string;
  duty: string;
  // Monthly salary in PKR.
  salary: number;
  phone: string;
  active: boolean;
  // Managers only: their login account and email.
  accountId: string | null;
  email: string | null;
  createdAt: string;
}

export interface WaiterStats {
  id: string;
  name: string;
  active: boolean;
  // false when the waiter was removed; their past orders are still counted.
  current: boolean;
  tables: number[];
  totalOrders: number;
  openOrders: number;
  // Paid bills.
  totalBills: number;
  // Sum of paid bills.
  totalSales: number;
  averageBill: number;
  lastOrderAt: string | null;
}

export interface CafeOrderLine {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface CafeOrder {
  id: string;
  number: number;
  kind: "table" | "takeaway";
  tableId: string | null;
  tableNumber: number | null;
  waiterId: string | null;
  waiterName: string | null;
  customerName: string | null;
  items: CafeOrderLine[];
  total: number;
  status: CafeOrderStatus;
  // Order time: the timer starts here.
  createdAt: string;
  // When the food was served (table) or ready (takeaway). readyAt - createdAt is the preparation time.
  readyAt: string | null;
  // When the bill was paid.
  completedAt: string | null;
}

export interface CafeSettings {
  // An order still preparing after this many minutes is flagged.
  prepAlertMinutes: number;
  // A table occupied for longer than this is flagged.
  tableAlertMinutes: number;
}

export interface CafeSnapshot {
  tables: CafeTable[];
  waiters: CafeWaiter[];
  openOrders: CafeOrder[];
  settings: CafeSettings;
}

export interface CafeHistory {
  orders: CafeOrder[];
  totalOrders: number;
  completedOrders: number;
  tableOrders: number;
  takeawayOrders: number;
  revenue: number;
  averagePrepMs: number | null;
}
