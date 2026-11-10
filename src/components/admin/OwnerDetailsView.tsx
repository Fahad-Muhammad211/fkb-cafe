"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Pencil, Plus, Power, Store, Trash2, UserPlus, X } from "lucide-react";
import { fieldClass, ghostClass, panelClass, Pill, primaryClass, type RestaurantOption } from "@/components/admin/EmployeesView";
import { DeleteOwnerDialog, dangerClass } from "@/components/admin/DeleteOwnerDialog";
import { customerRequest, useCustomerData } from "@/components/customer/useCustomerData";
import { canAccess, type StaffRole } from "@/lib/permissions";
import { getAdminSession, type StaffSession } from "@/lib/local/adminSession";
import { useSession } from "@/lib/local/useSession";

// Page for one owner: profile, restaurant, team and activity history.
// The data handlers return only this owner's own staff and history, and check the signed-in owner on every request.

interface OwnerView {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  restaurantId: string | null;
  restaurantName: string | null;
}

interface TeamMemberView {
  id: string;
  name: string;
  ownerId: string;
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

interface OwnerDetailsResponse {
  owner: OwnerView;
  staff: TeamMemberView[];
  activity: ActivityView[];
}

type Notice = { tone: "success" | "error"; text: string } | null;

const formatDateTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function OwnerDetailsGate({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const status = useSession<StaffSession>(getAdminSession);
  const allowed = status.state === "ready" && canAccess(status.value, "staff");

  useEffect(() => {
    if (status.state === "signedOut") router.replace("/admin/login");
    else if (status.state === "ready" && !allowed) router.replace("/admin");
  }, [status.state, allowed, router]);

  if (status.state !== "ready") return <p className="text-sm text-zinc-400">Loading owner…</p>;
  if (!allowed) return null;
  return <OwnerDetailsView ownerId={ownerId} currentId={status.value.id} />;
}

function OwnerDetailsView({ ownerId, currentId }: { ownerId: string; currentId: string }) {
  const base = `/api/admin/owners/${encodeURIComponent(ownerId)}`;
  const details = useCustomerData<OwnerDetailsResponse>(base);
  const restaurantsState = useCustomerData<{ restaurants: RestaurantOption[] }>("/api/admin/restaurants");
  const employees = useCustomerData<{ staff: OwnerView[] }>("/api/admin/employees");
  const [notice, setNotice] = useState<Notice>(null);

  const reloadAll = () => details.reload();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/employees" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-orange-400">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Employees
      </Link>

      {details.loading && <p className="text-sm text-zinc-400">Loading owner…</p>}
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
        <OwnerContent
          key={details.data.owner.id}
          data={details.data}
          isSelf={details.data.owner.id === currentId}
          restaurants={restaurantsState.data?.restaurants ?? []}
          owners={(employees.data?.staff ?? []).filter((m) => m.id !== ownerId)}
          setNotice={setNotice}
          reload={reloadAll}
        />
      )}
    </div>
  );
}

function OwnerContent({
  data,
  isSelf,
  restaurants,
  owners,
  setNotice,
  reload,
}: {
  data: OwnerDetailsResponse;
  isSelf: boolean;
  restaurants: RestaurantOption[];
  owners: OwnerView[];
  setNotice: (n: Notice) => void;
  reload: () => void;
}) {
  const { owner, staff, activity } = data;
  const router = useRouter();
  const restaurant = restaurants.find((r) => r.id === owner.restaurantId) ?? null;
  const [restaurantDraft, setRestaurantDraft] = useState(owner.restaurantId ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Account-level changes go through the employees endpoint, which owns the owner accounts.
  const patchOwner = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    const result = await customerRequest(`/api/admin/employees/${encodeURIComponent(owner.id)}`, "PATCH", body);
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return false;
    }
    setNotice({ tone: "success", text: success });
    reload();
    return true;
  };

  const saveRestaurant = async () => {
    if (!restaurantDraft) {
      setNotice({ tone: "error", text: "Choose a restaurant." });
      return;
    }
    await patchOwner({ restaurantId: restaurantDraft }, "Restaurant was saved.");
  };

  const toggleActive = async () => {
    const next = !owner.active;
    if (!window.confirm(next ? `Switch ${owner.name} back on?` : `Switch ${owner.name} off? They will be signed out straight away.`)) return;
    await patchOwner({ active: next }, `${owner.name} is now ${next ? "active" : "switched off"}.`);
  };

  return (
    <>
      <header className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Owner</p>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">{owner.name}</h1>
          <Pill tone={owner.active ? "green" : "red"}>{owner.active ? "Active" : "Switched off"}</Pill>
          {owner.restaurantName ? <Pill tone="orange">{owner.restaurantName}</Pill> : <Pill tone="red">No restaurant assigned</Pill>}
        </div>
        <p className="break-all text-sm text-zinc-400">{owner.email}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account */}
        <section className={`${panelClass} flex flex-col gap-4`} aria-labelledby="account-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="account-heading" className="font-bold">Account details</h2>
            {!isSelf && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={toggleActive} disabled={busy} className={ghostClass}>
                  <Power className="h-4 w-4 text-orange-500" aria-hidden="true" />
                  {owner.active ? "Switch off" : "Switch on"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={busy}
                  className={dangerClass}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </button>
              </div>
            )}
          </div>
          <dl className="grid gap-3 text-sm">
            <Row label="Full name" value={owner.name} />
            <Row label="Gmail address" value={owner.email} />
            <Row label="Role" value="Owner" />
            <Row label="Status" value={owner.active ? "Active" : "Switched off"} />
            <Row label="Added" value={formatDateTime(owner.createdAt)} />
          </dl>
        </section>

        {/* Restaurant */}
        <section className={`${panelClass} flex flex-col gap-4`} aria-labelledby="restaurant-heading">
          <h2 id="restaurant-heading" className="flex items-center gap-2 font-bold">
            <Store className="h-4 w-4 text-orange-500" aria-hidden="true" />
            Restaurant
          </h2>
          {owner.restaurantId ? (
            <div className="flex flex-col gap-3">
              <dl className="grid gap-3 text-sm">
                <Row label="Restaurant name" value={owner.restaurantName ?? ""} />
                <Row label="Area" value={restaurant?.area ?? ""} />
              </dl>
              <Link href={`/admin/restaurants/${encodeURIComponent(owner.restaurantId)}`} className={`${ghostClass} w-fit`}>
                Open restaurant
                <ArrowRight className="h-4 w-4 text-orange-500" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-amber-300">This owner does not belong to a restaurant yet. Choose one below.</p>
          )}

          <div className="border-t border-zinc-800 pt-4">
            {restaurants.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No restaurants exist yet.{" "}
                <Link href="/admin/restaurants" className="text-orange-400 underline">
                  Create a restaurant
                </Link>{" "}
                first.
              </p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <label htmlFor="reassign-restaurant" className="text-sm font-semibold text-zinc-200">
                    {owner.restaurantId ? "Move to another restaurant" : "Assign restaurant"}
                  </label>
                  <select id="reassign-restaurant" value={restaurantDraft} onChange={(e) => setRestaurantDraft(e.target.value)} className={fieldClass}>
                    <option value="">Choose a restaurant</option>
                    {restaurants.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} — {r.area}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="button" onClick={saveRestaurant} disabled={busy || restaurantDraft === (owner.restaurantId ?? "")} className={primaryClass}>
                  Save restaurant
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <TeamPanel ownerId={owner.id} staff={staff} owners={owners} setNotice={setNotice} reload={reload} />

      <section className={`${panelClass} flex flex-col gap-4`} aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="font-bold">Activity history</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-zinc-400">No activity yet. Changes to this owner and their team appear here.</p>
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

      {confirmingDelete && (
        <DeleteOwnerDialog
          owner={owner}
          onCancel={() => setConfirmingDelete(false)}
          // The account is gone, so its page is left for the Employees list, which loads the accounts again.
          onDeleted={() => {
            router.replace("/admin/employees");
            router.refresh();
          }}
        />
      )}
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
  ownerId,
  staff,
  owners,
  setNotice,
  reload,
}: {
  ownerId: string;
  staff: TeamMemberView[];
  owners: OwnerView[];
  setNotice: (n: Notice) => void;
  reload: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
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
    if (await patchStaff(member, { name: editName }, `${member.name}'s details were saved.`)) {
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
      setNotice({ tone: "error", text: "Choose an owner to move this staff member to." });
      return;
    }
    const owner = owners.find((m) => m.id === target);
    if (await patchStaff(member, { ownerId: target }, `${member.name} was moved to ${owner?.name ?? "another owner"}.`)) {
      setMoveTo((prev) => ({ ...prev, [member.id]: "" }));
    }
  };

  return (
    <section className={`${panelClass} flex flex-col gap-5`} aria-labelledby="team-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="team-heading" className="font-bold">
          Staff under this owner <span className="text-zinc-500">({staff.length})</span>
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
          ownerId={ownerId}
          onCancel={() => setAdding(false)}
          onCreated={(name) => {
            setAdding(false);
            setNotice({ tone: "success", text: `${name} was added to this team.` });
            reload();
          }}
        />
      )}

      {staff.length === 0 && !adding && (
        <p className="text-sm text-zinc-400">No staff work under this owner yet. Use Add staff to create a team member.</p>
      )}

      {staff.length > 0 && (
        <ul className="flex flex-col gap-3">
          {staff.map((member) => {
            const editing = editingId === member.id;
            const otherOwners = owners;
            return (
              <li key={member.id} className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-black/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{member.name}</p>
                  <Pill tone={member.active ? "green" : "red"}>{member.active ? "Active" : "Switched off"}</Pill>
                  <span className="text-xs text-zinc-500">Added {formatDateTime(member.createdAt)}</span>
                </div>

                {editing ? (
                  <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                    <input aria-label="Staff name" value={editName} onChange={(e) => setEditName(e.target.value)} className={fieldClass} />
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
                        setEditName(member.name);
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
                        Assign to another owner
                      </label>
                      <select
                        id={`move-${member.id}`}
                        value={moveTo[member.id] ?? ""}
                        onChange={(e) => setMoveTo((prev) => ({ ...prev, [member.id]: e.target.value }))}
                        disabled={otherOwners.length === 0}
                        className={fieldClass}
                      >
                        <option value="">{otherOwners.length === 0 ? "No other owners" : "Choose an owner"}</option>
                        {otherOwners.map((m) => (
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

function AddStaffForm({ ownerId, onCancel, onCreated }: { ownerId: string; onCancel: () => void; onCreated: (name: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!name.trim()) found.name = "Enter the staff member's name.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setPending(true);
    const result = await customerRequest<{ staff: TeamMemberView }>(`/api/admin/owners/${encodeURIComponent(ownerId)}/staff`, "POST", {
      name,
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
