"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, Eye, Pencil, Power, Search, ShieldCheck, Trash2, UserPlus, Users, Wallet } from "lucide-react";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import { DeleteOwnerDialog, dangerClass } from "@/components/admin/DeleteOwnerDialog";
import { Button, Dialog, ErrorNote } from "@/components/admin/cafe/CafeParts";
import { staffApi, type StaffInput } from "@/lib/cafeApi";
import type { CafeStaff, CafeStaffKind } from "@/lib/cafeTypes";
import type { StaffRole } from "@/lib/permissions";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { DEPARTMENTS, WEEKDAYS, type Department } from "@/lib/staffTypes";
import { AttendanceTab } from "@/components/admin/staff/AttendanceTab";
import { PayrollTab } from "@/components/admin/staff/PayrollTab";
import { StaffProfileDialog } from "@/components/admin/staff/StaffProfileDialog";
import { Field, Notice, Stat, formatTime12, inputClass } from "@/components/admin/staff/hrParts";

// Employees page (Owner only): the whole team with department, job title, shift, duties, salary,
// allowance and contact details, plus daily attendance and the monthly payroll with tips and bonuses. A Manager also gets a login with operational access to the Admin
// dashboard (tables, takeaway, orders, stock, waiter performance). Restaurant login accounts made
// before this page changed are listed at the bottom so they can still be switched off or deleted.

export const fieldClass =
  "w-full rounded-xl border border-zinc-700 bg-black px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none aria-[invalid=true]:border-red-500";

export const panelClass = "rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black p-5 shadow-xl shadow-black/40 md:p-6";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50";
export const primaryClass = `${buttonClass} bg-orange-500 font-bold text-black hover:bg-orange-400`;
export const ghostClass = `${buttonClass} border border-zinc-700 text-white hover:border-orange-500/60 hover:bg-zinc-800`;

export function Pill({ tone, children }: { tone: "orange" | "zinc" | "red" | "green"; children: ReactNode }) {
  const tones = {
    orange: "bg-orange-500/15 text-orange-400 ring-orange-500/30",
    zinc: "bg-zinc-800 text-zinc-300 ring-zinc-700",
    red: "bg-red-500/15 text-red-400 ring-red-500/30",
    green: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  } as const;
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>{children}</span>;
}

// A restaurant from the Restaurants page (the fields of Restaurant in lib/server/restaurants.ts used here).
export interface RestaurantOption {
  id: string;
  name: string;
  area: string;
}

const KIND_LABEL: Record<CafeStaffKind, string> = { manager: "Manager", waiter: "Waiter", employee: "Employee" };
const KIND_TONE: Record<CafeStaffKind, string> = {
  manager: "bg-[#ffd400]/15 text-[#ffd400]",
  waiter: "bg-emerald-500/15 text-emerald-300",
  employee: "bg-sky-500/15 text-sky-300",
};
// Suggested titles per department for the add/edit form.
const TITLE_HINTS: Record<string, string> = {
  Management: "e.g. General Manager, Floor Manager, Shift Supervisor",
  Kitchen: "e.g. Head Chef, Sous Chef, Grill Cook, Tandoor Cook, Dishwasher",
  Service: "e.g. Head Waiter, Waiter, Host / Hostess, Busser",
  "Cash & Front desk": "e.g. Cashier, Receptionist",
  Cleaning: "e.g. Cleaner, Janitor",
  Delivery: "e.g. Rider, Delivery Driver",
  Security: "e.g. Security Guard, Valet",
};

type Tab = "directory" | "attendance" | "payroll";
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: "directory", label: "Staff directory", icon: <Users className="h-4 w-4" aria-hidden="true" /> },
  { id: "attendance", label: "Attendance", icon: <CalendarCheck className="h-4 w-4" aria-hidden="true" /> },
  { id: "payroll", label: "Payroll & tips", icon: <Wallet className="h-4 w-4" aria-hidden="true" /> },
];

export function EmployeesView({ currentId }: { currentId: string }) {
  const [staff, setStaff] = useState<CafeStaff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("directory");
  const [department, setDepartment] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<CafeStaffKind | null>(null);
  const [editing, setEditing] = useState<CafeStaff | null>(null);
  const [viewing, setViewing] = useState<CafeStaff | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await staffApi.list();
    if (res.ok) {
      setStaff(res.data);
      setError(null);
      // Keep an open profile in step with saved changes.
      setViewing((v) => (v ? (res.data.find((s) => s.id === v.id) ?? null) : v));
    } else setError(res.error);
  }, []);
  useEffect(() => {
    let alive = true;
    void staffApi.list().then((res) => {
      if (!alive) return;
      if (res.ok) setStaff(res.data);
      else setError(res.error);
    });
    return () => {
      alive = false;
    };
  }, []);

  const act = async (member: CafeStaff, action: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setBusyId(member.id);
    const res = await action();
    await load();
    setBusyId(null);
    setNotice(res.ok ? { tone: "ok", text: done } : { tone: "error", text: res.error ?? "Something went wrong." });
  };

  const all = [...(staff ?? [])].sort(
    (a, b) => DEPARTMENTS.indexOf(a.department as Department) - DEPARTMENTS.indexOf(b.department as Department) || a.code.localeCompare(b.code),
  );
  const q = query.trim().toLowerCase();
  const list = all.filter((s) => (department === "all" || s.department === department) && (!q || [s.name, s.title, s.code, s.phone].some((v) => v.toLowerCase().includes(q))));
  const active = all.filter((s) => s.active);
  const salaryBill = active.reduce((sum, s) => sum + s.salary + s.allowance, 0);
  const departments = DEPARTMENTS.filter((d) => all.some((s) => s.department === d));

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Team</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Employees</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Your whole team: profiles, shifts, attendance, salaries, tips and payroll. Managers can also get a Gmail login with operational access.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAdding("manager")}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Add Manager
          </Button>
          <Button tone="ghost" onClick={() => setAdding("employee")}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Add Employee
          </Button>
          <Button tone="ghost" onClick={() => setAdding("waiter")}>
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Add Waiter
          </Button>
        </div>
      </header>

      <Notice notice={notice} />
      <ErrorNote message={error} />
      {!staff && !error && <p className="text-sm text-zinc-400">Loading team…</p>}

      {staff && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Active staff" value={String(active.length)} note={`${all.length - active.length} switched off`} />
            <Stat label="Monthly salary bill" value={formatPKR(salaryBill)} note="Salaries + allowances" />
            <Stat label="Departments" value={String(departments.length)} note={departments.slice(0, 3).join(", ")} />
            <Stat label="Waiters" value={String(active.filter((s) => s.kind === "waiter").length)} note={`${active.filter((s) => s.kind === "manager").length} managers`} />
          </div>

          <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div role="tablist" aria-label="Employees sections" className="flex w-fit flex-wrap gap-1 rounded-full bg-zinc-950 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn("inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold", tab === t.id ? "bg-[#ffd400] text-black" : "text-zinc-300 hover:text-white")}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "attendance" && <AttendanceTab staff={all} onOpenProfile={setViewing} />}
            {tab === "payroll" && <PayrollTab staff={all} onOpenProfile={setViewing} />}
            {tab === "directory" && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1">
                    {["all", ...departments].map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={department === d}
                        onClick={() => setDepartment(d)}
                        className={cn("rounded-full px-3 py-1.5 text-xs font-bold", department === d ? "bg-white text-black" : "bg-zinc-950 text-zinc-300 hover:text-white")}
                      >
                        {d === "all" ? "All" : d} ({d === "all" ? all.length : all.filter((s) => s.department === d).length})
                      </button>
                    ))}
                  </div>
                  <label className="relative">
                    <span className="sr-only">Search staff</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, title, ID" className={cn(inputClass, "w-56 pl-9")} />
                  </label>
                </div>
                {list.length === 0 ? (
                  <p className="text-sm text-zinc-500">{all.length ? "No one matches." : "No one here yet. Use the buttons above to add your team."}</p>
                ) : (
                  <div className="-mx-5 overflow-x-auto px-5">
                    <table className="w-full min-w-[1120px] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                        <tr>
                          <th className="py-2 pr-3 font-semibold">Employee</th>
                          <th className="py-2 pr-3 font-semibold">Role</th>
                          <th className="py-2 pr-3 font-semibold">Shift</th>
                          <th className="py-2 pr-3 font-semibold">Duties</th>
                          <th className="py-2 pr-3 text-right font-semibold">Pay / month</th>
                          <th className="py-2 pr-3 font-semibold">Contact</th>
                          <th className="py-2 pr-3 font-semibold">Status</th>
                          <th className="py-2 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {list.map((s) => (
                          <tr key={s.id} className={cn(!s.active && "opacity-60")}>
                            <td className="py-3 pr-3">
                              <button type="button" onClick={() => setViewing(s)} className="whitespace-nowrap text-left font-semibold hover:text-[#ffd400]">
                                {s.name}
                              </button>
                              <span className="block whitespace-nowrap text-xs text-zinc-500">
                                {s.code || "—"} · since {s.joinedOn ? new Date(`${s.joinedOn}T00:00:00`).toLocaleDateString([], { month: "short", year: "numeric" }) : "—"}
                              </span>
                            </td>
                            <td className="py-3 pr-3">
                              <span className="whitespace-nowrap font-semibold text-zinc-200">{s.title}</span>
                              <span className="mt-1 flex items-center gap-1.5">
                                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", KIND_TONE[s.kind])}>{KIND_LABEL[s.kind]}</span>
                                <span className="text-xs text-zinc-500">{s.department}</span>
                              </span>
                            </td>
                            <td className="whitespace-nowrap py-3 pr-3 text-xs text-zinc-400">
                              {formatTime12(s.shiftStart)} – {formatTime12(s.shiftEnd)}
                              <span className="block">{s.offDay ? `Off ${s.offDay}` : "No fixed day off"}</span>
                            </td>
                            <td className="py-3 pr-3 text-xs text-zinc-400">
                              <span title={s.duty} className="line-clamp-2 w-56">
                                {s.duty || "—"}
                              </span>
                            </td>
                            <td className="whitespace-nowrap py-3 pr-3 text-right tabular-nums">
                              {s.salary ? formatPKR(s.salary) : "—"}
                              {s.allowance > 0 && <span className="block text-xs text-zinc-500">+ {formatPKR(s.allowance)} allowance</span>}
                            </td>
                            <td className="py-3 pr-3 text-xs text-zinc-400">
                              {s.phone || "—"}
                              {s.email && <span className="block text-zinc-500">Login: {s.email}</span>}
                            </td>
                            <td className="py-3 pr-3">
                              <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", s.active ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400")}>
                                {s.active ? "Active" : "Switched off"}
                              </span>
                            </td>
                            <td className="py-3">
                              <div className="flex justify-end gap-1">
                                <Button tone="ghost" className="px-2.5 py-1.5 text-xs" onClick={() => setViewing(s)}>
                                  <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Profile
                                </Button>
                                <Button tone="ghost" className="px-2.5 py-1.5" onClick={() => setEditing(s)} ariaLabel={`Edit ${s.name}`}>
                                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                                <Button
                                  tone="ghost"
                                  className="px-2.5 py-1.5"
                                  disabled={busyId === s.id}
                                  ariaLabel={s.active ? `Switch ${s.name} off` : `Switch ${s.name} on`}
                                  onClick={() => {
                                    if (
                                      !window.confirm(
                                        s.active
                                          ? `Switch ${s.name} off?${s.kind === "manager" ? " Their login stops working at once." : s.kind === "waiter" ? " Their tables become unassigned." : ""}`
                                          : `Switch ${s.name} back on?`,
                                      )
                                    )
                                      return;
                                    void act(s, () => staffApi.update(s.id, { active: !s.active }), `${s.name} is now ${s.active ? "switched off" : "active"}.`);
                                  }}
                                >
                                  <Power className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                                <Button
                                  tone="danger"
                                  className="px-2.5 py-1.5"
                                  disabled={busyId === s.id}
                                  ariaLabel={`Remove ${s.name}`}
                                  onClick={() => {
                                    if (!window.confirm(`Remove ${s.name}?${s.kind === "manager" ? " Their login is deleted." : ""} Their attendance and pay records are deleted too. Past orders keep their name.`)) return;
                                    void act(s, () => staffApi.remove(s.id), `${s.name} was removed.`);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}

      <RestaurantAccounts currentId={currentId} />

      {viewing && !editing && <StaffProfileDialog member={viewing} onClose={() => setViewing(null)} onEdit={() => setEditing(viewing)} />}
      {adding && (
        <StaffDialog
          kind={adding}
          onClose={() => setAdding(null)}
          onSaved={async (name) => {
            setAdding(null);
            setNotice({ tone: "ok", text: `${name} was added as ${adding === "employee" ? "an employee" : `a ${KIND_LABEL[adding].toLowerCase()}`}.` });
            await load();
          }}
        />
      )}
      {editing && (
        <StaffDialog
          kind={editing.kind}
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={async (name) => {
            setEditing(null);
            setNotice({ tone: "ok", text: `${name} was updated.` });
            await load();
          }}
        />
      )}
    </div>
  );
}

type FormValues = {
  name: string;
  title: string;
  duty: string;
  salary: string;
  phone: string;
  email: string;
  password: string;
  department: string;
  shiftStart: string;
  shiftEnd: string;
  offDay: string;
  joinedOn: string;
  allowance: string;
  cnic: string;
  emergencyContact: string;
};

// Add or edit a Manager, Waiter or Employee. Managers also get a Gmail login and password when added.
function StaffDialog({ kind, member, onClose, onSaved }: { kind: CafeStaffKind; member?: CafeStaff; onClose: () => void; onSaved: (name: string) => Promise<void> }) {
  const defaultDepartment = kind === "manager" ? "Management" : kind === "waiter" ? "Service" : "Kitchen";
  const [v, setV] = useState<FormValues>({
    name: member?.name ?? "",
    title: member?.title ?? (kind === "employee" ? "" : KIND_LABEL[kind]),
    duty: member?.duty ?? "",
    salary: member?.salary ? String(member.salary) : "",
    phone: member?.phone ?? "",
    email: "",
    password: "",
    department: member?.department ?? defaultDepartment,
    shiftStart: member?.shiftStart ?? "09:00",
    shiftEnd: member?.shiftEnd ?? "17:00",
    offDay: member?.offDay ?? "",
    joinedOn: member?.joinedOn ?? new Date().toISOString().slice(0, 10),
    allowance: member?.allowance ? String(member.allowance) : "",
    cnic: member?.cnic ?? "",
    emergencyContact: member?.emergencyContact ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const newManager = kind === "manager" && !member;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const { email, password, ...profile } = v;
    const body: StaffInput = { ...profile, ...(newManager ? { email, password } : {}) };
    const res = member ? await staffApi.update(member.id, body) : await staffApi.add(kind, body);
    setBusy(false);
    if (res.ok) await onSaved(v.name.trim());
    else setErrors(res.errors ?? { form: res.error });
  };

  const field = (key: string, label: string, input: ReactNode, hint?: string) => (
    <Field label={label} error={errors[key]} hint={hint}>
      {input}
    </Field>
  );

  return (
    <Dialog title={member ? `Edit ${member.name}` : `Add ${KIND_LABEL[kind].toLowerCase()}`} onClose={onClose} wide>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {errors.form && <ErrorNote message={errors.form} />}
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Full name", <input value={v.name} onChange={set("name")} maxLength={60} aria-invalid={Boolean(errors.name)} className={inputClass} autoFocus />)}
          {field("title", "Job title", <input value={v.title} onChange={set("title")} maxLength={40} aria-invalid={Boolean(errors.title)} className={inputClass} />, TITLE_HINTS[v.department])}
          {field(
            "department",
            "Department",
            <select value={v.department} onChange={set("department")} aria-invalid={Boolean(errors.department)} className={inputClass}>
              {DEPARTMENTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>,
          )}
          {field("joinedOn", "Joining date", <input type="date" value={v.joinedOn} onChange={set("joinedOn")} aria-invalid={Boolean(errors.joinedOn)} className={inputClass} />)}
          {field("shiftStart", "Shift starts", <input type="time" value={v.shiftStart} onChange={set("shiftStart")} aria-invalid={Boolean(errors.shiftStart)} className={inputClass} />)}
          {field("shiftEnd", "Shift ends", <input type="time" value={v.shiftEnd} onChange={set("shiftEnd")} aria-invalid={Boolean(errors.shiftEnd)} className={inputClass} />)}
          {field(
            "offDay",
            "Weekly day off",
            <select value={v.offDay} onChange={set("offDay")} className={inputClass}>
              <option value="">No fixed day off</option>
              {WEEKDAYS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>,
          )}
          {field("phone", "Phone", <input value={v.phone} onChange={set("phone")} maxLength={20} placeholder="0300-1234567" aria-invalid={Boolean(errors.phone)} className={inputClass} />)}
          {field("salary", "Salary per month (Rs.)", <input type="number" min={0} value={v.salary} onChange={set("salary")} aria-invalid={Boolean(errors.salary)} className={inputClass} />)}
          {field(
            "allowance",
            "Allowance / incentive per month (Rs.)",
            <input type="number" min={0} value={v.allowance} onChange={set("allowance")} aria-invalid={Boolean(errors.allowance)} className={inputClass} />,
            "Fixed monthly extra: food, travel or performance incentive.",
          )}
          {field("cnic", "CNIC", <input value={v.cnic} onChange={set("cnic")} maxLength={15} placeholder="12345-1234567-1" aria-invalid={Boolean(errors.cnic)} className={inputClass} />)}
          {field("emergencyContact", "Emergency contact", <input value={v.emergencyContact} onChange={set("emergencyContact")} maxLength={80} placeholder="Name, relation, phone" className={inputClass} />)}
        </div>
        {field("duty", "Duties", <textarea value={v.duty} onChange={set("duty")} maxLength={200} rows={2} placeholder="e.g. Grill station, opens the kitchen, checks fridge temperatures" className={inputClass} />)}
        {newManager && (
          <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <ShieldCheck className="h-4 w-4 text-[#ffd400]" aria-hidden="true" /> Login for the Admin dashboard
            </p>
            {field("email", "Gmail address", <input type="email" value={v.email} onChange={set("email")} placeholder="manager@gmail.com" autoComplete="off" aria-invalid={Boolean(errors.email)} className={inputClass} />)}
            {field("password", "Password", <PasswordInput value={v.password} onChange={set("password")} autoComplete="new-password" aria-invalid={Boolean(errors.password)} className={inputClass} />)}
            <p className="text-xs text-zinc-500">They sign in at /admin/login with &quot;Sign in with email&quot; and see Cafe, Takeaway, Orders, Stock and Waiter Performance only.</p>
          </div>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : member ? "Save changes" : `Add ${KIND_LABEL[kind].toLowerCase()}`}
        </Button>
      </form>
    </Dialog>
  );
}

// ----- Restaurant login accounts (Owners and Managers of restaurants, made before) -----

const RESTAURANT_ROLES: Partial<Record<StaffRole, string>> = { owner: "Restaurant owner", manager: "Restaurant manager" };

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  restaurantId: string | null;
  restaurantName: string | null;
}

function RestaurantAccounts({ currentId }: { currentId: string }) {
  const { data, reload } = useCustomerData<{ staff: StaffMember[] }>("/api/admin/employees");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [deleting, setDeleting] = useState<StaffMember | null>(null);
  const accounts = (data?.staff ?? []).filter((m) => m.id !== currentId && RESTAURANT_ROLES[m.role]);
  if (accounts.length === 0) return null;

  const toggleActive = async (member: StaffMember) => {
    const next = !member.active;
    if (!window.confirm(next ? `Switch ${member.name} back on?` : `Switch ${member.name} off? They will be signed out straight away.`)) return;
    setBusyId(member.id);
    const result = await customerRequest(`/api/admin/employees/${encodeURIComponent(member.id)}`, "PATCH", { active: next });
    setBusyId(null);
    setNotice(result.ok ? { tone: "success", text: `${member.name} is now ${next ? "active" : "switched off"}.` } : { tone: "error", text: result.error });
    if (result.ok) reload();
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div>
        <h2 className="text-lg font-bold">Restaurant login accounts</h2>
        <p className="text-xs text-zinc-500">Owners and Managers of restaurants, who sign in to the restaurant dashboard.</p>
      </div>
      {notice && <p className={cn("text-sm", notice.tone === "error" ? "text-red-300" : "text-emerald-300")}>{notice.text}</p>}
      <ul className="divide-y divide-zinc-800">
        {accounts.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/employees/${encodeURIComponent(member.id)}`} className="font-bold hover:text-orange-400">
                  {member.name}
                </Link>
                <Pill tone="orange">{RESTAURANT_ROLES[member.role]}</Pill>
                <Pill tone={member.active ? "green" : "red"}>{member.active ? "Active" : "Switched off"}</Pill>
                {member.restaurantName && <Pill tone="zinc">{member.restaurantName}</Pill>}
              </div>
              <p className="mt-1 break-all text-sm text-zinc-400">{member.email}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/admin/employees/${encodeURIComponent(member.id)}`} className={ghostClass}>
                View details <ArrowRight className="h-4 w-4 text-orange-500" aria-hidden="true" />
              </Link>
              <button type="button" onClick={() => toggleActive(member)} disabled={busyId === member.id} className={ghostClass}>
                <Power className="h-4 w-4 text-orange-500" aria-hidden="true" /> {member.active ? "Switch off" : "Switch on"}
              </button>
              <button type="button" onClick={() => setDeleting(member)} disabled={busyId === member.id} aria-label={`Delete ${member.name}`} className={dangerClass}>
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {deleting && (
        <DeleteOwnerDialog
          owner={deleting}
          onCancel={() => setDeleting(null)}
          onDeleted={({ name }) => {
            setDeleting(null);
            setNotice({ tone: "success", text: `${name} was deleted.` });
            reload();
          }}
        />
      )}
    </section>
  );
}
