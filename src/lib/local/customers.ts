import { randomHex } from "@/lib/local/random";
import { isValidName, isValidPassword, isValidPhone, validateSignupFields } from "@/lib/validation";
import { getCollection, isDuplicateKeyError } from "@/lib/local/collections";
import { hashPassword, passwordMatches } from "@/lib/local/passwords";
import type { AuthUser } from "@/types";

// Customer accounts live in the "customers" collection. Only a scrypt hash of the
// password is stored.

type CustomerDoc = Omit<AuthUser, "id"> & { _id: string; passwordHash: string };

export type AccountErrors = Record<string, string>;
export type CustomerResult = { ok: true; user: AuthUser } | { ok: false; errors: AccountErrors };

const customersCollection = () =>
  getCollection<CustomerDoc>("customers", [{ key: { email: 1 }, name: "customers_email_unique", unique: true }]);

const toUser = (doc: CustomerDoc): AuthUser => ({
  id: doc._id,
  name: doc.name,
  email: doc.email,
  phone: doc.phone,
  createdAt: doc.createdAt,
});

const normaliseEmail = (email: string) => email.trim().toLowerCase();

export async function createCustomer(input: {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirm: string;
}): Promise<CustomerResult> {
  const errors = validateSignupFields(input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const doc: CustomerDoc = {
    _id: `user-${Date.now().toString(36)}-${randomHex(4)}`,
    name: input.name.trim(),
    email: normaliseEmail(input.email),
    phone: input.phone.trim(),
    createdAt: new Date().toISOString(),
    passwordHash: await hashPassword(input.password),
  };
  try {
    await (await customersCollection()).insertOne(doc);
  } catch (err) {
    if (isDuplicateKeyError(err)) return { ok: false, errors: { email: "An account with this email already exists." } };
    throw err;
  }
  return { ok: true, user: toUser(doc) };
}

// Returns the customer only when the email and password both match.
export async function verifyCustomer(email: string, password: string): Promise<AuthUser | null> {
  const doc = await (await customersCollection()).findOne({ email: normaliseEmail(email) });
  // Hash even for unknown emails so response timing does not reveal which exist.
  const matches = await passwordMatches(password, doc?.passwordHash ?? "pbkdf2$00$00");
  return doc && matches ? toUser(doc) : null;
}

export async function findCustomer(id: string): Promise<AuthUser | null> {
  const doc = await (await customersCollection()).findOne({ _id: id });
  return doc ? toUser(doc) : null;
}

// Changes the password after checking the current one. Only the new hash is stored.
export async function changeCustomerPassword(
  id: string,
  values: { current: string; next: string; confirm: string },
): Promise<{ ok: true } | { ok: false; errors: AccountErrors; wrongCurrent?: boolean }> {
  const errors: AccountErrors = {};
  if (!values.current) errors.current = "Enter your current password.";
  const nextError = isValidPassword(values.next);
  if (nextError) errors.next = nextError;
  else if (values.confirm !== values.next) errors.confirm = "The new passwords do not match.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const collection = await customersCollection();
  const doc = await collection.findOne({ _id: id });
  if (!doc) return { ok: false, errors: { form: "Your account could not be found. Please log in again." } };
  if (!(await passwordMatches(values.current, doc.passwordHash))) {
    return { ok: false, errors: { current: "Your current password is incorrect." }, wrongCurrent: true };
  }

  await collection.updateOne({ _id: id }, { $set: { passwordHash: await hashPassword(values.next) } });
  return { ok: true };
}

// Every registered customer, newest first. Password hashes are left out.
export async function listCustomers(): Promise<AuthUser[]> {
  const docs = await (await customersCollection()).find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(1000).toArray();
  return docs.map(toUser);
}

export async function updateCustomerProfile(id: string, values: { name: string; phone: string }): Promise<CustomerResult> {
  const errors: AccountErrors = {};
  const name = isValidName(values.name);
  if (name) errors.name = name;
  const phone = isValidPhone(values.phone);
  if (phone) errors.phone = phone;
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const doc = await (await customersCollection()).findOneAndUpdate(
    { _id: id },
    { $set: { name: values.name.trim(), phone: values.phone.trim() } },
    { returnDocument: "after" },
  );
  if (!doc) return { ok: false, errors: { form: "Your account could not be found. Please log in again." } };
  return { ok: true, user: toUser(doc) };
}
