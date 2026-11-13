import "server-only";
import { getCollection } from "@/lib/server/collections";
import { randomHex } from "@/lib/server/random";
import { createCafeManagerAccount, deleteCafeManagerAccount, setCafeManagerActive } from "@/lib/server/adminAccounts";
import { endSessionsFor } from "@/lib/server/session";
import { removeStaffHr } from "@/lib/server/staffHr";
import type { Actor } from "@/lib/server/activity";
import type { CafeStaff, CafeStaffKind } from "@/lib/cafeTypes";
import { DEPARTMENTS, WEEKDAYS } from "@/lib/staffTypes";

// The cafe's staff directory ("cafe_staff"): Managers, Waiters and other Employees, with job title,
// duties, monthly salary and phone. Managers also have a login (an "admins" account with role
// "cafe_manager", linked by accountId). Waiters are the ones the Cafe screen assigns to tables.

export type StaffDoc = Omit<CafeStaff, "id" | HrField> & Partial<Pick<CafeStaff, HrField>> & { _id: string; nameLower: string };
type HrField = "code" | "department" | "shiftStart" | "shiftEnd" | "offDay" | "joinedOn" | "allowance" | "cnic" | "emergencyContact";

export const staffCol = () =>
  getCollection<StaffDoc>("cafe_staff", [
    { key: { kind: 1, nameLower: 1 }, name: "kind_name" },
    { key: { accountId: 1 }, name: "accountId", sparse: true },
  ]);

// Tables live in the cafe module; read directly here to unassign a removed or switched-off waiter.
const tablesCol = () => getCollection<{ _id: string; waiterId: string | null }>("cafe_tables");

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string; errors?: Record<string, string> };
const fail = (status: number, error: string, errors?: Record<string, string>): { ok: false; status: number; error: string; errors?: Record<string, string> } => ({ ok: false, status, error, errors });

const DEFAULT_DEPARTMENT: Record<CafeStaffKind, string> = { manager: "Management", waiter: "Service", employee: "Kitchen" };

export const toStaff = ({ _id, nameLower: _n, ...rest }: StaffDoc): CafeStaff => {
  void _n;
  return {
    id: _id,
    ...rest,
    code: rest.code ?? "",
    department: rest.department ?? DEFAULT_DEPARTMENT[rest.kind],
    shiftStart: rest.shiftStart ?? "09:00",
    shiftEnd: rest.shiftEnd ?? "17:00",
    offDay: rest.offDay ?? "",
    joinedOn: rest.joinedOn ?? rest.createdAt.slice(0, 10),
    allowance: rest.allowance ?? 0,
    cnic: rest.cnic ?? "",
    emergencyContact: rest.emergencyContact ?? "",
  };
};
const cleanText = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const PHONE = /^[0-9+\-\s()]{7,20}$/;
const DEFAULT_TITLE: Record<CafeStaffKind, string> = { manager: "Manager", waiter: "Waiter", employee: "" };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CNIC = /^\d{5}-\d{7}-\d$/;

// Employee numbers EMP-001, EMP-002 … from a counter, so a removed number is never reused.
async function nextStaffCode(): Promise<string> {
  const counters = await getCollection<{ _id: string; seq: number }>("cafe_settings");
  const doc = await counters.findOneAndUpdate({ _id: "staffCode" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
  return `EMP-${String(doc?.seq ?? 1).padStart(3, "0")}`;
}

export async function listStaffDirectory(): Promise<CafeStaff[]> {
  const docs = await (await staffCol()).find({}).sort({ kind: 1, nameLower: 1 }).toArray();
  return docs.map(toStaff);
}

// Shared checks for the profile fields. Returns field errors and the cleaned values.
function readProfile(body: Record<string, unknown>, kind: CafeStaffKind, partial: boolean) {
  const errors: Record<string, string> = {};
  const out: Partial<Pick<CafeStaff, "name" | "title" | "duty" | "salary" | "phone" | HrField>> = {};
  if (!partial || body.name !== undefined) {
    const name = cleanText(body.name, 60);
    if (name.length < 2) errors.name = "Enter the full name.";
    else out.name = name;
  }
  if (!partial || body.title !== undefined) {
    const title = cleanText(body.title, 40) || DEFAULT_TITLE[kind];
    if (!title) errors.title = "Enter the job title (for example Chef or Cleaner).";
    else out.title = title;
  }
  if (!partial || body.duty !== undefined) out.duty = cleanText(body.duty, 200);
  if (!partial || body.salary !== undefined) {
    const raw = body.salary === "" || body.salary === undefined || body.salary === null ? 0 : Number(body.salary);
    if (!Number.isFinite(raw) || raw < 0 || raw > 10_000_000) errors.salary = "Salary must be 0 or more.";
    else out.salary = Math.round(raw);
  }
  if (!partial || body.phone !== undefined) {
    const phone = cleanText(body.phone, 20);
    if (phone && !PHONE.test(phone)) errors.phone = "Enter a valid phone number.";
    else out.phone = phone;
  }
  if (!partial || body.department !== undefined) {
    const department = cleanText(body.department, 40) || DEFAULT_DEPARTMENT[kind];
    if (!(DEPARTMENTS as readonly string[]).includes(department)) errors.department = "Choose a department.";
    else out.department = department;
  }
  for (const key of ["shiftStart", "shiftEnd"] as const) {
    if (!partial || body[key] !== undefined) {
      const time = cleanText(body[key], 5) || (key === "shiftStart" ? "09:00" : "17:00");
      if (!TIME.test(time)) errors[key] = "Use a time like 09:00.";
      else out[key] = time;
    }
  }
  if (!partial || body.offDay !== undefined) {
    const offDay = cleanText(body.offDay, 12);
    if (offDay && !(WEEKDAYS as readonly string[]).includes(offDay)) errors.offDay = "Choose a weekday.";
    else out.offDay = offDay;
  }
  if (!partial || body.joinedOn !== undefined) {
    const joinedOn = cleanText(body.joinedOn, 10);
    if (joinedOn && (!DATE.test(joinedOn) || Number.isNaN(Date.parse(joinedOn)))) errors.joinedOn = "Choose the joining date.";
    else out.joinedOn = joinedOn || new Date().toISOString().slice(0, 10);
  }
  if (!partial || body.allowance !== undefined) {
    const raw = body.allowance === "" || body.allowance === undefined || body.allowance === null ? 0 : Number(body.allowance);
    if (!Number.isFinite(raw) || raw < 0 || raw > 10_000_000) errors.allowance = "Allowance must be 0 or more.";
    else out.allowance = Math.round(raw);
  }
  if (!partial || body.cnic !== undefined) {
    const cnic = cleanText(body.cnic, 15);
    if (cnic && !CNIC.test(cnic)) errors.cnic = "Use the format 12345-1234567-1.";
    else out.cnic = cnic;
  }
  if (!partial || body.emergencyContact !== undefined) out.emergencyContact = cleanText(body.emergencyContact, 80);
  return { errors, out };
}

async function nameTaken(kind: CafeStaffKind, name: string, exceptId?: string): Promise<boolean> {
  const doc = await (await staffCol()).findOne({ kind, nameLower: name.toLowerCase(), ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  return doc !== null;
}

// Adds a Manager (with login), Waiter or Employee.
export async function addStaff(kind: unknown, body: Record<string, unknown>, actor: Actor): Promise<Result<CafeStaff>> {
  if (kind !== "manager" && kind !== "waiter" && kind !== "employee") return fail(400, "Choose manager, waiter or employee.");
  const { errors, out } = readProfile(body, kind, false);
  if (out.name && (await nameTaken(kind, out.name))) errors.name = `A ${kind} with this name already exists.`;

  let accountId: string | null = null;
  let email: string | null = null;
  if (kind === "manager" && Object.keys(errors).length === 0) {
    const created = await createCafeManagerAccount({ name: out.name!, email: String(body.email ?? ""), password: String(body.password ?? "") }, actor);
    if (!created.ok) return fail(400, "Please correct the highlighted fields.", "errors" in created ? created.errors : { form: "Could not create the login." });
    accountId = created.account.id;
    email = created.account.email;
  }
  if (Object.keys(errors).length > 0) return fail(400, "Please correct the highlighted fields.", errors);

  const doc: StaffDoc = {
    _id: `${kind}-${Date.now().toString(36)}-${randomHex(4)}`,
    kind,
    name: out.name!,
    nameLower: out.name!.toLowerCase(),
    title: out.title!,
    duty: out.duty ?? "",
    salary: out.salary ?? 0,
    phone: out.phone ?? "",
    active: true,
    accountId,
    email,
    createdAt: new Date().toISOString(),
    code: await nextStaffCode(),
    department: out.department ?? DEFAULT_DEPARTMENT[kind],
    shiftStart: out.shiftStart ?? "09:00",
    shiftEnd: out.shiftEnd ?? "17:00",
    offDay: out.offDay ?? "",
    joinedOn: out.joinedOn ?? new Date().toISOString().slice(0, 10),
    allowance: out.allowance ?? 0,
    cnic: out.cnic ?? "",
    emergencyContact: out.emergencyContact ?? "",
  };
  await (await staffCol()).insertOne(doc);
  return { ok: true, value: toStaff(doc) };
}

export async function updateStaffRecord(id: string, body: Record<string, unknown>): Promise<Result<CafeStaff>> {
  const col = await staffCol();
  const current = await col.findOne({ _id: id });
  if (!current) return fail(404, "Staff member not found.");
  const { errors, out } = readProfile(body, current.kind, true);
  if (out.name && (await nameTaken(current.kind, out.name, id))) errors.name = `A ${current.kind} with this name already exists.`;
  if (Object.keys(errors).length > 0) return fail(400, Object.values(errors)[0], errors);

  const $set: Partial<StaffDoc> = { ...out };
  if (out.name) $set.nameLower = out.name.toLowerCase();
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return fail(400, "Invalid status.");
    $set.active = body.active;
  }
  if (Object.keys($set).length === 0) return fail(400, "Nothing to change.");
  const updated = await col.findOneAndUpdate({ _id: id }, { $set }, { returnDocument: "after" });
  if (!updated) return fail(404, "Staff member not found.");

  if ($set.active !== undefined && $set.active !== current.active) {
    if (updated.accountId) {
      await setCafeManagerActive(updated.accountId, updated.active);
      if (!updated.active) await endSessionsFor("admin", updated.accountId);
    }
    if (!updated.active && updated.kind === "waiter") await (await tablesCol()).updateMany({ waiterId: id }, { $set: { waiterId: null } });
  }
  return { ok: true, value: toStaff(updated) };
}

// Removes a staff member. A Manager's login is deleted and signed out; a Waiter's tables become
// unassigned. Past cafe orders keep the waiter's name.
export async function removeStaffRecord(id: string): Promise<Result<true>> {
  const col = await staffCol();
  const doc = await col.findOneAndDelete({ _id: id });
  if (!doc) return fail(404, "Staff member not found.");
  if (doc.accountId) {
    await endSessionsFor("admin", doc.accountId);
    await deleteCafeManagerAccount(doc.accountId);
  }
  if (doc.kind === "waiter") await (await tablesCol()).updateMany({ waiterId: id }, { $set: { waiterId: null } });
  await removeStaffHr(id);
  return { ok: true, value: true };
}
