"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bike, MapPin, Plus, Radio, Save } from "lucide-react";
import { customerRequest, useCustomerData, type CustomerRequestResult } from "@/components/customer/useCustomerData";
import { fieldClass, ghostClass, panelClass, Pill, primaryClass } from "@/components/admin/EmployeesView";
import { RestaurantLogo, type RestaurantCard } from "@/components/admin/RestaurantsView";
import { canAccess } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";
import { useSession } from "@/lib/local/useSession";
import { isCancelled, isDelivered, statusLabel } from "@/lib/orderStatus";
import type { Order } from "@/types";

// Owner-only detail page for one restaurant. Every table is that restaurant's data only: the server
// filters each list by the restaurant's ID. The page re-reads the data every few seconds, so rider
// positions and new orders appear without a reload.

interface StaffView {
  id: string;
  name: string;
  jobRole: string | null;
  phone: string;
  email: string;
  active: boolean;
}
interface GroceryView {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  available: number;
}
interface PurchaseView {
  id: string;
  supplier: string;
  description: string;
  amount: number;
  date: string;
}
interface AttendanceView {
  staffId: string;
  date: string;
  status: "present" | "absent";
  checkIn: string;
  checkOut: string;
}
interface RiderView {
  id: string;
  name: string;
  phone: string;
  status: "online" | "offline";
  lat: number | null;
  lng: number | null;
  locatedAt: string | null;
}
interface DetailResponse {
  restaurant: RestaurantCard;
  staff: StaffView[];
  orders: Order[];
  grocery: GroceryView[];
  purchases: PurchaseView[];
  attendance: AttendanceView[];
  attendanceDate: string;
  riders: RiderView[];
}

type Notice = { tone: "success" | "error"; text: string } | null;
type Act = <T = Record<string, unknown>>(method: "POST" | "PATCH" | "PUT", url: string, body: unknown, success?: string) => Promise<CustomerRequestResult<T>>;

const localToday = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
const money = (n: number) => `PKR ${n.toLocaleString("en-PK")}`;
const formatDateTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { dateStyle: "medium" });

// Pill colour for an order's current step (same labels as the Orders page and the customer timeline).
const orderTone = (order: Order) => (isCancelled(order) ? "red" : isDelivered(order) ? "green" : order.status === "pending" ? "zinc" : "orange");
// A rider's active deliveries: delivery orders assigned to them that are not cancelled or delivered yet.
const activeDeliveries = (orders: Order[], riderId: string) =>
  orders.filter((o) => o.riderId === riderId && o.fulfilment === "delivery" && !isCancelled(o) && !isDelivered(o));

export function RestaurantDetailGate({ restaurantId }: { restaurantId: string }) {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const allowed = status.state === "ready" && canAccess(status.value, "staff");

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
    else if (status.state === "ready" && !allowed) router.replace("/admin");
  }, [status.state, allowed, router]);

  if (status.state !== "ready") return <p className="text-sm text-zinc-400">Loading restaurant…</p>;
  if (!allowed) return null;
  return <RestaurantDetailView restaurantId={restaurantId} />;
}

function RestaurantDetailView({ restaurantId }: { restaurantId: string }) {
  const [attendanceDate, setAttendanceDate] = useState(localToday());
  const url = `/api/admin/restaurants/${encodeURIComponent(restaurantId)}?date=${attendanceDate}`;
  const detail = useCustomerData<DetailResponse>(url, { intervalMs: 5000, while: () => true });
  const [notice, setNotice] = useState<Notice>(null);
  const { reload } = detail;

  // Records live in this browser's storage. When another tab changes them (for example a rider's
  // device sharing its location), re-read at once instead of waiting for the next 5-second refresh.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith("meg-local:")) reload();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [reload]);

  const act: Act = async (method, requestUrl, body, success) => {
    const result = await customerRequest(requestUrl, method, body);
    if (!result.ok) setNotice({ tone: "error", text: result.error });
    else if (success) setNotice({ tone: "success", text: success });
    detail.reload();
    return result as CustomerRequestResult<never>;
  };

  const data = detail.data;
  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/restaurants" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-orange-400">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Restaurants
      </Link>

      {detail.error && !data && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {detail.error}
        </p>
      )}
      {!data && detail.loading && <p className="text-sm text-zinc-400">Loading restaurant…</p>}
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
          {notice.text}
        </p>
      )}

      {data && (
        <>
          <header className="flex flex-wrap items-center gap-4">
            <RestaurantLogo name={data.restaurant.name} logo={data.restaurant.logo} size="lg" />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Restaurant</p>
              <h1 className="text-3xl font-black tracking-tight md:text-4xl">{data.restaurant.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                <Pill tone="zinc">
                  <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  {data.restaurant.area}
                </Pill>
                <Pill tone={data.restaurant.managerName ? "orange" : "red"}>{data.restaurant.managerName ?? "No manager assigned"}</Pill>
              </div>
            </div>
          </header>

          <Section title="Orders" count={data.orders.length}>
            <OrdersTable orders={data.orders} riders={data.riders} act={act} />
          </Section>

          <Section title="Staff list" count={data.staff.length}>
            <StaffTable staff={data.staff} hasManager={Boolean(data.restaurant.managerId)} />
          </Section>

          <Section title="Grocery list" count={data.grocery.length}>
            <GroceryTable items={data.grocery} restaurantId={restaurantId} act={act} />
          </Section>

          <Section title="Purchase list" count={data.purchases.length}>
            <PurchasesTable purchases={data.purchases} restaurantId={restaurantId} act={act} />
          </Section>

          <Section title="Attendance" count={data.staff.length}>
            <AttendanceTable
              staff={data.staff}
              records={data.attendance}
              date={attendanceDate}
              onDateChange={setAttendanceDate}
              restaurantId={restaurantId}
              act={act}
            />
          </Section>

          <Section title="Rider tracking" count={data.riders.length}>
            <RiderTracking riders={data.riders} orders={data.orders} restaurantId={restaurantId} act={act} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className={`${panelClass} flex flex-col gap-4`} aria-label={title}>
      <h2 className="flex items-center gap-2 font-bold">
        {title} <span className="text-sm font-normal text-zinc-500">({count})</span>
      </h2>
      {children}
    </section>
  );
}

// Wraps a table so it scrolls sideways on phones instead of breaking the page.
function TableScroll({ children }: { children: ReactNode }) {
  return <div className="-mx-2 overflow-x-auto px-2"><table className="w-full min-w-[640px] text-left text-sm">{children}</table></div>;
}
const th = "border-b border-zinc-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500";
const td = "border-b border-zinc-900 px-3 py-3 align-middle text-zinc-200";
const empty = (text: string) => <p className="text-sm text-zinc-400">{text}</p>;

function OrdersTable({ orders, riders, act }: { orders: Order[]; riders: RiderView[]; act: Act }) {
  const [errorId, setErrorId] = useState<string | null>(null);
  if (orders.length === 0) return empty("No orders for this restaurant yet. Orders appear here when customers choose it at checkout.");
  return (
    <TableScroll>
      <thead>
        <tr>
          <th className={th}>Order</th>
          <th className={th}>Customer</th>
          <th className={th}>Status</th>
          <th className={th}>Amount</th>
          <th className={th}>Date</th>
          <th className={th}>Rider</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <td className={td}>
              <span className="font-mono text-xs">{order.id}</span>
              <p className="text-xs text-zinc-500">{order.fulfilment === "pickup" ? "Pick-up" : "Delivery"}</p>
            </td>
            <td className={td}>
              {order.customer.name}
              <p className="text-xs text-zinc-500">{order.customer.phone}</p>
            </td>
            <td className={td}>
              <Pill tone={orderTone(order)}>{statusLabel(order)}</Pill>
            </td>
            <td className={td}>{money(order.total)}</td>
            <td className={td}>{formatDateTime(order.createdAt)}</td>
            <td className={td}>
              {order.fulfilment === "delivery" ? (
                <select
                  aria-label={`Rider for order ${order.id}`}
                  value={order.riderId ?? ""}
                  onChange={async (e) => {
                    const result = await act("PATCH", `/api/admin/orders/${encodeURIComponent(order.id)}/rider`, { riderId: e.target.value || null }, "Rider updated.");
                    setErrorId(result.ok ? null : order.id);
                  }}
                  className="rounded-lg border border-zinc-700 bg-black px-2 py-1.5 text-xs text-white"
                >
                  <option value="">Not assigned</option>
                  {riders.map((rider) => (
                    <option key={rider.id} value={rider.id}>
                      {rider.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-zinc-500">Pick-up</span>
              )}
              {errorId === order.id && <p className="text-xs text-red-300">Could not assign this rider.</p>}
            </td>
          </tr>
        ))}
      </tbody>
    </TableScroll>
  );
}

function StaffTable({ staff, hasManager }: { staff: StaffView[]; hasManager: boolean }) {
  if (!hasManager) return empty("Assign a manager to this restaurant to see their staff.");
  if (staff.length === 0) return empty("No staff work under this restaurant's manager yet. Add staff from the manager's page under Employees.");
  return (
    <TableScroll>
      <thead>
        <tr>
          <th className={th}>Name</th>
          <th className={th}>Role</th>
          <th className={th}>Phone</th>
          <th className={th}>Email</th>
          <th className={th}>Status</th>
        </tr>
      </thead>
      <tbody>
        {staff.map((member) => (
          <tr key={member.id}>
            <td className={td}>{member.name}</td>
            <td className={td}>{member.jobRole ?? "No role"}</td>
            <td className={td}>{member.phone || "—"}</td>
            <td className={td}>{member.email || "—"}</td>
            <td className={td}>
              <Pill tone={member.active ? "green" : "red"}>{member.active ? "Active" : "Switched off"}</Pill>
            </td>
          </tr>
        ))}
      </tbody>
    </TableScroll>
  );
}

function GroceryTable({ items, restaurantId, act }: { items: GroceryView[]; restaurantId: string; act: Act }) {
  const [drafts, setDrafts] = useState<Record<string, { quantity: string; available: string }>>({});
  const [form, setForm] = useState({ name: "", unit: "", quantity: "", available: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addItem = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await act<{ item: GroceryView }>(
      "POST",
      `/api/admin/restaurants/${encodeURIComponent(restaurantId)}/grocery`,
      { name: form.name, unit: form.unit, quantity: Number(form.quantity), available: Number(form.available) },
      "Grocery item added.",
    );
    if (result.ok) {
      setForm({ name: "", unit: "", quantity: "", available: "" });
      setErrors({});
    } else setErrors(result.errors ?? { form: result.error });
  };

  const saveRow = async (item: GroceryView) => {
    const draft = drafts[item.id] ?? { quantity: String(item.quantity), available: String(item.available) };
    const result = await act("PATCH", `/api/admin/restaurants/${encodeURIComponent(restaurantId)}/grocery/${encodeURIComponent(item.id)}`, {
      quantity: Number(draft.quantity),
      available: Number(draft.available),
    }, `${item.name} updated.`);
    if (result.ok) setDrafts((d) => {
      const next = { ...d };
      delete next[item.id];
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {items.length === 0 ? (
        empty("No grocery items yet. Add the first item below.")
      ) : (
        <TableScroll>
          <thead>
            <tr>
              <th className={th}>Item</th>
              <th className={th}>Unit</th>
              <th className={th}>Quantity</th>
              <th className={th}>Available stock</th>
              <th className={th}>Save</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const draft = drafts[item.id] ?? { quantity: String(item.quantity), available: String(item.available) };
              return (
                <tr key={item.id}>
                  <td className={td}>{item.name}</td>
                  <td className={td}>{item.unit}</td>
                  <td className={td}>
                    <input
                      type="number"
                      min={0}
                      aria-label={`Quantity of ${item.name}`}
                      value={draft.quantity}
                      onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: { ...draft, quantity: e.target.value } }))}
                      className={`${fieldClass} w-28`}
                    />
                  </td>
                  <td className={td}>
                    <input
                      type="number"
                      min={0}
                      aria-label={`Available stock of ${item.name}`}
                      value={draft.available}
                      onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: { ...draft, available: e.target.value } }))}
                      className={`${fieldClass} w-28`}
                    />
                  </td>
                  <td className={td}>
                    <button type="button" onClick={() => saveRow(item)} className={ghostClass}>
                      <Save className="h-4 w-4 text-orange-500" aria-hidden="true" />
                      Save
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableScroll>
      )}

      <form onSubmit={addItem} noValidate className="grid gap-3 rounded-xl border border-zinc-800 bg-black/40 p-4 md:grid-cols-5">
        <TextInput id="grocery-name" label="Item" value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} />
        <TextInput id="grocery-unit" label="Unit" placeholder="kg, pcs" value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} error={errors.unit} />
        <TextInput id="grocery-quantity" label="Quantity" type="number" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} error={errors.quantity} />
        <TextInput id="grocery-available" label="Available" type="number" value={form.available} onChange={(v) => setForm({ ...form, available: v })} error={errors.available} />
        <div className="flex items-end">
          <button type="submit" className={primaryClass}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add item
          </button>
        </div>
        {errors.form && <p role="alert" className="text-sm text-red-300 md:col-span-5">{errors.form}</p>}
      </form>
    </div>
  );
}

function PurchasesTable({ purchases, restaurantId, act }: { purchases: PurchaseView[]; restaurantId: string; act: Act }) {
  const [form, setForm] = useState({ supplier: "", description: "", amount: "", date: localToday() });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const addPurchase = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await act(
      "POST",
      `/api/admin/restaurants/${encodeURIComponent(restaurantId)}/purchases`,
      { supplier: form.supplier, description: form.description, amount: Number(form.amount), date: form.date },
      "Purchase recorded.",
    );
    if (result.ok) {
      setForm({ supplier: "", description: "", amount: "", date: localToday() });
      setErrors({});
    } else setErrors(result.errors ?? { form: result.error });
  };

  return (
    <div className="flex flex-col gap-5">
      {purchases.length === 0 ? (
        empty("No purchases recorded yet. Record the first purchase below.")
      ) : (
        <TableScroll>
          <thead>
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Supplier</th>
              <th className={th}>Description</th>
              <th className={th}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td className={td}>{formatDate(p.date)}</td>
                <td className={td}>{p.supplier}</td>
                <td className={td}>{p.description || "—"}</td>
                <td className={td}>{money(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </TableScroll>
      )}

      <form onSubmit={addPurchase} noValidate className="grid gap-3 rounded-xl border border-zinc-800 bg-black/40 p-4 md:grid-cols-5">
        <TextInput id="purchase-supplier" label="Supplier" value={form.supplier} onChange={(v) => setForm({ ...form, supplier: v })} error={errors.supplier} />
        <TextInput id="purchase-description" label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} error={errors.description} />
        <TextInput id="purchase-amount" label="Amount (PKR)" type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} error={errors.amount} />
        <TextInput id="purchase-date" label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} error={errors.date} />
        <div className="flex items-end">
          <button type="submit" className={primaryClass}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Record purchase
          </button>
        </div>
        {errors.form && <p role="alert" className="text-sm text-red-300 md:col-span-5">{errors.form}</p>}
      </form>
    </div>
  );
}

function AttendanceTable({
  staff,
  records,
  date,
  onDateChange,
  restaurantId,
  act,
}: {
  staff: StaffView[];
  records: AttendanceView[];
  date: string;
  onDateChange: (d: string) => void;
  restaurantId: string;
  act: Act;
}) {
  const [rows, setRows] = useState<Record<string, { status: "present" | "absent" | ""; checkIn: string; checkOut: string }>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const current = (staffId: string) => {
    const saved = records.find((r) => r.staffId === staffId);
    return rows[staffId] ?? { status: saved?.status ?? "", checkIn: saved?.checkIn ?? "", checkOut: saved?.checkOut ?? "" };
  };
  const setRow = (staffId: string, patch: Partial<{ status: "present" | "absent" | ""; checkIn: string; checkOut: string }>) =>
    setRows((r) => ({ ...r, [staffId]: { ...current(staffId), ...patch } }));

  const save = async (member: StaffView) => {
    const row = current(member.id);
    if (!row.status) {
      setRowErrors((e) => ({ ...e, [member.id]: "Choose present or absent." }));
      return;
    }
    const result = await act(
      "PUT",
      `/api/admin/restaurants/${encodeURIComponent(restaurantId)}/attendance`,
      { staffId: member.id, date, status: row.status, checkIn: row.checkIn, checkOut: row.checkOut },
      `${member.name}'s attendance saved.`,
    );
    setRowErrors((e) => ({ ...e, [member.id]: result.ok ? "" : result.errors ? Object.values(result.errors)[0] : result.error }));
    if (result.ok) setRows((r) => {
      const next = { ...r };
      delete next[member.id];
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <TextInput id="attendance-date" label="Date" type="date" value={date} onChange={onDateChange} />
        <p className="pb-2 text-sm text-zinc-400">Choose present or absent for each person, then save the row.</p>
      </div>
      {staff.length === 0 ? (
        empty("No staff to mark yet. Staff appear here once they work under this restaurant's manager.")
      ) : (
        <TableScroll>
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Status</th>
              <th className={th}>Check-in</th>
              <th className={th}>Check-out</th>
              <th className={th}>Save</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => {
              const row = current(member.id);
              const saved = records.find((r) => r.staffId === member.id);
              return (
                <tr key={member.id}>
                  <td className={td}>
                    {member.name}
                    <p className="text-xs text-zinc-500">{saved ? `Saved: ${saved.status}` : "Not marked"}</p>
                  </td>
                  <td className={td}>
                    <select aria-label={`Status of ${member.name}`} value={row.status} onChange={(e) => setRow(member.id, { status: e.target.value as "present" | "absent" | "" })} className={`${fieldClass} w-32`}>
                      <option value="">Not marked</option>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                    </select>
                  </td>
                  <td className={td}>
                    <input type="time" aria-label={`Check-in of ${member.name}`} disabled={row.status !== "present"} value={row.checkIn} onChange={(e) => setRow(member.id, { checkIn: e.target.value })} className={`${fieldClass} w-32`} />
                  </td>
                  <td className={td}>
                    <input type="time" aria-label={`Check-out of ${member.name}`} disabled={row.status !== "present"} value={row.checkOut} onChange={(e) => setRow(member.id, { checkOut: e.target.value })} className={`${fieldClass} w-32`} />
                  </td>
                  <td className={td}>
                    <button type="button" onClick={() => save(member)} className={ghostClass}>
                      <Save className="h-4 w-4 text-orange-500" aria-hidden="true" />
                      Save
                    </button>
                    {rowErrors[member.id] && <p className="mt-1 text-xs text-red-300">{rowErrors[member.id]}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableScroll>
      )}
    </div>
  );
}

function RiderTracking({ riders, orders, restaurantId, act }: { riders: RiderView[]; orders: Order[]; restaurantId: string; act: Act }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const selected = riders.find((r) => r.id === selectedId) ?? riders.find((r) => r.lat !== null) ?? null;

  const addRider = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const result = await act("POST", `/api/admin/restaurants/${encodeURIComponent(restaurantId)}/riders`, form, "Rider added.");
    if (result.ok) {
      setForm({ name: "", phone: "" });
      setErrors({});
    } else setErrors(result.errors ?? { form: result.error });
  };

  return (
    <div className="flex flex-col gap-5">
      {riders.length === 0 ? (
        empty("No riders yet. Add a rider below to track their deliveries.")
      ) : (
        <TableScroll>
          <thead>
            <tr>
              <th className={th}>Rider</th>
              <th className={th}>Status</th>
              <th className={th}>Last location</th>
              <th className={th}>Assigned deliveries</th>
              <th className={th}>Map</th>
            </tr>
          </thead>
          <tbody>
            {riders.map((rider) => {
              const assigned = activeDeliveries(orders, rider.id);
              return (
                <tr key={rider.id}>
                  <td className={td}>
                    <span className="inline-flex items-center gap-2"><Bike className="h-4 w-4 text-orange-500" aria-hidden="true" />{rider.name}</span>
                    <p className="text-xs text-zinc-500">{rider.phone}</p>
                  </td>
                  <td className={td}>
                    <select
                      aria-label={`Status of ${rider.name}`}
                      value={rider.status}
                      onChange={(e) => act("PATCH", `/api/admin/riders/${encodeURIComponent(rider.id)}`, { status: e.target.value }, `${rider.name} is now ${e.target.value}.`)}
                      className={`${fieldClass} w-32`}
                    >
                      <option value="online">Online</option>
                      <option value="offline">Offline</option>
                    </select>
                  </td>
                  <td className={td}>
                    {rider.lat !== null && rider.lng !== null ? (
                      <>
                        {rider.lat.toFixed(5)}, {rider.lng.toFixed(5)}
                        <p className="text-xs text-zinc-500">{rider.locatedAt ? formatDateTime(rider.locatedAt) : ""}</p>
                      </>
                    ) : (
                      <span className="text-zinc-500">No location shared yet</span>
                    )}
                  </td>
                  <td className={td}>
                    {assigned.length === 0 ? (
                      <span className="text-zinc-500">None</span>
                    ) : (
                      <>
                        {assigned.length}
                        <p className="font-mono text-xs text-zinc-500">{assigned.map((o) => o.id).join(", ")}</p>
                      </>
                    )}
                  </td>
                  <td className={td}>
                    <div className="flex flex-col items-start gap-2">
                      <button type="button" onClick={() => setSelectedId(rider.id)} className={ghostClass}>
                        <MapPin className="h-4 w-4 text-orange-500" aria-hidden="true" />
                        Show on map
                      </button>
                      <LocationSharer rider={rider} act={act} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableScroll>
      )}

      <RiderMap rider={selected} />

      <form onSubmit={addRider} noValidate className="grid gap-3 rounded-xl border border-zinc-800 bg-black/40 p-4 md:grid-cols-3">
        <TextInput id="rider-name" label="Rider name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} error={errors.name} />
        <TextInput id="rider-phone" label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} error={errors.phone} />
        <div className="flex items-end">
          <button type="submit" className={primaryClass}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add rider
          </button>
        </div>
        {errors.form && <p role="alert" className="text-sm text-red-300 md:col-span-3">{errors.form}</p>}
      </form>
    </div>
  );
}

// Shares this browser's GPS position as the rider's location. Only the browser that is sharing knows the
// position, so the map updates on any device that is open to this page while sharing is on.
function LocationSharer({ rider, act }: { rider: RiderView; act: Act }) {
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const lastSent = useRef(0);

  useEffect(() => {
    if (!sharing || typeof navigator === "undefined" || !navigator.geolocation) return;
    // Send at most one update every 5 seconds. A position that arrives sooner is kept and sent when
    // the 5 seconds are up, so the map always ends on the rider's latest position.
    let latest: { lat: number; lng: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const send = async () => {
      timer = null;
      if (!latest) return;
      const position = latest;
      latest = null;
      lastSent.current = Date.now();
      const result = await act("PUT", `/api/admin/riders/${encodeURIComponent(rider.id)}/location`, position);
      setMessage(result.ok ? "Sharing location." : result.error);
    };
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        latest = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (timer) return;
        const wait = 5000 - (Date.now() - lastSent.current);
        if (wait <= 0) void send();
        else timer = setTimeout(send, wait);
      },
      (err) => {
        // Only a refused permission ends sharing. A lost GPS signal or a timeout is temporary: the
        // watch keeps running and sends the next position the device reports.
        if (err.code === err.PERMISSION_DENIED) {
          setMessage("Location permission was denied.");
          setSharing(false);
        } else setMessage("Waiting for this device's location…");
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      if (timer) clearTimeout(timer);
    };
    // act changes every render; sharing and the rider decide when the watch starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, rider.id]);

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => {
          if (!sharing && (typeof navigator === "undefined" || !navigator.geolocation)) {
            setMessage("This browser cannot share a location.");
            return;
          }
          setSharing((s) => !s);
        }}
        className={ghostClass}
        aria-pressed={sharing}
      >
        <Radio className={`h-4 w-4 ${sharing ? "text-emerald-400" : "text-orange-500"}`} aria-hidden="true" />
        {sharing ? "Stop sharing" : "Share this device's location"}
      </button>
      {message && <p className="text-xs text-zinc-400">{message}</p>}
    </div>
  );
}

function RiderMap({ rider }: { rider: RiderView | null }) {
  if (!rider || rider.lat === null || rider.lng === null) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-zinc-700 bg-black/40 text-sm text-zinc-500">
        {rider ? `${rider.name} has not shared a location yet.` : "Share a rider's location to see them on the map."}
      </div>
    );
  }
  const d = 0.01;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${rider.lng - d},${rider.lat - d},${rider.lng + d},${rider.lat + d}&layer=mapnik&marker=${rider.lat},${rider.lng}`;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-zinc-300">
        {rider.name} · {rider.status} · updated {rider.locatedAt ? formatDateTime(rider.locatedAt) : "just now"}
      </p>
      <iframe title={`Map of ${rider.name}`} src={src} className="h-72 w-full rounded-xl border border-zinc-800" loading="lazy" />
    </div>
  );
}

function TextInput({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </label>
      <input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} className={fieldClass} />
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
