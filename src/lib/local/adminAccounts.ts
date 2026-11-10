import { randomHex } from "@/lib/local/random";
import { isValidName, isValidPassword } from "@/lib/validation";
import { getCollection, isDuplicateKeyError } from "@/lib/local/collections";
import { hashPassword, passwordMatches } from "@/lib/local/passwords";
import type { StaffRole } from "@/lib/permissions";
import { findOffice } from "@/lib/local/offices";
import { logActivity, type Actor } from "@/lib/local/activity";

// Admin accounts live in the "admins" collection. Passwords are hashed with scrypt and never
// sent back to the browser or written in plain text.
//
// Every account is an owner. Documents saved before roles existed have no role field, and documents
// saved with the old "manager" role are read as owners too; migrateManagerAccounts() rewrites those
// stored "manager" roles to "owner". Owners added from the Employees page are assigned to one office;
// the office ID and name are saved on their record.

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  role: StaffRole;
  active: boolean;
  officeId: string | null;
  officeName: string | null;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  officeId: string | null;
  officeName: string | null;
}

type AdminDoc = {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  // "manager" is only found on records saved before the single owner role.
  role?: StaffRole | "manager";
  active?: boolean;
  createdBy?: string;
  officeId?: string;
  officeName?: string;
};

export type AccountErrors = Record<string, string>;

// Gmail addresses only: 6 to 30 characters of letters, digits and dots before @gmail.com.
const GMAIL_PATTERN = /^[a-z0-9][a-z0-9.]{4,28}[a-z0-9]@gmail\.com$/;

const adminsCollection = () =>
  getCollection<AdminDoc>("admins", [{ key: { email: 1 }, name: "admins_email_unique", unique: true }]);

const toAccount = (doc: AdminDoc): AdminAccount => ({
  id: doc._id,
  name: doc.name,
  email: doc.email,
  passwordHash: doc.passwordHash,
  createdAt: doc.createdAt,
  role: "owner",
  active: doc.active !== false,
  officeId: doc.officeId ?? null,
  officeName: doc.officeName ?? null,
});

const toStaffMember = (doc: AdminDoc): StaffMember => {
  const account = toAccount(doc);
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    active: account.active,
    createdAt: account.createdAt,
    officeId: account.officeId,
    officeName: account.officeName,
  };
};

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateAdminSignup(input: { name: string; email: string; password: string; confirm: string }): AccountErrors {
  const errors: AccountErrors = {};
  const name = isValidName(input.name);
  if (name) errors.name = name;
  const email = normaliseEmail(input.email);
  if (!email) errors.email = "Please enter your Gmail address.";
  else if (email.length > 254 || !GMAIL_PATTERN.test(email)) errors.email = "Use a valid Gmail address ending in @gmail.com.";
  const password = isValidPassword(input.password);
  if (password) errors.password = password;
  if (!password && input.confirm !== input.password) errors.confirm = "Passwords do not match.";
  return errors;
}

type NewAdminInput = { name: string; email: string; password: string; confirm: string };

export type AdminCreateResult =
  | { ok: true; account: Pick<AdminAccount, "id" | "name" | "email" | "role" | "officeId" | "officeName"> }
  | { ok: false; errors: AccountErrors }
  | { ok: false; closed: true };

// The first admin is stored with this fixed _id. The store refuses a second document with the same
// _id, so two setup requests that race each other cannot both create an initial admin.
const INITIAL_ADMIN_ID = "admin-initial";

// True once any admin exists. Public admin setup is closed from then on.
export async function hasAdminAccounts(): Promise<boolean> {
  return (await (await adminsCollection()).findOne({}, { projection: { _id: 1 } })) !== null;
}

// Rewrites accounts stored with the old "manager" role as owners. Every other field (name, email,
// password, office, status) is kept. Safe to run more than once.
export async function migrateManagerAccounts(): Promise<number> {
  const collection = await adminsCollection();
  const managers = await collection.find({ role: "manager" }).toArray();
  for (const doc of managers) {
    await collection.updateOne({ _id: doc._id }, { $set: { role: "owner" } });
  }
  return managers.length;
}

async function insertAdmin(
  input: NewAdminInput,
  id: string,
  access: { createdBy?: string; office?: { id: string; name: string } },
): Promise<AdminCreateResult> {
  const doc: AdminDoc = {
    _id: id,
    name: input.name.trim(),
    email: normaliseEmail(input.email),
    passwordHash: await hashPassword(input.password),
    createdAt: new Date().toISOString(),
    role: "owner",
    active: true,
    ...(access.createdBy ? { createdBy: access.createdBy } : {}),
    ...(access.office ? { officeId: access.office.id, officeName: access.office.name } : {}),
  };
  try {
    // The unique index on email is what stops two signups with the same address from both succeeding.
    await (await adminsCollection()).insertOne(doc);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      // Only the fixed initial-admin _id can clash with a setup that already happened.
      const onId = (err as { keyPattern?: Record<string, unknown> }).keyPattern?._id !== undefined;
      if (onId) return { ok: false, closed: true };
      return { ok: false, errors: { email: "An account with this Gmail address already exists." } };
    }
    throw err;
  }
  return {
    ok: true,
    account: {
      id: doc._id,
      name: doc.name,
      email: doc.email,
      role: "owner",
      officeId: access.office?.id ?? null,
      officeName: access.office?.name ?? null,
    },
  };
}

// Creates the first admin, who is an owner. Refused once any admin exists, and only one of several racing requests can win.
export async function createInitialAdminAccount(input: NewAdminInput): Promise<AdminCreateResult> {
  if (await hasAdminAccounts()) return { ok: false, closed: true };
  const errors = validateAdminSignup(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return insertAdmin(input, INITIAL_ADMIN_ID, {});
}

// Creates another owner account from the Employees page, at the office the signed-in owner picked.
// The caller must be signed in as an owner; the route checks that.
// The office must already exist in the Offices list; the office name is saved with the account.
export async function createOwnerAccount(input: NewAdminInput, officeId: unknown, creator: Actor): Promise<AdminCreateResult> {
  const errors = validateAdminSignup(input);
  const office = typeof officeId === "string" && officeId ? await findOffice(officeId) : null;
  if (!office) errors.officeId = "Choose the office this owner works at.";
  if (Object.keys(errors).length > 0 || !office) return { ok: false, errors };

  const id = `admin-${Date.now().toString(36)}-${randomHex(3)}`;
  const result = await insertAdmin(input, id, {
    createdBy: creator.id,
    office: { id: office.id, name: office.name },
  });
  if (result.ok) {
    await logActivity(id, creator, "Owner added", `Office: ${office.name}.`);
  }
  return result;
}

// Returns the matching account only when the email and password are both correct and the account is active.
export async function verifyAdminCredentials(email: string, password: string): Promise<AdminAccount | null> {
  const doc = await (await adminsCollection()).findOne({ email: normaliseEmail(email) });
  // Run the hash even for unknown emails so response timing does not reveal which exist.
  const matches = await passwordMatches(password, doc?.passwordHash ?? "pbkdf2$00$00");
  if (!doc || !matches || doc.active === false) return null;
  return toAccount(doc);
}

export async function findAdminAccount(id: string): Promise<AdminAccount | null> {
  const doc = await (await adminsCollection()).findOne({ _id: id });
  return doc ? toAccount(doc) : null;
}

// Every owner account, oldest first.
export async function listStaff(): Promise<StaffMember[]> {
  const docs = await (await adminsCollection()).find({}).sort({ createdAt: 1 }).limit(200).toArray();
  return docs.map(toStaffMember);
}

export type StaffUpdateResult = { ok: true; member: StaffMember } | { ok: false; status: number; error: string };

// Changes an owner's office, or switches them on and off. An owner cannot switch off their own account.
// Each change is written to that owner's activity history.
export async function updateStaff(
  targetId: string,
  actor: Actor,
  changes: { active?: unknown; officeId?: unknown },
): Promise<StaffUpdateResult> {
  const collection = await adminsCollection();
  const target = await collection.findOne({ _id: targetId });
  if (!target) return { ok: false, status: 404, error: "Account not found." };

  const $set: Partial<AdminDoc> = {};
  if (changes.officeId !== undefined) {
    const office = typeof changes.officeId === "string" ? await findOffice(changes.officeId) : null;
    if (!office) return { ok: false, status: 400, error: "Choose a valid office." };
    $set.officeId = office.id;
    $set.officeName = office.name;
  }
  if (changes.active !== undefined) {
    if (typeof changes.active !== "boolean") return { ok: false, status: 400, error: "Invalid status." };
    if (targetId === actor.id && !changes.active) return { ok: false, status: 400, error: "You cannot switch off your own account." };
    $set.active = changes.active;
  }
  if (Object.keys($set).length === 0) return { ok: false, status: 400, error: "Nothing to change." };

  const updated = await collection.findOneAndUpdate({ _id: targetId }, { $set }, { returnDocument: "after" });
  if (!updated) return { ok: false, status: 404, error: "Account not found." };
  const member = toStaffMember(updated);

  if ($set.officeId !== undefined && $set.officeId !== target.officeId) {
    await logActivity(targetId, actor, "Office changed", `${target.officeName ?? "No office"} → ${member.officeName ?? ""}`);
  }
  if (changes.active !== undefined && (target.active !== false) !== member.active) {
    await logActivity(targetId, actor, member.active ? "Switched on" : "Switched off", member.name);
  }
  return { ok: true, member };
}
