"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Pencil, Power, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import { DeleteOwnerDialog, dangerClass } from "@/components/admin/DeleteOwnerDialog";
import { Button, Dialog, ErrorNote } from "@/components/admin/cafe/CafeParts";
import { staffApi, type StaffInput } from "@/lib/cafeApi";
import type { CafeStaff, CafeStaffKind } from "@/lib/cafeTypes";
import type { StaffRole } from "@/lib/permissions";
import { formatPKR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PasswordInput } from "@/components/ui/PasswordInput";

// Employees page (Owner only): the cafe's Managers, Waiters and other Employees with their job title,
// duties, salary and phone. A Manager also gets a login with operational access to the Admin
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
const inputClass = "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-[#ffd400] aria-[invalid=true]:border-red-500";

type Filter = "all" | CafeStaffKind;

export function EmployeesView({ currentId }: { currentId: string }) {
  const [staff, setStaff] = useState<CafeStaff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState<CafeStaffKind | null>(null);
  const [editing, setEditing] = useState<CafeStaff | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await staffApi.list();
    if (res.ok) {
      setStaff(res.data);
      setError(null);
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

  const list = (staff ?? []).filter((s) => filter === "all" || s.kind === filter);
  const active = (staff ?? []).filter((s) => s.active);
  const payroll = active.reduce((sum, s) => sum + s.salary, 0);

  return (
    <div className="flex animate-card-in flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-zinc-500">Team</p>
          <h1 className="text-3xl font-black uppercase tracking-tight md:text-4xl">Employees</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">Managers sign in with their Gmail and get operational access (tables, takeaway, orders, stock, waiter performance). Waiters and employees do not sign in.</p>
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

      {notice && (
        <p role="status" className={cn("rounded-xl border px-4 py-3 text-sm", notice.tone === "ok" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300")}>
          {notice.text}
        </p>
      )}
      <ErrorNote message={error} />

      {staff && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Active staff" value={String(active.length)} />
            <Stat label="Monthly salaries" value={formatPKR(payroll)} />
            <Stat label="Managers" value={String(active.filter((s) => s.kind === "manager").length)} />
            <Stat label="Waiters" value={String(active.filter((s) => s.kind === "waiter").length)} />
          </div>

          <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <div role="tablist" className="flex w-fit flex-wrap gap-1 rounded-full bg-zinc-950 p-1">
              {(["all", "manager", "waiter", "employee"] as const).map((f) => (
                <button
                  key={f}
                  role="tab"
                  type="button"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn("rounded-full px-3 py-1.5 text-xs font-bold", filter === f ? "bg-[#ffd400] text-black" : "text-zinc-300 hover:text-white")}
                >
                  {f === "all" ? "All" : `${KIND_LABEL[f]}s`} ({f === "all" ? staff.length : staff.filter((s) => s.kind === f).length})
                </button>
              ))}
            </div>
            {list.length === 0 ? (
              <p className="text-sm text-zinc-500">No one here yet. Use the buttons above to add your team.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="py-2 pr-3 font-semibold">Name</th>
                      <th className="py-2 pr-3 font-semibold">Role</th>
                      <th className="py-2 pr-3 font-semibold">Duties</th>
                      <th className="py-2 pr-3 text-right font-semibold">Salary / month</th>
                      <th className="py-2 pr-3 font-semibold">Contact</th>
                      <th className="py-2 pr-3 font-semibold">Status</th>
                      <th className="py-2 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {list.map((s) => (
                      <tr key={s.id} className={cn(!s.active && "opacity-60")}>
                        <td className="py-3 pr-3 font-semibold">{s.name}</td>
                        <td className="py-3 pr-3">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", KIND_TONE[s.kind])}>{KIND_LABEL[s.kind]}</span>
                          {s.kind === "employee" && <span className="ml-2 text-zinc-300">{s.title}</span>}
                        </td>
                        <td className="max-w-64 py-3 pr-3 text-zinc-400">{s.duty || "—"}</td>
                        <td className="py-3 pr-3 text-right tabular-nums">{s.salary ? formatPKR(s.salary) : "—"}</td>
                        <td className="py-3 pr-3 text-zinc-400">
                          {s.phone || "—"}
                          {s.email && <span className="block text-xs text-zinc-500">Login: {s.email}</span>}
                        </td>
                        <td className="py-3 pr-3">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", s.active ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-400")}>{s.active ? "Active" : "Switched off"}</span>
                        </td>
                        <td className="py-3">
                          <div className="flex justify-end gap-1">
                            <Button tone="ghost" className="px-2.5 py-1.5" onClick={() => setEditing(s)} ariaLabel={`Edit ${s.name}`}>
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              tone="ghost"
                              className="px-2.5 py-1.5 text-xs"
                              disabled={busyId === s.id}
                              onClick={() => {
                                if (!window.confirm(s.active ? `Switch ${s.name} off?${s.kind === "manager" ? " Their login stops working at once." : s.kind === "waiter" ? " Their tables become unassigned." : ""}` : `Switch ${s.name} back on?`)) return;
                                void act(s, () => staffApi.update(s.id, { active: !s.active }), `${s.name} is now ${s.active ? "switched off" : "active"}.`);
                              }}
                            >
                              <Power className="h-3.5 w-3.5" aria-hidden="true" /> {s.active ? "Switch off" : "Switch on"}
                            </Button>
                            <Button
                              tone="danger"
                              className="px-2.5 py-1.5"
                              disabled={busyId === s.id}
                              ariaLabel={`Remove ${s.name}`}
                              onClick={() => {
                                if (!window.confirm(`Remove ${s.name}?${s.kind === "manager" ? " Their login is deleted." : ""} Past orders keep their name.`)) return;
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
          </section>
        </>
      )}

      <RestaurantAccounts currentId={currentId} />

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-xl font-black tabular-nums">{value}</p>
    </div>
  );
}

// Add or edit a Manager, Waiter or Employee. Managers also get a Gmail login and password when added.
function StaffDialog({ kind, member, onClose, onSaved }: { kind: CafeStaffKind; member?: CafeStaff; onClose: () => void; onSaved: (name: string) => Promise<void> }) {
  const [v, setV] = useState<StaffInput>({
    name: member?.name ?? "",
    title: member?.title ?? (kind === "employee" ? "" : KIND_LABEL[kind]),
    duty: member?.duty ?? "",
    salary: member?.salary ? String(member.salary) : "",
    phone: member?.phone ?? "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof StaffInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const newManager = kind === "manager" && !member;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body: StaffInput = { name: v.name, title: v.title, duty: v.duty, salary: v.salary, phone: v.phone, ...(newManager ? { email: v.email, password: v.password } : {}) };
    const res = member ? await staffApi.update(member.id, body) : await staffApi.add(kind, body);
    setBusy(false);
    if (res.ok) await onSaved(v.name.trim());
    else setErrors(res.errors ?? { form: res.error });
  };

  const field = (key: keyof StaffInput, label: string, input: ReactNode) => (
    <label className="flex flex-col gap-1.5 text-sm font-semibold">
      {label}
      {input}
      {errors[key] && <span className="text-xs font-normal text-red-300">{errors[key]}</span>}
    </label>
  );

  return (
    <Dialog title={member ? `Edit ${member.name}` : `Add ${KIND_LABEL[kind].toLowerCase()}`} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        {errors.form && <ErrorNote message={errors.form} />}
        {field("name", "Full name", <input value={v.name} onChange={set("name")} maxLength={60} aria-invalid={Boolean(errors.name)} className={inputClass} autoFocus />)}
        {kind === "employee" &&
          field("title", "Job title", <input value={v.title} onChange={set("title")} maxLength={40} placeholder="e.g. Chef, Cleaner, Cashier" aria-invalid={Boolean(errors.title)} className={inputClass} />)}
        {field("duty", "Duties", <textarea value={v.duty} onChange={set("duty")} maxLength={200} rows={2} placeholder="e.g. Morning shift, grill station" className={inputClass} />)}
        <div className="grid grid-cols-2 gap-3">
          {field("salary", "Salary per month (Rs.)", <input type="number" min={0} value={v.salary} onChange={set("salary")} aria-invalid={Boolean(errors.salary)} className={inputClass} />)}
          {field("phone", "Phone", <input value={v.phone} onChange={set("phone")} maxLength={20} aria-invalid={Boolean(errors.phone)} className={inputClass} />)}
        </div>
        {newManager && (
          <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <ShieldCheck className="h-4 w-4 text-[#ffd400]" aria-hidden="true" /> Login for the Admin dashboard
            </p>
            {field("email", "Gmail address", <input type="email" value={v.email} onChange={set("email")} placeholder="manager@gmail.com" autoComplete="off" aria-invalid={Boolean(errors.email)} className={inputClass} />)}
            {field("password", "Password", <PasswordInput value={v.password ?? ""} onChange={set("password")} autoComplete="new-password" aria-invalid={Boolean(errors.password)} className={inputClass} />)}
            <p className="text-xs text-zinc-500">They sign in at /admin/login and see Cafe, Takeaway, Orders, Stock and Waiter Performance only.</p>
          </div>
        )}
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : member ? "Save changes" : `Add ${KIND_LABEL[kind].toLowerCase()}`}</Button>
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
