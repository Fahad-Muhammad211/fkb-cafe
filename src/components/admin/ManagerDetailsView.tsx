"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, Pencil, Plus, Power, UserPlus, X } from "lucide-react";
import { AreaCheckboxes, fieldClass, ghostClass, panelClass, Pill, primaryClass, type OfficeOption } from "@/components/admin/EmployeesView";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import { RESPONSIBILITY_LABELS, canAccess, type Responsibility, type StaffRole } from "@/lib/permissions";
import { STAFF_JOB_ROLES, type StaffJobRole } from "@/lib/staffRoles";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";
import { useSession } from "@/lib/local/useSession";

// Owner-only page for one manager: profile, office, team and activity history.
// The server returns only this manager's own staff and history, and checks the owner role on every request.

interface ManagerView {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  responsibilities: Responsibility[];
  active: boolean;
  createdAt: string;
  officeId: string | null;
  officeName: string | null;
}

interface TeamMemberView {
  id: string;
  name: string;
  jobRole: StaffJobRole | null;
  managerId: string;
  active: boolean;
  createdAt: string;
}

interface ActivityView {
  id: string;
  action: string;
  detail: string;
  actorName: string;
  createdAt: string;
}

interface ManagerDetailsResponse {
  manager: ManagerView;
  office: OfficeOption | null;
  staff: TeamMemberView[];
  activity: ActivityView[];
}

type Notice = { tone: "success" | "error"; text: string } | null;

const formatDateTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function ManagerDetailsGate({ managerId }: { managerId: string }) {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const allowed = status.state === "ready" && canAccess(status.value, "staff");

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
    else if (status.state === "ready" && !allowed) router.replace("/admin");
  }, [status.state, allowed, router]);

  if (status.state !== "ready") return <p className="text-sm text-zinc-400">Loading manager…</p>;
  if (!allowed) return null;
  return <ManagerDetailsView managerId={managerId} />;
}

function ManagerDetailsView({ managerId }: { managerId: string }) {
  const base = `/api/admin/managers/${encodeURIComponent(managerId)}`;
  const details = useCustomerData<ManagerDetailsResponse>(base);
  const officesState = useCustomerData<{ offices: OfficeOption[] }>("/api/admin/offices");
  const employees = useCustomerData<{ staff: ManagerView[] }>("/api/admin/employees");
  const [notice, setNotice] = useState<Notice>(null);

  const reloadAll = () => details.reload();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/employees" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-orange-400">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Employees
      </Link>

      {details.loading && <p className="text-sm text-zinc-400">Loading manager…</p>}
      {details.error && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {details.error}
        </p>
      )}
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${notice.tone === "error" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
          {notice.text}
        </p>
      )}

      {details.data && (
        <ManagerContent
          key={details.data.manager.id}
          data={details.data}
          offices={officesState.data?.offices ?? []}
          managers={(employees.data?.staff ?? []).filter((m) => m.role === "manager" && m.id !== managerId)}
          setNotice={setNotice}
          reload={reloadAll}
        />
      )}
    </div>
  );
}

function ManagerContent({
  data,
  offices,
  managers,
  setNotice,
  reload,
}: {
  data: ManagerDetailsResponse;
  offices: OfficeOption[];
  managers: ManagerView[];
  setNotice: (n: Notice) => void;
  reload: () => void;
}) {
  const { manager, office, staff, activity } = data;
  const [editingAreas, setEditingAreas] = useState(false);
  const [areaDraft, setAreaDraft] = useState<Responsibility[]>(manager.responsibilities);
  const [officeDraft, setOfficeDraft] = useState(manager.officeId ?? "");
  const [busy, setBusy] = useState(false);

  // Manager-level changes go through the employees endpoint, which owns manager accounts.
  const patchManager = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    const result = await customerRequest(`/api/admin/employees/${encodeURIComponent(manager.id)}`, "PATCH", body);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return false;
    }
    setNotice({ tone: "success", text: success });
    reload();
    return true;
  };

  const saveAreas = async () => {
    if (areaDraft.length === 0) {
      setNotice({ tone: "error", text: "Choose at least one area." });
      return;
    }
    if (await patchManager({ responsibilities: areaDraft }, "Areas were saved.")) setEditingAreas(false);
  };

  const saveOffice = async () => {
    if (!officeDraft) {
      setNotice({ tone: "error", text: "Choose an office." });
      return;
    }
    await patchManager({ officeId: officeDraft }, "Office was saved.");
  };

  const toggleActive = async () => {
    const next = !manager.active;
    if (!window.confirm(next ? `Switch ${manager.name} back on?` : `Switch ${manager.name} off? They will be signed out straight away.`)) return;
    await patchManager({ active: next }, `${manager.name} is now ${next ? "active" : "switched off"}.`);
  };

  return (
    <>
      <header className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Manager</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">{manager.name}</h1>
          <Pill tone={manager.active ? "green" : "red"}>{manager.active ? "Active" : "Switched off"}</Pill>
          {manager.officeName ? <Pill tone="orange">{manager.officeName}</Pill> : <Pill tone="red">No office assigned</Pill>}
        </div>
        <p className="break-all text-sm text-zinc-400">{manager.email}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account */}
        <section className={`${panelClass} flex flex-col gap-4`} aria-labelledby="account-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="account-heading" className="font-bold">Account details</h2>
            <button type="button" onClick={toggleActive} disabled={busy} className={ghostClass}>
              <Power className="h-4 w-4 text-orange-500" aria-hidden="true" />
              {manager.active ? "Switch off" : "Switch on"}
            </button>
          </div>
          <dl className="grid gap-3 text-sm">
            <Row label="Full name" value={manager.name} />
            <Row label="Gmail address" value={manager.email} />
            <Row label="Role" value="Manager" />
            <Row label="Status" value={manager.active ? "Active" : "Switched off"} />
            <Row label="Added" value={formatDateTime(manager.createdAt)} />
          </dl>

          <div className="border-t border-zinc-800 pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-zinc-200">Areas this manager can work on</p>
              {!editingAreas && (
                <button
                  type="button"
                  onClick={() => {
                    setAreaDraft(manager.responsibilities);
                    setEditingAreas(true);
                  }}
                  className={ghostClass}
                >
                  <Pencil className="h-4 w-4 text-orange-500" aria-hidden="true" />
                  Edit areas
                </button>
              )}
            </div>
            {editingAreas ? (
              <div className="mt-3 flex flex-col gap-4">
                <AreaCheckboxes selected={areaDraft} onChange={setAreaDraft} idPrefix={`manager-areas-${manager.id}`} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={saveAreas} disabled={busy} className={primaryClass}>
                    {busy ? "Saving…" : "Save areas"}
                  </button>
                  <button type="button" onClick={() => setEditingAreas(false)} className={ghostClass}>
                    <X className="h-4 w-4" aria-hidden="true" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {manager.responsibilities.map((area) => (
                  <Pill key={area} tone="orange">
                    {RESPONSIBILITY_LABELS[area]}
                  </Pill>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Office */}
        <section className={`${panelClass} flex flex-col gap-4`} aria-labelledby="office-heading">
          <h2 id="office-heading" className="flex items-center gap-2 font-bold">
            <Building2 className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Assigned office
          </h2>
          {office ? (
            <dl className="grid gap-3 text-sm">
              <Row label="Office name" value={office.name} />
              <Row label="Address" value={office.address || "Not provided"} />
            </dl>
          ) : (
            <p className="text-sm text-amber-300">This manager is not assigned to an office yet. Choose one below.</p>
          )}

          <div className="border-t border-zinc-800 pt-4">
            {offices.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No offices exist yet.{" "}
                <Link href="/admin/offices" className="text-orange-400 underline">
                  Create an office
                </Link>{" "}
                first.
              </p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <label htmlFor="reassign-office" className="text-sm font-semibold text-zinc-200">
                    {office ? "Move to another office" : "Assign office"}
                  </label>
                  <select id="reassign-office" value={officeDraft} onChange={(e) => setOfficeDraft(e.target.value)} className={fieldClass}>
                    <option value="">Choose an office</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={saveOffice} disabled={busy || officeDraft === (manager.officeId ?? "")} className={primaryClass}>
                  Save office
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <TeamPanel managerId={manager.id} staff={staff} managers={managers} setNotice={setNotice} reload={reload} />

      <section className={`${panelClass} flex flex-col gap-4`} aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="font-bold">Activity history</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-zinc-400">No activity yet. Changes to this manager and their team appear here.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-zinc-800">
            {activity.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 py-3 text-sm">
                <p className="font-semibold text-zinc-100">{entry.action}</p>
                {entry.detail && <p className="text-zinc-300">{entry.detail}</p>}
                <p className="text-xs text-zinc-500">
                  {formatDateTime(entry.createdAt)} · by {entry.actorName}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
      <dt className="text-zinc-500 sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words text-zinc-100">{value}</dd>
    </div>
  );
}

function TeamPanel({
  managerId,
  staff,
  managers,
  setNotice,
  reload,
}: {
  managerId: string;
  staff: TeamMemberView[];
  managers: ManagerView[];
  setNotice: (n: Notice) => void;
  reload: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ name: string; jobRole: StaffJobRole }>({ name: "", jobRole: STAFF_JOB_ROLES[0] });
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const patchStaff = async (member: TeamMemberView, body: Record<string, unknown>, success: string) => {
    setBusyId(member.id);
    const result = await customerRequest(`/api/admin/staff/${encodeURIComponent(member.id)}`, "PATCH", body);
    setBusyId(null);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return false;
    }
    setNotice({ tone: "success", text: success });
    reload();
    return true;
  };

  const saveEdit = async (member: TeamMemberView) => {
    if (await patchStaff(member, { name: editDraft.name, jobRole: editDraft.jobRole }, `${member.name}'s details were saved.`)) {
      setEditingId(null);
    }
  };

  const toggleStaff = async (member: TeamMemberView) => {
    const next = !member.active;
    if (!window.confirm(next ? `Switch ${member.name} back on?` : `Switch ${member.name} off?`)) return;
    await patchStaff(member, { active: next }, `${member.name} is now ${next ? "active" : "switched off"}.`);
  };

  const moveStaff = async (member: TeamMemberView) => {
    const target = moveTo[member.id];
    if (!target) {
      setNotice({ tone: "error", text: "Choose a manager to move this staff member to." });
      return;
    }
    const manager = managers.find((m) => m.id === target);
    if (await patchStaff(member, { managerId: target }, `${member.name} was moved to ${manager?.name ?? "another manager"}.`)) {
      setMoveTo((prev) => ({ ...prev, [member.id]: "" }));
    }
  };

  return (
    <section className={`${panelClass} flex flex-col gap-5`} aria-labelledby="team-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="team-heading" className="font-bold">
          Staff under this manager <span className="text-zinc-500">({staff.length})</span>
        </h2>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={primaryClass}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add staff
          </button>
        )}
      </div>

      {adding && (
        <AddStaffForm
          managerId={managerId}
          onCancel={() => setAdding(false)}
          onCreated={(name) => {
            setAdding(false);
            setNotice({ tone: "success", text: `${name} was added to this team.` });
            reload();
          }}
        />
      )}

      {staff.length === 0 && !adding && (
        <p className="text-sm text-zinc-400">No staff work under this manager yet. Use Add staff to create a team member.</p>
      )}

      {staff.length > 0 && (
        <ul className="flex flex-col gap-3">
          {staff.map((member) => {
            const editing = editingId === member.id;
            const otherManagers = managers;
            return (
              <li key={member.id} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-black/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{member.name}</p>
                  <Pill tone="zinc">{member.jobRole ?? "No role"}</Pill>
                  <Pill tone={member.active ? "green" : "red"}>{member.active ? "Active" : "Switched off"}</Pill>
                  <span className="text-xs text-zinc-500">Added {formatDateTime(member.createdAt)}</span>
                </div>

                {editing ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <input
                      aria-label="Staff name"
                      value={editDraft.name}
                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                      className={fieldClass}
                    />
                    <select
                      aria-label="Job role"
                      value={editDraft.jobRole}
                      onChange={(e) => setEditDraft((d) => ({ ...d, jobRole: e.target.value as StaffJobRole }))}
                      className={fieldClass}
                    >
                      {STAFF_JOB_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => saveEdit(member)} disabled={busyId === member.id} className={primaryClass}>
                        Save
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className={ghostClass}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditDraft({ name: member.name, jobRole: member.jobRole ?? STAFF_JOB_ROLES[0] });
                        setEditingId(member.id);
                      }}
                      className={ghostClass}
                    >
                      <Pencil className="h-4 w-4 text-orange-500" aria-hidden="true" />
                      Edit
                    </button>
                    <button type="button" onClick={() => toggleStaff(member)} disabled={busyId === member.id} className={ghostClass}>
                      <Power className="h-4 w-4 text-orange-500" aria-hidden="true" />
                      {member.active ? "Switch off" : "Switch on"}
                    </button>
                  </div>
                )}

                {!editing && (
                  <div className="flex flex-col gap-2 border-t border-zinc-800 pt-3 sm:flex-row sm:items-end">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <label htmlFor={`move-${member.id}`} className="text-xs font-semibold text-zinc-400">
                        Assign to another manager
                      </label>
                      <select
                        id={`move-${member.id}`}
                        value={moveTo[member.id] ?? ""}
                        onChange={(e) => setMoveTo((prev) => ({ ...prev, [member.id]: e.target.value }))}
                        disabled={otherManagers.length === 0}
                        className={fieldClass}
                      >
                        <option value="">{otherManagers.length === 0 ? "No other managers" : "Choose a manager"}</option>
                        {otherManagers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="button" onClick={() => moveStaff(member)} disabled={busyId === member.id || !moveTo[member.id]} className={ghostClass}>
                      Move
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AddStaffForm({ managerId, onCancel, onCreated }: { managerId: string; onCancel: () => void; onCreated: (name: string) => void }) {
  const [name, setName] = useState("");
  const [jobRole, setJobRole] = useState<StaffJobRole | "">("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Enter the staff member's name.";
    if (!jobRole) found.jobRole = "Choose the job role.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    const result = await customerRequest<{ staff: TeamMemberView }>(`/api/admin/managers/${encodeURIComponent(managerId)}/staff`, "POST", {
      name,
      jobRole,
      phone,
      email,
    });
    setPending(false);
    if (result.ok) onCreated(result.data.staff.name);
    else setErrors(result.errors ?? { form: result.error });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-black/40 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">New staff member</h3>
        <button type="button" onClick={onCancel} aria-label="Close" className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {errors.form && <p role="alert" className="text-sm text-red-300">{errors.form}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="staff-name" className="text-sm font-semibold text-zinc-200">
            Full name
          </label>
          <input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} className={fieldClass} />
          {errors.name && <p className="text-xs text-red-300">{errors.name}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="staff-job-role" className="text-sm font-semibold text-zinc-200">
            Job role
          </label>
          <select
            id="staff-job-role"
            value={jobRole}
            onChange={(e) => setJobRole(e.target.value as StaffJobRole | "")}
            aria-invalid={Boolean(errors.jobRole)}
            className={fieldClass}
          >
            <option value="">Choose a role</option>
            {STAFF_JOB_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          {errors.jobRole && <p className="text-xs text-red-300">{errors.jobRole}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="staff-phone" className="text-sm font-semibold text-zinc-200">
            Phone <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input id="staff-phone" value={phone} onChange={(e) => setPhone(e.target.value)} aria-invalid={Boolean(errors.phone)} className={fieldClass} />
          {errors.phone && <p className="text-xs text-red-300">{errors.phone}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="staff-email" className="text-sm font-semibold text-zinc-200">
            Email <span className="font-normal text-zinc-500">(optional)</span>
          </label>
          <input id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} className={fieldClass} />
          {errors.email && <p className="text-xs text-red-300">{errors.email}</p>}
        </div>
      </div>
      <div>
        <button type="submit" disabled={pending} className={primaryClass}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {pending ? "Adding…" : "Add to team"}
        </button>
      </div>
    </form>
  );
}
