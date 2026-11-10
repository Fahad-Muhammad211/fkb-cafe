import { getCollection } from "@/lib/local/collections";
import { randomHex } from "@/lib/local/random";
import { findAdminAccount, findStaffMember, type StaffMember as OwnerMember } from "@/lib/local/adminAccounts";
import { listActivityFor, logActivity, type ActivityEntry, type Actor } from "@/lib/local/activity";
import { isValidName } from "@/lib/validation";

// Staff who work under an owner. Each staff record names exactly one owner, so an owner's team is
// the set of records with that owner's ID. Staff do not have dashboard logins.
// The stored field is still called "managerId" so teams saved before the single owner role are kept.

export interface TeamMember {
  id: string;
  name: string;
  ownerId: string;
  active: boolean;
  createdAt: string;
  phone: string;
  email: string;
}

type TeamDoc = {
  _id: string;
  name: string;
  // Job title saved before job titles were removed. Kept on old records, no longer read or written.
  jobRole?: string;
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

export interface OwnerDetails {
  // Includes the restaurant this owner belongs to (restaurantId and restaurantName).
  owner: OwnerMember;
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
  ownerId: doc.managerId,
  active: doc.active !== false,
  createdAt: doc.createdAt,
  phone: doc.phone ?? "",
  email: doc.email ?? "",
});

// Full details for one owner. Returns null when there is no account with this ID.
export async function getOwnerDetails(ownerId: string): Promise<OwnerDetails | null> {
  const owner = await findStaffMember(ownerId);
  if (!owner) return null;
  const staffDocs = await (await teamCollection()).find({ managerId: ownerId }).sort({ name: 1 }).limit(500).toArray();
  return {
    owner,
    staff: staffDocs.map(toTeamMember),
    activity: await listActivityFor(ownerId),
  };
}

export async function createTeamMember(
  ownerId: string,
  input: { name: unknown; phone?: unknown; email?: unknown },
  actor: Actor,
): Promise<TeamResult<TeamMember>> {
  const owner = await findAdminAccount(ownerId);
  if (!owner) return { ok: false, status: 404, error: "Owner not found." };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const errors: Record<string, string> = { ...contactErrors(phone, email) };
  const nameError = isValidName(name);
  if (nameError) errors.name = nameError;
  if (Object.keys(errors).length > 0) {
    return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };
  }

  const doc: TeamDoc = {
    _id: `staff-${Date.now().toString(36)}-${randomHex(3)}`,
    name,
    managerId: ownerId,
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    phone,
    email,
  };
  await (await teamCollection()).insertOne(doc);
  await logActivity(ownerId, actor, "Staff added", name);
  return { ok: true, value: toTeamMember(doc) };
}

// Edits one staff member: details, on/off status, or the owner they work under.
export async function updateTeamMember(
  staffId: string,
  changes: { name?: unknown; active?: unknown; ownerId?: unknown; phone?: unknown; email?: unknown },
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
  if (changes.active !== undefined) {
    if (typeof changes.active !== "boolean") return { ok: false, status: 400, error: "Invalid status." };
    $set.active = changes.active;
  }
  let newOwnerName: string | null = null;
  if (changes.ownerId !== undefined) {
    const target = typeof changes.ownerId === "string" ? await findAdminAccount(changes.ownerId) : null;
    if (!target) return { ok: false, status: 400, error: "Choose a valid owner." };
    $set.managerId = target.id;
    newOwnerName = target.name;
  }
  if (Object.keys($set).length === 0) return { ok: false, status: 400, error: "Nothing to change." };

  const updated = await collection.findOneAndUpdate({ _id: staffId }, { $set }, { returnDocument: "after" });
  if (!updated) return { ok: false, status: 404, error: "Staff member not found." };
  const member = toTeamMember(updated);

  // Activity: a move is recorded on both owners' histories; other edits go on the current owner's.
  if ($set.managerId !== undefined && $set.managerId !== current.managerId) {
    const previous = await findAdminAccount(current.managerId);
    await logActivity(current.managerId, actor, "Staff moved out", `${member.name} moved to ${newOwnerName ?? "another owner"}`);
    await logActivity($set.managerId, actor, "Staff moved in", `${member.name} joined from ${previous?.name ?? "a removed owner"}`);
  }
  if (changes.name !== undefined) {
    await logActivity(member.ownerId, actor, "Staff details updated", member.name);
  }
  if (changes.active !== undefined && current.active !== member.active) {
    await logActivity(member.ownerId, actor, member.active ? "Staff switched on" : "Staff switched off", member.name);
  }
  return { ok: true, value: member };
}
