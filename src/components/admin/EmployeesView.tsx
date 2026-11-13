"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Pencil, Power, ShieldCheck, UserPlus, X } from "lucide-react";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import { RESPONSIBILITIES, RESPONSIBILITY_LABELS, type Responsibility, type StaffRole } from "@/lib/permissions";
import { isValidName, isValidPassword } from "@/lib/validation";

// Owner-only screen. The server checks the owner role on every request below; this screen only draws it.

// Same shape as StaffMember in lib/server/adminAccounts.ts (server modules cannot be imported here).
interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  responsibilities: Responsibility[];
  active: boolean;
  createdAt: string;
}

const fieldClass =
  "w-full rounded-xl border border-zinc-700 bg-black px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none aria-[invalid=true]:border-red-500";

const panelClass = "rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-black p-5 shadow-xl shadow-black/40 md:p-6";

const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50";
const primaryClass = `${buttonClass} bg-orange-500 font-bold text-black hover:bg-orange-400`;
const ghostClass = `${buttonClass} border border-zinc-700 text-white hover:border-orange-500/60 hover:bg-zinc-800`;

function Pill({ tone, children }: { tone: "orange" | "zinc" | "red" | "green"; children: ReactNode }) {
  const tones = {
    orange: "bg-orange-500/15 text-orange-400 ring-orange-500/30",
    zinc: "bg-zinc-800 text-zinc-300 ring-zinc-700",
    red: "bg-red-500/15 text-red-400 ring-red-500/30",
    green: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  } as const;
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tones[tone]}`}>{children}</span>;
}

function AreaCheckboxes({ selected, onChange, idPrefix }: { selected: Responsibility[]; onChange: (next: Responsibility[]) => void; idPrefix: string }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Areas this manager can work on</legend>
      <div className="flex flex-wrap gap-2">
        {RESPONSIBILITIES.map((area) => {
          const checked = selected.includes(area);
          return (
            <label
              key={area}
              htmlFor={`${idPrefix}-${area}`}
              className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition-colors ${
                checked ? "bg-orange-500 text-black ring-orange-500" : "bg-zinc-900 text-zinc-300 ring-zinc-700 hover:ring-orange-500/50"
              }`}
            >
              <input
                id={`${idPrefix}-${area}`}
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => onChange(checked ? selected.filter((a) => a !== area) : RESPONSIBILITIES.filter((r) => r === area || selected.includes(r)))}
              />
              {RESPONSIBILITY_LABELS[area]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function EmployeesView({ currentId }: { currentId: string }) {
  const { data, error, loading, reload } = useCustomerData<{ staff: StaffMember[] }>("/api/admin/employees");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAreas, setDraftAreas] = useState<Responsibility[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const staff = data?.staff ?? [];

  const saveAreas = async (member: StaffMember) => {
    if (draftAreas.length === 0) {
      setNotice({ tone: "error", text: "Choose at least one area." });
      return;
    }
    setBusyId(member.id);
    const result = await customerRequest(`/api/admin/employees/${encodeURIComponent(member.id)}`, "PATCH", { responsibilities: draftAreas });
    setBusyId(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setEditingId(null);
    setNotice({ tone: "success", text: `${member.name}'s areas were saved.` });
    reload();
  };

  const toggleActive = async (member: StaffMember) => {
    const next = !member.active;
    if (!window.confirm(next ? `Switch ${member.name} back on?` : `Switch ${member.name} off? They will be signed out straight away.`)) return;
    setBusyId(member.id);
    const result = await customerRequest(`/api/admin/employees/${encodeURIComponent(member.id)}`, "PATCH", { active: next });
    setBusyId(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setNotice({ tone: "success", text: `${member.name} is now ${next ? "active" : "switched off"}.` });
    reload();
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Owner only</p>
          <h1 className="mt-1 text-3xl font-black uppercase tracking-tight md:text-4xl">Employees</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Managers can only use the areas you give them. Finance and staff management stay with the owner.
          </p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={primaryClass}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add manager
          </button>
        )}
      </header>

      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
          {notice.text}
        </p>
      )}

      {adding && (
        <AddManagerForm
          onCancel={() => setAdding(false)}
          onCreated={(name) => {
            setAdding(false);
            setNotice({ tone: "success", text: `${name} was added as a manager.` });
            reload();
          }}
        />
      )}

      {loading && <p className="text-sm text-zinc-400">Loading staff…</p>}
      {error && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {data && (
        <ul className="grid gap-4">
          {staff.map((member) => {
            const isOwner = member.role === "owner";
            const isSelf = member.id === currentId;
            const editing = editingId === member.id;
            return (
              <li key={member.id} className={panelClass}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-black">{member.name}</p>
                      {isOwner ? <Pill tone="orange">Owner</Pill> : <Pill tone="zinc">Manager</Pill>}
                      {isSelf && <Pill tone="zinc">You</Pill>}
                      <Pill tone={member.active ? "green" : "red"}>{member.active ? "Active" : "Switched off"}</Pill>
                    </div>
                    <p className="mt-1 break-all text-sm text-zinc-400">{member.email}</p>
                    <p className="mt-1 text-xs text-zinc-500">Added {new Date(member.createdAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}</p>
                  </div>

                  {!isOwner && !editing && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(member.id);
                          setDraftAreas(member.responsibilities);
                        }}
                        className={ghostClass}
                      >
                        <Pencil className="h-4 w-4 text-orange-500" aria-hidden="true" />
                        Edit areas
                      </button>
                      {!isSelf && (
                        <button type="button" onClick={() => toggleActive(member)} disabled={busyId === member.id} className={ghostClass}>
                          <Power className="h-4 w-4 text-orange-500" aria-hidden="true" />
                          {member.active ? "Switch off" : "Switch on"}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isOwner ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
                    <ShieldCheck className="h-4 w-4 text-orange-500" aria-hidden="true" />
                    Owners have access to every area, including finance and staff.
                  </p>
                ) : editing ? (
                  <div className="mt-5 flex flex-col gap-4 border-t border-zinc-800 pt-5">
                    <AreaCheckboxes selected={draftAreas} onChange={setDraftAreas} idPrefix={`edit-${member.id}`} />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => saveAreas(member)} disabled={busyId === member.id} className={primaryClass}>
                        {busyId === member.id ? "Saving…" : "Save areas"}
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className={ghostClass}>
                        <X className="h-4 w-4" aria-hidden="true" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {member.responsibilities.map((area) => (
                      <Pill key={area} tone="orange">
                        {RESPONSIBILITY_LABELS[area]}
                      </Pill>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AddManagerForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (name: string) => void }) {
  const [values, setValues] = useState({ name: "", email: "", password: "", confirm: "" });
  const [areas, setAreas] = useState<Responsibility[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    const nameError = isValidName(values.name);
    if (nameError) found.name = nameError;
    if (!values.email.trim()) found.email = "Enter the manager's Gmail address.";
    const passwordError = isValidPassword(values.password);
    if (passwordError) found.password = passwordError;
    else if (values.confirm !== values.password) found.confirm = "Passwords do not match.";
    if (areas.length === 0) found.responsibilities = "Choose at least one area.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    const result = await customerRequest<{ account: { name: string } }>("/api/admin/accounts", "POST", { ...values, responsibilities: areas });
    setPending(false);
    if (result.ok) {
      onCreated(result.data.account.name);
    } else {
      setErrors(result.errors ?? { form: result.error });
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className={`${panelClass} flex flex-col gap-5`}>
      <div className="flex items-center justify-between">
        <h2 className="font-bold">New manager</h2>
        <button type="button" onClick={onCancel} aria-label="Close" className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {errors.form && <p role="alert" className="text-sm text-red-300">{errors.form}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {(["name", "email", "password", "confirm"] as const).map((key) => {
          const labels = { name: "Full name", email: "Gmail address", password: "Password", confirm: "Confirm password" } as const;
          const types = { name: "text", email: "email", password: "password", confirm: "password" } as const;
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <label htmlFor={`manager-${key}`} className="text-sm font-semibold text-zinc-200">
                {labels[key]}
              </label>
              <input
                id={`manager-${key}`}
                type={types[key]}
                autoComplete={key === "email" ? "off" : "new-password"}
                placeholder={key === "email" ? "manager@gmail.com" : undefined}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                aria-invalid={Boolean(errors[key])}
                className={fieldClass}
              />
              {errors[key] && <p className="text-xs text-red-300">{errors[key]}</p>}
            </div>
          );
        })}
      </div>

      <AreaCheckboxes selected={areas} onChange={setAreas} idPrefix="new-manager" />
      {errors.responsibilities && <p className="text-xs text-red-300">{errors.responsibilities}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={primaryClass}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          {pending ? "Adding…" : "Add manager"}
        </button>
        <button type="button" onClick={onCancel} className={ghostClass}>
          Cancel
        </button>
      </div>
    </form>
  );
}
