import { getCollection, isDuplicateKeyError } from "@/lib/local/collections";
import { randomHex } from "@/lib/local/random";

// Offices are created by the owner in the admin dashboard. Each manager is assigned to one office,
// and the office ID and name are saved with the manager record.

export interface Office {
  id: string;
  name: string;
  address: string;
  createdAt: string;
}

type OfficeDoc = {
  _id: string;
  name: string;
  nameKey: string;
  address: string;
  createdAt: string;
};

export type OfficeResult = { ok: true; office: Office } | { ok: false; errors: Record<string, string> };

const officesCollection = () =>
  getCollection<OfficeDoc>("offices", [{ key: { nameKey: 1 }, name: "offices_name_unique", unique: true }]);

const toOffice = (doc: OfficeDoc): Office => ({
  id: doc._id,
  name: doc.name,
  address: doc.address,
  createdAt: doc.createdAt,
});

// Office names are unique ignoring case and extra spaces, so "Main  Branch" and "main branch" are one office.
const nameKeyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

export async function listOffices(): Promise<Office[]> {
  const docs = await (await officesCollection()).find({}).sort({ name: 1 }).limit(500).toArray();
  return docs.map(toOffice);
}

export async function findOffice(id: string): Promise<Office | null> {
  const doc = await (await officesCollection()).findOne({ _id: id });
  return doc ? toOffice(doc) : null;
}

export async function createOffice(input: { name: unknown; address: unknown }): Promise<OfficeResult> {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const address = typeof input.address === "string" ? input.address.trim() : "";
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Enter the office name.";
  else if (name.length > 80) errors.name = "Keep the office name to 80 characters or fewer.";
  if (address.length > 200) errors.address = "Keep the address to 200 characters or fewer.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const doc: OfficeDoc = {
    _id: `office-${Date.now().toString(36)}-${randomHex(3)}`,
    name,
    nameKey: nameKeyOf(name),
    address,
    createdAt: new Date().toISOString(),
  };
  try {
    await (await officesCollection()).insertOne(doc);
  } catch (err) {
    if (isDuplicateKeyError(err)) return { ok: false, errors: { name: "An office with this name already exists." } };
    throw err;
  }
  return { ok: true, office: toOffice(doc) };
}
