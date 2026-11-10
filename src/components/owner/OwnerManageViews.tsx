"use client";

import { useState, type FormEvent } from "react";
import { OwnerHeading, useOwner } from "@/components/owner/OwnerShell";
import { formatPKR } from "@/lib/format";
import { ownerRequest, usePolled } from "@/lib/ownerApi";
import { ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, type OrderType, type PosPaymentMethod, type RestaurantTable, type SalesSummary } from "@/types/pos";

const input = "rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-[#ffd400]";
const primary = "rounded-full bg-[#ffd400] px-5 py-2 text-sm font-bold text-black disabled:opacity-50";

function FormMessage({ error, errors }: { error: string | null; errors?: Record<string, string> }) {
  if (!error) return null;
  const details = errors ? Object.values(errors) : [];
  return (
    <p role="alert" className="text-sm text-red-400">
      {details.length > 0 ? details.join(" ") : error}
    </p>
  );
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---- Employees -------------------------------------------------------------------------------------

type Staff = { id: string; name: string; phone: string; email: string; active: boolean; createdAt: string };

export function EmployeesView() {
  const staff = usePolled<{ staff: Staff[] }>("/api/owner/employees", 0);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ error: string; errors?: Record<string, string> } | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await ownerRequest("/api/owner/employees", "POST", form);
    setSaving(false);
    if (!result.ok) return setError(result);
    setForm({ name: "", phone: "", email: "" });
    void staff.reload();
  };
  const toggle = async (member: Staff) => {
    const result = await ownerRequest(`/api/owner/employees/${encodeURIComponent(member.id)}`, "PATCH", { active: !member.active });
    if (!result.ok) setError(result);
    void staff.reload();
  };

  return (
    <>
      <OwnerHeading title="Employees" subtitle="Waiters, cooks and other staff of your restaurant." />
      <form onSubmit={add} className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" aria-label="Name" className={input} />
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" aria-label="Phone" className={input} />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" aria-label="Email" type="email" className={input} />
        <button type="submit" disabled={saving} className={primary}>
          {saving ? "Adding…" : "Add employee"}
        </button>
        <div className="w-full">
          <FormMessage error={error?.error ?? null} errors={error?.errors} />
        </div>
      </form>
      {staff.error && !staff.data && <p className="text-sm text-red-400">{staff.error}</p>}
      <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-900">
        {(staff.data?.staff ?? []).map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">{m.name}</p>
              <p className="text-xs text-zinc-400">{[m.phone, m.email].filter(Boolean).join(" · ") || "No contact details"}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={m.active ? "text-xs font-semibold text-emerald-400" : "text-xs font-semibold text-zinc-500"}>{m.active ? "Active" : "Inactive"}</span>
              <button type="button" onClick={() => void toggle(m)} className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold hover:bg-zinc-800">
                {m.active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </li>
        ))}
        {staff.data && staff.data.staff.length === 0 && <li className="p-6 text-center text-sm text-zinc-400">No employees yet.</li>}
      </ul>
    </>
  );
}

// ---- Expenses --------------------------------------------------------------------------------------

type Expense = { id: string; supplier: string; description: string; amount: number; date: string };

export function ExpensesView() {
  const expenses = usePolled<{ expenses: Expense[] }>("/api/owner/expenses", 0);
  const [form, setForm] = useState({ supplier: "", description: "", amount: "", date: today() });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ error: string; errors?: Record<string, string> } | null>(null);
  const list = expenses.data?.expenses ?? [];

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await ownerRequest("/api/owner/expenses", "POST", { ...form, amount: Number(form.amount) });
    setSaving(false);
    if (!result.ok) return setError(result);
    setForm({ supplier: "", description: "", amount: "", date: form.date });
    void expenses.reload();
  };

  return (
    <>
      <OwnerHeading title="Expenses" subtitle={`Total recorded: ${formatPKR(list.reduce((s, x) => s + x.amount, 0))}`} />
      <form onSubmit={add} className="mb-6 flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <input required value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Paid to / supplier" aria-label="Supplier" className={input} />
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What for" aria-label="Description" className={input} />
        <input required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount (PKR)" aria-label="Amount" inputMode="numeric" type="number" min={0} className={`${input} w-36`} />
        <input required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" type="date" className={input} />
        <button type="submit" disabled={saving} className={primary}>
          {saving ? "Saving…" : "Add expense"}
        </button>
        <div className="w-full">
          <FormMessage error={error?.error ?? null} errors={error?.errors} />
        </div>
      </form>
      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-zinc-500">
              <th className="p-3">Date</th>
              <th className="p-3">Paid to</th>
              <th className="p-3">Description</th>
              <th className="p-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} className="border-t border-zinc-800">
                <td className="p-3">{x.date}</td>
                <td className="p-3">{x.supplier}</td>
                <td className="p-3 text-zinc-400">{x.description}</td>
                <td className="p-3 text-right font-semibold">{formatPKR(x.amount)}</td>
              </tr>
            ))}
            {expenses.data && list.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-zinc-400">No expenses recorded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---- Sales -----------------------------------------------------------------------------------------

export function SalesView() {
  const [range, setRange] = useState({ from: today(), to: today() });
  const sales = usePolled<{ sales: SalesSummary }>(`/api/owner/sales?from=${range.from}&to=${range.to}`, 30_000);
  const s = sales.data?.sales;

  return (
    <>
      <OwnerHeading
        title="Sales"
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input type="date" aria-label="From" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className={input} />
            <span className="text-zinc-500">to</span>
            <input type="date" aria-label="To" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className={input} />
          </div>
        }
      />
      {sales.error && <p role="alert" className="mb-4 text-sm text-red-400">{sales.error}</p>}
      {s && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Gross sales" value={formatPKR(s.grossSales)} hint={`${s.orders} orders`} />
            <Tile label="Paid" value={formatPKR(s.paidSales)} hint={`${s.paidOrders} orders`} />
            <Tile label="Unpaid" value={formatPKR(s.unpaidSales)} hint={`${s.unpaidOrders} orders`} />
            <Tile label="Net (paid − expenses)" value={formatPKR(s.paidSales - s.expenses)} hint={`Expenses ${formatPKR(s.expenses)}`} />
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="mb-3 font-bold">By order type</h2>
              <dl className="space-y-2 text-sm">
                {(Object.keys(s.byType) as OrderType[]).map((type) => (
                  <div key={type} className="flex justify-between">
                    <dt className="text-zinc-300">
                      {ORDER_TYPE_LABELS[type]} ({s.byType[type].orders})
                    </dt>
                    <dd className="font-semibold">{formatPKR(s.byType[type].sales)}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="mb-3 font-bold">Payments received</h2>
              <dl className="space-y-2 text-sm">
                {Object.entries(s.byMethod).map(([method, amount]) => (
                  <div key={method} className="flex justify-between">
                    <dt className="text-zinc-300">{PAYMENT_METHOD_LABELS[method as PosPaymentMethod] ?? method}</dt>
                    <dd className="font-semibold">{formatPKR(amount)}</dd>
                  </div>
                ))}
                {Object.keys(s.byMethod).length === 0 && <p className="text-zinc-400">No payments in this period.</p>}
                <p className="pt-2 text-xs text-zinc-500">{s.cancelledOrders} cancelled orders are not counted.</p>
              </dl>
            </section>
          </div>
          {s.days.length > 1 && (
            <section className="mt-6 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-zinc-500">
                    <th className="p-3">Day</th>
                    <th className="p-3 text-right">Orders</th>
                    <th className="p-3 text-right">Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {s.days.map((d) => (
                    <tr key={d.date} className="border-t border-zinc-800">
                      <td className="p-3">{d.date}</td>
                      <td className="p-3 text-right">{d.orders}</td>
                      <td className="p-3 text-right font-semibold">{formatPKR(d.sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
      <p className="text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

// ---- Settings --------------------------------------------------------------------------------------

type TableSettings = { tableCount: number; seats: number };
type SavedTableSettings = TableSettings & { created: number[]; removed: number[]; kept: number[] };

// What a save changed, in words.
function describeSave(s: SavedTableSettings): string {
  const parts = [`Saved: ${s.tableCount} ${s.tableCount === 1 ? "table" : "tables"}, ${s.seats} seats.`];
  if (s.created.length > 0) parts.push(`Added ${s.created.map((n) => `Table ${n}`).join(", ")}.`);
  if (s.removed.length > 0) parts.push(`Removed ${s.removed.map((n) => `Table ${n}`).join(", ")}.`);
  if (s.kept.length > 0) parts.push(`Kept ${s.kept.map((n) => `Table ${n}`).join(", ")}: open orders. Settle or cancel them, then save again.`);
  return parts.join(" ");
}

export function SettingsView() {
  const { owner, restaurant } = useOwner();
  const tables = usePolled<{ tables: RestaurantTable[] }>("/api/owner/tables", 0);
  const settings = usePolled<TableSettings>("/api/owner/settings", 0);
  // Form values; null means "not edited yet", so the saved value from the server is shown.
  const [form, setForm] = useState<{ tableCount: string | null; seats: string | null }>({ tableCount: null, seats: null });
  const tableCountValue = form.tableCount ?? (settings.data ? String(settings.data.tableCount) : "");
  const seatsValue = form.seats ?? (settings.data ? String(settings.data.seats) : "");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<{ error: string; errors?: Record<string, string> } | null>(null);
  const [busy, setBusy] = useState(false);

  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(null);
    const result = await ownerRequest<SavedTableSettings>("/api/owner/settings", "PUT", { tableCount: Number(tableCountValue), seats: Number(seatsValue) });
    setBusy(false);
    if (!result.ok) return setError(result);
    setForm({ tableCount: null, seats: null });
    setSaved(describeSave(result.data));
    void settings.reload();
    void tables.reload();
  };

  const addTable = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    const result = await ownerRequest("/api/owner/tables", "POST", { seats: settings.data?.seats ?? 4 });
    setBusy(false);
    if (!result.ok) setError(result);
    void settings.reload();
    void tables.reload();
  };
  const changeSeats = async (table: RestaurantTable, value: number) => {
    const result = await ownerRequest(`/api/owner/tables/${encodeURIComponent(table.id)}`, "PATCH", { seats: value });
    if (!result.ok) setError(result);
    void tables.reload();
  };
  const remove = async (table: RestaurantTable) => {
    if (!window.confirm(`Remove Table ${table.number}?`)) return;
    const result = await ownerRequest(`/api/owner/tables/${encodeURIComponent(table.id)}`, "DELETE");
    if (!result.ok) setError(result);
    void settings.reload();
    void tables.reload();
  };

  return (
    <>
      <OwnerHeading title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 font-bold">Restaurant</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-400">Name</dt>
              <dd className="font-semibold">{restaurant.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-400">Area</dt>
              <dd>{restaurant.area}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-400">Owner</dt>
              <dd>
                {owner.name} · {owner.email}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-zinc-500">
            The restaurant&apos;s name, area and owner are managed by the Admin. Token numbers restart at 1 every day; invoice numbers never repeat.
          </p>
        </section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="mb-3 font-bold">Tables</h2>
          <form onSubmit={saveSettings} className="mb-4 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Tables Number
              <input
                id="settings-tableCount"
                type="number"
                min={0}
                max={200}
                required
                value={tableCountValue}
                onChange={(e) => setForm({ ...form, tableCount: e.target.value })}
                className={`${input} w-24`}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-zinc-300">
              Seats
              <input
                id="settings-seats"
                type="number"
                min={1}
                max={50}
                required
                value={seatsValue}
                onChange={(e) => setForm({ ...form, seats: e.target.value })}
                className={`${input} w-20`}
              />
            </label>
            <button type="submit" disabled={busy || !settings.data} className={primary}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => void addTable()} disabled={busy || !settings.data} className="rounded-full border border-zinc-700 px-4 py-2 text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50">
              Add table
            </button>
          </form>
          <p className="mb-3 text-xs text-zinc-500">
            Saving creates Tables 1 to the number you enter, with that many seats each. Existing tables keep their own seats, and tables with open orders are never removed.
          </p>
          {saved && (
            <p role="status" className="mb-2 text-sm text-emerald-400">
              {saved}
            </p>
          )}
          {settings.error && !settings.data && <p className="text-sm text-red-400">{settings.error}</p>}
          <FormMessage error={error?.error ?? null} errors={error?.errors} />
          <ul className="mt-2 divide-y divide-zinc-800">
            {(tables.data?.tables ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-semibold">Table {t.number}</span>
                <span className="flex items-center gap-2">
                  <select
                    aria-label={`Seats at table ${t.number}`}
                    value={t.seats}
                    onChange={(e) => void changeSeats(t, Number(e.target.value))}
                    className={input}
                  >
                    {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} seats
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void remove(t)} className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold hover:border-red-400 hover:text-red-300">
                    Remove
                  </button>
                </span>
              </li>
            ))}
            {tables.data && tables.data.tables.length === 0 && <li className="py-3 text-sm text-zinc-400">No tables yet.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
