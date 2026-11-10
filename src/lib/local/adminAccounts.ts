import { randomHex } from "@/lib/local/random";
import { isValidName, isValidPassword } from "@/lib/validation";
import { getCollection, isDuplicateKeyError } from "@/lib/local/collections";
import { hashPassword, passwordMatches } from "@/lib/local/passwords";
import type { StaffRole } from "@/lib/permissions";
import { deleteActivityFor, logActivity, type Actor } from "@/lib/local/activity";

// Admin accounts live in the "admins" collection. Passwords are hashed with scrypt and never
// sent back to the browser or written in plain text.
//
// Every account is an owner. Documents saved before roles existed have no role field, and documents
// saved with the old "manager" role are read as owners too; migrateManagerAccounts() rewrites those
// stored "manager" roles to "owner". Owners added from the Employees page belong to one restaurant
// (created on the Restaurants page); the restaurant ID is saved on their record.

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  role: StaffRole;
  active: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  restaurantId: string | null;
  restaurantName: string | null;
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
  // The restaurant this owner belongs to.
  restaurantId?: string;
  // Saved on owners added while offices existed. Offices were removed; these fields are kept on old
  // records but are no longer read or written.
  officeId?: string;
  officeName?: string;
};

// The fields of a restaurant record this module needs. Read straight from the "restaurants" store
// because lib/local/restaurants.ts imports this module. "managerId" is the owner who runs it.
type RestaurantRef = { _id: string; name: string; managerId: string | null };

const restaurantsCollection = () => getCollection<RestaurantRef>("restaurants");

interface RestaurantLinks {
  nameById: Map<string, string>;
  // Owner ID → the restaurant that owner runs. An owner runs at most one restaurant.
  runBy: Map<string, string>;
}

async function restaurantLinks(): Promise<RestaurantLinks> {
  const docs = await (await restaurantsCollection()).find({}).limit(500).toArray();
  const nameById = new Map(docs.map((d) => [d._id, d.name]));
  const runBy = new Map<string, string>();
  for (const d of docs) if (d.managerId) runBy.set(d.managerId, d._id);
  return { nameById, runBy };
}

// The restaurant an owner belongs to: the one saved on their record, or, for owners saved before
// restaurants were chosen here, the restaurant they run. A restaurant that no longer exists counts as none.
function restaurantOf(doc: AdminDoc, links: RestaurantLinks): { restaurantId: string | null; restaurantName: string | null } {
  const id = doc.restaurantId && links.nameById.has(doc.restaurantId) ? doc.restaurantId : (links.runBy.get(doc._id) ?? null);
  return { restaurantId: id, restaurantName: id ? (links.nameById.get(id) ?? null) : null };
}

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
});

const toStaffMember = (doc: AdminDoc, links: RestaurantLinks): StaffMember => {
  const account = toAccount(doc);
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    active: account.active,
    createdAt: account.createdAt,
    ...restaurantOf(doc, links),
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
  | { ok: true; account: Pick<StaffMember, "id" | "name" | "email" | "role" | "restaurantId" | "restaurantName"> }
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
// password, restaurant, status) is kept. Safe to run more than once.
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
  access: { createdBy?: string; restaurant?: { id: string; name: string } },
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
    ...(access.restaurant ? { restaurantId: access.restaurant.id } : {}),
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
      restaurantId: access.restaurant?.id ?? null,
      restaurantName: access.restaurant?.name ?? null,
    },
  };
}

// Makes this owner the one who runs the restaurant when it has nobody yet, so the restaurant's card,
// staff list and attendance show them. A restaurant that already has an owner keeps it.
async function runIfVacant(restaurantId: string, ownerId: string): Promise<void> {
  await (await restaurantsCollection()).updateOne({ _id: restaurantId, managerId: null }, { $set: { managerId: ownerId } });
}

// Saves the restaurant an owner belongs to. Called when a restaurant is created with this owner running it.
export async function setOwnerRestaurant(ownerId: string, restaurantId: string): Promise<void> {
  await (await adminsCollection()).updateOne({ _id: ownerId }, { $set: { restaurantId } });
}

// Creates the first admin, who is an owner. Refused once any admin exists, and only one of several racing requests can win.
export async function createInitialAdminAccount(input: NewAdminInput): Promise<AdminCreateResult> {
  if (await hasAdminAccounts()) return { ok: false, closed: true };
  const errors = validateAdminSignup(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return insertAdmin(input, INITIAL_ADMIN_ID, {});
}

// Creates another owner account from the Employees page, for the restaurant the signed-in owner picked.
// The caller must be signed in as an owner; the route checks that.
// The restaurant must already exist on the Restaurants page; its ID is saved with the account.
export async function createOwnerAccount(input: NewAdminInput, restaurantId: unknown, creator: Actor): Promise<AdminCreateResult> {
  const errors = validateAdminSignup(input);
  const restaurant =
    typeof restaurantId === "string" && restaurantId ? await (await restaurantsCollection()).findOne({ _id: restaurantId }) : null;
  if (!restaurant) errors.restaurantId = "Choose the restaurant this owner belongs to.";
  if (Object.keys(errors).length > 0 || !restaurant) return { ok: false, errors };

  const id = `admin-${Date.now().toString(36)}-${randomHex(3)}`;
  const result = await insertAdmin(input, id, {
    createdBy: creator.id,
    restaurant: { id: restaurant._id, name: restaurant.name },
  });
  if (result.ok) {
    await runIfVacant(restaurant._id, id);
    await logActivity(id, creator, "Owner added", `Restaurant: ${restaurant.name}.`);
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

// Every owner account, oldest first, with the restaurant each one belongs to.
export async function listStaff(): Promise<StaffMember[]> {
  const docs = await (await adminsCollection()).find({}).sort({ createdAt: 1 }).limit(200).toArray();
  const links = await restaurantLinks();
  return docs.map((doc) => toStaffMember(doc, links));
}

// One owner with the restaurant they belong to, or null when there is no account with this ID.
export async function findStaffMember(id: string): Promise<StaffMember | null> {
  const doc = await (await adminsCollection()).findOne({ _id: id });
  return doc ? toStaffMember(doc, await restaurantLinks()) : null;
}

// The owners who belong to one restaurant.
export async function listOwnersOfRestaurant(restaurantId: string): Promise<StaffMember[]> {
  return (await listStaff()).filter((member) => member.restaurantId === restaurantId);
}

export type OwnerDeleteResult =
  | { ok: true; deleted: { id: string; name: string; email: string }; vacatedRestaurants: string[] }
  | { ok: false; status: number; error: string };

// The staff records saved under each owner. Read straight from the store because
// lib/local/staffMembers.ts imports this module.
const teamCollection = () => getCollection<{ _id: string; managerId: string }>("staff_members");

// Permanently deletes an owner account. The account record holds the login email and password hash,
// so removing it removes the credentials: the owner can no longer log in, and every saved session for
// this ID stops working because getAdminSession reads the account on each request.
// The owner's own activity history is removed with the account. Any restaurant this owner runs is left
// with no owner, ready for a new one (the next owner added for it runs it). The restaurant itself and
// its orders, payments, grocery, purchases, attendance and riders are not touched.
// Refused for the signed-in owner's own account, and while staff still work under this owner (move
// them to another owner first, so no staff record is left without one).
export async function deleteOwnerAccount(targetId: string, actor: Actor): Promise<OwnerDeleteResult> {
  const collection = await adminsCollection();
  const target = await collection.findOne({ _id: targetId });
  if (!target) return { ok: false, status: 404, error: "Account not found." };
  if (targetId === actor.id) return { ok: false, status: 400, error: "You cannot delete your own account." };

  const team = await (await teamCollection()).countDocuments({ managerId: targetId });
  if (team > 0) {
    return {
      ok: false,
      status: 409,
      error: `${target.name} still has ${team} staff ${team === 1 ? "member" : "members"}. Move them to another owner before deleting this account.`,
    };
  }

  const { deletedCount } = await collection.deleteOne({ _id: targetId });
  if (deletedCount === 0) return { ok: false, status: 404, error: "Account not found." };
  // The owner's own activity history belongs to the account and goes with it.
  await deleteActivityFor(targetId);

  const restaurants = await restaurantsCollection();
  const run = await restaurants.find({ managerId: targetId }).toArray();
  for (const r of run) {
    await restaurants.updateOne({ _id: r._id, managerId: targetId }, { $set: { managerId: null } });
  }

  const vacated = run.map((r) => r.name);
  await logActivity(
    actor.id,
    actor,
    "Owner deleted",
    `${target.name} (${target.email})${vacated.length ? `. ${vacated.join(", ")} now has no owner.` : "."}`,
  );
  return { ok: true, deleted: { id: target._id, name: target.name, email: target.email }, vacatedRestaurants: vacated };
}

export type StaffUpdateResult = { ok: true; member: StaffMember } | { ok: false; status: number; error: string };

// Changes the restaurant an owner belongs to, or switches them on and off. An owner cannot switch off
// their own account, and an owner who runs a restaurant stays with that restaurant.
// Each change is written to that owner's activity history.
export async function updateStaff(
  targetId: string,
  actor: Actor,
  changes: { active?: unknown; restaurantId?: unknown },
): Promise<StaffUpdateResult> {
  const collection = await adminsCollection();
  const target = await collection.findOne({ _id: targetId });
  if (!target) return { ok: false, status: 404, error: "Account not found." };
  const links = await restaurantLinks();
  const before = restaurantOf(target, links);

  const $set: Partial<AdminDoc> = {};
  if (changes.restaurantId !== undefined) {
    const restaurantId = typeof changes.restaurantId === "string" ? changes.restaurantId : "";
    if (!links.nameById.has(restaurantId)) return { ok: false, status: 400, error: "Choose a valid restaurant." };
    const runs = links.runBy.get(targetId);
    if (runs && runs !== restaurantId) {
      return {
        ok: false,
        status: 400,
        error: `${target.name} runs ${links.nameById.get(runs)}, so they belong to that restaurant.`,
      };
    }
    $set.restaurantId = restaurantId;
  }
  if (changes.active !== undefined) {
    if (typeof changes.active !== "boolean") return { ok: false, status: 400, error: "Invalid status." };
    if (targetId === actor.id && !changes.active) return { ok: false, status: 400, error: "You cannot switch off your own account." };
    $set.active = changes.active;
  }
  if (Object.keys($set).length === 0) return { ok: false, status: 400, error: "Nothing to change." };

  const updated = await collection.findOneAndUpdate({ _id: targetId }, { $set }, { returnDocument: "after" });
  if (!updated) return { ok: false, status: 404, error: "Account not found." };
  if ($set.restaurantId !== undefined) await runIfVacant($set.restaurantId, targetId);
  const member = toStaffMember(updated, await restaurantLinks());

  if ($set.restaurantId !== undefined && $set.restaurantId !== before.restaurantId) {
    await logActivity(targetId, actor, "Restaurant changed", `${before.restaurantName ?? "No restaurant"} → ${member.restaurantName ?? ""}`);
  }
  if (changes.active !== undefined && (target.active !== false) !== member.active) {
    await logActivity(targetId, actor, member.active ? "Switched on" : "Switched off", member.name);
  }
  return { ok: true, member };
}
