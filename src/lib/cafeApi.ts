import type { CafeHistory, CafeOrder, CafeSnapshot, CafeStaff, CafeStaffKind, WaiterStats } from "@/lib/cafeTypes";
import type { StockSnapshot } from "@/lib/stockTypes";
import type { DashboardData } from "@/lib/dashboardTypes";
import type { AttendanceRecord, AttendanceStatus, PayEntry, PayType, PayrollMonth, PayrollRow, StaffProfileData } from "@/lib/staffTypes";

// Browser-side client for the Admin cafe API (/api/admin/cafe/...). Every call needs an Admin session;
// the server checks it and prices every order from the saved menu.

export type CafeResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; errors?: Record<string, string> };

async function call<T>(url: string, method = "GET", body?: unknown): Promise<CafeResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string; errors?: Record<string, string> }) | null;
    if (!res.ok) return { ok: false, error: data?.error ?? "Something went wrong. Please try again.", errors: data?.errors };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}

export type ItemSelection = { productId: string; qty: number }[];

export const cafeApi = {
  snapshot: () => call<CafeSnapshot>("/api/admin/cafe"),
  setTableCount: (count: number) => call("/api/admin/cafe/tables", "PUT", { count }),
  addTable: () => call("/api/admin/cafe/tables", "POST", {}),
  addWaiter: (name: string, phone = "") => call("/api/admin/cafe/waiters", "POST", { name, phone }),
  removeWaiter: (id: string) => call(`/api/admin/cafe/waiters/${encodeURIComponent(id)}`, "DELETE"),
  assignTables: (waiterId: string, tableIds: string[]) => call(`/api/admin/cafe/waiters/${encodeURIComponent(waiterId)}/tables`, "PUT", { tableIds }),
  saveSettings: (prepAlertMinutes: number, tableAlertMinutes: number) => call("/api/admin/cafe/settings", "PUT", { prepAlertMinutes, tableAlertMinutes }),
  orderForTable: (tableId: string, items: ItemSelection) => call(`/api/admin/cafe/tables/${encodeURIComponent(tableId)}/order`, "POST", { items }),
  cleaned: (tableId: string) => call(`/api/admin/cafe/tables/${encodeURIComponent(tableId)}/cleaned`, "POST", {}),
  createTakeaway: (customerName: string, items: ItemSelection) => call("/api/admin/cafe/takeaway", "POST", { customerName, items }),
  ready: (orderId: string) => call(`/api/admin/cafe/orders/${encodeURIComponent(orderId)}/ready`, "POST", {}),
  complete: (orderId: string) => call(`/api/admin/cafe/orders/${encodeURIComponent(orderId)}/complete`, "POST", {}),
  history: (from: Date | null) => call<CafeHistory>(`/api/admin/cafe/history${since(from)}`),
};

const since = (from: Date | null) => (from ? `?from=${encodeURIComponent(from.toISOString())}` : "");
const id = encodeURIComponent;

export const waitersApi = {
  performance: (from: Date | null) => call<WaiterStats[]>(`/api/admin/waiters/performance${since(from)}`),
  orders: (waiterId: string, from: Date | null) => call<CafeOrder[]>(`/api/admin/waiters/${id(waiterId)}/orders${since(from)}`),
};

export const stockApi = {
  snapshot: () => call<StockSnapshot>("/api/admin/stock"),
  addItem: (body: { name: string; unit: string; lowLevel: number; quantity: number; totalCost: number }) => call("/api/admin/stock/items", "POST", body),
  updateItem: (itemId: string, body: { name?: string; lowLevel?: number }) => call(`/api/admin/stock/items/${id(itemId)}`, "PATCH", body),
  removeItem: (itemId: string) => call(`/api/admin/stock/items/${id(itemId)}`, "DELETE"),
  purchase: (itemId: string, body: { quantity: number; totalCost: number; note: string }) => call(`/api/admin/stock/items/${id(itemId)}/purchases`, "POST", body),
  usage: (itemId: string, body: { type: "usage" | "waste" | "adjustment"; quantity: number; note: string }) => call(`/api/admin/stock/items/${id(itemId)}/usage`, "POST", body),
  saveRecipe: (productId: string, lines: { itemId: string; qty: number }[]) => call(`/api/admin/stock/recipes/${id(productId)}`, "PUT", { lines }),
};

export type StaffInput = {
  name: string;
  title: string;
  duty: string;
  salary: string | number;
  phone: string;
  email?: string;
  password?: string;
  department?: string;
  shiftStart?: string;
  shiftEnd?: string;
  offDay?: string;
  joinedOn?: string;
  allowance?: string | number;
  cnic?: string;
  emergencyContact?: string;
};

export const hrApi = {
  attendance: (date: string) => call<AttendanceRecord[]>(`/api/admin/hr/attendance?date=${id(date)}`),
  checkIn: (staffId: string, date: string, time: string) => call<{ value: AttendanceRecord }>(`/api/admin/hr/attendance/${id(staffId)}`, "POST", { action: "in", date, time }),
  checkOut: (staffId: string, date: string, time: string) => call<{ value: AttendanceRecord }>(`/api/admin/hr/attendance/${id(staffId)}`, "POST", { action: "out", date, time }),
  setDay: (staffId: string, body: { date: string; status: AttendanceStatus; checkIn?: string | null; checkOut?: string | null; note?: string }) =>
    call<{ value: AttendanceRecord }>(`/api/admin/hr/attendance/${id(staffId)}`, "POST", { action: "set", ...body }),
  clearDay: (staffId: string, date: string) => call(`/api/admin/hr/attendance/${id(staffId)}`, "POST", { action: "clear", date }),
  payroll: (month: string) => call<PayrollMonth>(`/api/admin/hr/payroll?month=${id(month)}`),
  setPaid: (staffId: string, month: string, paid: boolean) => call<{ value: PayrollRow }>(`/api/admin/hr/payroll/${id(staffId)}`, "PUT", { month, paid }),
  addPay: (body: { staffId: string; date: string; type: PayType; amount: number | string; note: string }) => call<{ value: PayEntry }>("/api/admin/hr/pay", "POST", body),
  removePay: (payId: string) => call(`/api/admin/hr/pay/${id(payId)}`, "DELETE"),
  profile: (staffId: string, month: string) => call<StaffProfileData>(`/api/admin/hr/staff/${id(staffId)}?month=${id(month)}`),
};

export const staffApi = {
  list: () => call<CafeStaff[]>("/api/admin/cafe-staff"),
  add: (kind: CafeStaffKind, body: StaffInput) => call<{ value: CafeStaff }>("/api/admin/cafe-staff", "POST", { kind, ...body }),
  update: (staffId: string, body: Partial<StaffInput> & { active?: boolean }) => call(`/api/admin/cafe-staff/${id(staffId)}`, "PATCH", body),
  remove: (staffId: string) => call(`/api/admin/cafe-staff/${id(staffId)}`, "DELETE"),
};

export const dashboardApi = {
  read: (todayStart: Date) => call<DashboardData>(`/api/admin/dashboard?today=${encodeURIComponent(todayStart.toISOString())}`),
};
