import { getCollection } from "@/lib/local/collections";
import { randomHex } from "@/lib/local/random";
import { findAdminAccount, type StaffMember as ManagerMember } from "@/lib/local/adminAccounts";
import { findOffice, type Office } from "@/lib/local/offices";
import { listActivityFor, logActivity, type ActivityEntry, type Actor } from "@/lib/local/activity";
import { parseJobRole, type StaffJobRole } from "@/lib/staffRoles";
import { isValidName } from "@/lib/validation";

// Staff who work under a manager. Each staff record names exactly one manager, so a manager's team is
// the set of records with that manager's ID. Staff do not have dashboard logins.

export interface TeamMember {
  id: string;
  name: string;
  jobRole: StaffJobRole | null;
  managerId: string;
  active: boolean;
  createdAt: string;
  phone: string;
  email: string;
}

type TeamDoc = {
  _id: string;
  name: string;
  jobRole: string;
  managerId: string;
  active?: boolean;
  createdAt: string;
  createdBy: string;
  phone?: string;
  email?: string;
};

// Contact details are optional. When given, they must look like a phone number or an email address.
const CONTACT_PHONE = /^[0-9+\-\s()]{7,20}$/;
const CONTACT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function contactErrors(phone: string, email: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (phone && !CONTACT_PHONE.test(phone)) errors.phone = "Enter a valid phone number.";
  if (email && (email.length > 254 || !CONTACT_EMAIL.test(email))) errors.email = "Enter a valid email address.";
  return errors;
}

export interface ManagerDetails {
  manager: ManagerMember;
  office: Office | null;
  staff: TeamMember[];
  activity: ActivityEntry[];
}

export type TeamResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string; errors?: Record<string, string> };

const teamCollection = () =>
  getCollection<TeamDoc>("staff_members", [{ key: { managerId: 1 }, name: "staff_by_manager" }]);

const toTeamMember = (doc: TeamDoc): TeamMember => ({
  id: doc._id,
  name: doc.name,
  jobRole: parseJobRole(doc.jobRole),
  managerId: doc.managerId,
  active: doc.active !== false,
  createdAt: doc.createdAt,
  phone: doc.phone ?? "",
  email: doc.email ?? "",
});

// Full details for one manager. Returns null when the ID is not a manager account.
export async function getManagerDetails(managerId: string): Promise<ManagerDetails | null> {
  const account = await findAdminAccount(managerId);
  if (!account || account.role !== "manager") return null;
  const office = account.officeId ? await findOffice(account.officeId) : null;
  const staffDocs = await (await teamCollection()).find({ managerId }).sort({ name: 1 }).limit(500).toArray();
  return {
    manager: {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      responsibilities: account.responsibilities,
      active: account.active,
      createdAt: account.createdAt,
      officeId: account.officeId,
      officeName: account.officeName,
    },
    office,
    staff: staffDocs.map(toTeamMember),
    activity: await listActivityFor(managerId),
  };
}

export async function createTeamMember(
  managerId: string,
  input: { name: unknown; jobRole: unknown; phone?: unknown; email?: unknown },
  actor: Actor,
): Promise<TeamResult<TeamMember>> {
  const manager = await findAdminAccount(managerId);
  if (!manager || manager.role !== "manager") return { ok: false, status: 404, error: "Manager not found." };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const jobRole = parseJobRole(input.jobRole);
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const errors: Record<string, string> = { ...contactErrors(phone, email) };
  const nameError = isValidName(name);
  if (nameError) errors.name = nameError;
  if (!jobRole) errors.jobRole = "Choose the job role.";
  if (Object.keys(errors).length > 0 || !jobRole) {
    return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };
  }

  const doc: TeamDoc = {
    _id: `staff-${Date.now().toString(36)}-${randomHex(3)}`,
    name,
    jobRole,
    managerId,
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    phone,
    email,
  };
  await (await teamCollection()).insertOne(doc);
  await logActivity(managerId, actor, "Staff added", `${name} (${jobRole})`);
  return { ok: true, value: toTeamMember(doc) };
}

// Edits one staff member: details, on/off status, or the manager they work under.
export async function updateTeamMember(
  staffId: string,
  changes: { name?: unknown; jobRole?: unknown; active?: unknown; managerId?: unknown; phone?: unknown; email?: unknown },
  actor: Actor,
): Promise<TeamResult<TeamMember>> {
  const collection = await teamCollection();
  const current = await collection.findOne({ _id: staffId });
  if (!current) return { ok: false, status: 404, error: "Staff member not found." };

  const $set: Partial<TeamDoc> = {};
  if (changes.phone !== undefined || changes.email !== undefined) {
    const phone = typeof changes.phone === "string" ? changes.phone.trim() : (current.phone ?? "");
    const email = typeof changes.email === "string" ? changes.email.trim().toLowerCase() : (current.email ?? "");
    const errors = contactErrors(phone, email);
    if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: Object.values(errors)[0], errors };
    if (changes.phone !== undefined) $set.phone = phone;
    if (changes.email !== undefined) $set.email = email;
  }
  if (changes.name !== undefined) {
    const name = typeof changes.name === "string" ? changes.name.trim() : "";
    const nameError = isValidName(name);
    if (nameError) return { ok: false, status: 400, error: nameError };
    $set.name = name;
  }
  if (changes.jobRole !== undefined) {
    const jobRole = parseJobRole(changes.jobRole);
    if (!jobRole) return { ok: false, status: 400, error: "Choose a valid job role." };
    $set.jobRole = jobRole;
  }
  if (changes.active !== undefined) {
    if (typeof changes.active !== "boolean") return { ok: false, status: 400, error: "Invalid status." };
    $set.active = changes.active;
  }
  let newManagerName: string | null = null;
  if (changes.managerId !== undefined) {
    const target = typeof changes.managerId === "string" ? await findAdminAccount(changes.managerId) : null;
    if (!target || target.role !== "manager") return { ok: false, status: 400, error: "Choose a valid manager." };
    $set.managerId = target.id;
    newManagerName = target.name;
  }
  if (Object.keys($set).length === 0) return { ok: false, status: 400, error: "Nothing to change." };

  const updated = await collection.findOneAndUpdate({ _id: staffId }, { $set }, { returnDocument: "after" });
  if (!updated) return { ok: false, status: 404, error: "Staff member not found." };
  const member = toTeamMember(updated);

  // Activity: a move is recorded on both managers' histories; other edits go on the current manager's.
  if ($set.managerId !== undefined && $set.managerId !== current.managerId) {
    const previous = await findAdminAccount(current.managerId);
    await logActivity(current.managerId, actor, "Staff moved out", `${member.name} moved to ${newManagerName ?? "another manager"}`);
    await logActivity($set.managerId, actor, "Staff moved in", `${member.name} joined from ${previous?.name ?? "a removed manager"}`);
  }
  if (changes.name !== undefined || changes.jobRole !== undefined) {
    await logActivity(member.managerId, actor, "Staff details updated", `${member.name} (${member.jobRole ?? "no role"})`);
  }
  if (changes.active !== undefined && current.active !== member.active) {
    await logActivity(member.managerId, actor, member.active ? "Staff switched on" : "Staff switched off", member.name);
  }
  return { ok: true, value: member };
}
