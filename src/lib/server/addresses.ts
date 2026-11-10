import { randomHex } from "@/lib/server/random";
import { getCollection } from "@/lib/server/collections";
import type { FieldErrors } from "@/lib/server/http";
import { MAX_ADDRESSES, type SavedAddress } from "@/types/customer";

// Saved delivery addresses. Each document belongs to one customer; every query filters by userId,
// so a customer can never read or change another customer's addresses.

type AddressDoc = {
  _id: string;
  userId: string;
  label: string;
  address: string;
  area: string;
  createdAt: string;
  updatedAt: string;
};

export type AddressInput = { label: string; address: string; area: string };

const addressesCollection = () =>
  getCollection<AddressDoc>("addresses", [{ key: { userId: 1, createdAt: 1 }, name: "addresses_user_created" }]);

const toAddress = (doc: AddressDoc): SavedAddress => ({
  id: doc._id,
  label: doc.label,
  address: doc.address,
  area: doc.area,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export function validateAddressInput(input: AddressInput): FieldErrors {
  const errors: FieldErrors = {};
  const label = input.label.trim();
  if (label.length < 1) errors.label = "Give this address a name, such as Home or Office.";
  else if (label.length > 40) errors.label = "Keep the name under 40 characters.";
  const address = input.address.trim();
  if (address.length < 5) errors.address = "Enter the full delivery address.";
  else if (address.length > 200) errors.address = "Keep the address under 200 characters.";
  if (input.area.trim().length > 80) errors.area = "Keep the area under 80 characters.";
  return errors;
}

const clean = (input: AddressInput): AddressInput => ({
  label: input.label.trim(),
  address: input.address.trim(),
  area: input.area.trim(),
});

export async function listAddresses(userId: string): Promise<SavedAddress[]> {
  const docs = await (await addressesCollection()).find({ userId }).sort({ createdAt: 1 }).limit(MAX_ADDRESSES).toArray();
  return docs.map(toAddress);
}

export async function createAddress(
  userId: string,
  input: AddressInput,
): Promise<{ ok: true; address: SavedAddress } | { ok: false; status: number; error: string; errors?: FieldErrors }> {
  const errors = validateAddressInput(input);
  if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };

  const collection = await addressesCollection();
  if ((await collection.countDocuments({ userId })) >= MAX_ADDRESSES) {
    return { ok: false, status: 409, error: `You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.` };
  }
  const now = new Date().toISOString();
  const doc: AddressDoc = { _id: `ADR-${Date.now().toString(36)}-${randomHex(3)}`, userId, ...clean(input), createdAt: now, updatedAt: now };
  await collection.insertOne(doc);
  return { ok: true, address: toAddress(doc) };
}

export async function updateAddress(
  userId: string,
  id: string,
  input: AddressInput,
): Promise<{ ok: true; address: SavedAddress } | { ok: false; status: number; error: string; errors?: FieldErrors }> {
  const errors = validateAddressInput(input);
  if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };

  const doc = await (await addressesCollection()).findOneAndUpdate(
    { _id: id, userId },
    { $set: { ...clean(input), updatedAt: new Date().toISOString() } },
    { returnDocument: "after" },
  );
  if (!doc) return { ok: false, status: 404, error: "Address not found." };
  return { ok: true, address: toAddress(doc) };
}

export async function deleteAddress(userId: string, id: string): Promise<boolean> {
  const result = await (await addressesCollection()).deleteOne({ _id: id, userId });
  return result.deletedCount === 1;
}
