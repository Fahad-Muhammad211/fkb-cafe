import { getCollection, isDuplicateKeyError } from "@/lib/local/collections";
import { randomHex } from "@/lib/local/random";
import { findAdminAccount, setOwnerRestaurant } from "@/lib/local/adminAccounts";
import { isAllowedImageUrl } from "@/lib/imageUpload";

// Restaurants. Each restaurant keeps its own orders, staff attendance, grocery, purchases and riders,
// all linked by restaurantId. A restaurant is run by one owner, and an owner runs at most one
// restaurant, so each restaurant's staff list (the owner's team) is unambiguous.
// The stored field is still called "managerId" so restaurants saved before the single owner role are kept.

export interface Restaurant {
  id: string;
  name: string;
  area: string;
  logo: string;
  ownerId: string | null;
  ownerName: string | null;
  createdAt: string;
}

type RestaurantDoc = {
  _id: string;
  name: string;
  nameKey: string;
  area: string;
  logo: string;
  managerId: string | null;
  createdAt: string;
};

export type RestaurantResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string; errors?: Record<string, string> };

const restaurantsCollection = () =>
  getCollection<RestaurantDoc>("restaurants", [{ key: { nameKey: 1 }, name: "restaurants_name_unique", unique: true }]);

const nameKeyOf = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

async function ownerNameOf(ownerId: string | null): Promise<string | null> {
  if (!ownerId) return null;
  return (await findAdminAccount(ownerId))?.name ?? null;
}

async function toRestaurant(doc: RestaurantDoc): Promise<Restaurant> {
  return {
    id: doc._id,
    name: doc.name,
    area: doc.area,
    logo: doc.logo,
    ownerId: doc.managerId,
    ownerName: await ownerNameOf(doc.managerId),
    createdAt: doc.createdAt,
  };
}

export async function listRestaurants(): Promise<Restaurant[]> {
  const docs = await (await restaurantsCollection()).find({}).sort({ name: 1 }).limit(500).toArray();
  return Promise.all(docs.map(toRestaurant));
}

// The public list shows only what a customer needs to choose a branch.
export async function listRestaurantsForCustomers(): Promise<{ id: string; name: string; area: string }[]> {
  const docs = await (await restaurantsCollection()).find({}).sort({ name: 1 }).limit(500).toArray();
  return docs.map((d) => ({ id: d._id, name: d.name, area: d.area }));
}

export async function findRestaurant(id: string): Promise<Restaurant | null> {
  const doc = await (await restaurantsCollection()).findOne({ _id: id });
  return doc ? toRestaurant(doc) : null;
}

export async function createRestaurant(input: {
  name: unknown;
  area: unknown;
  logo: unknown;
  ownerId: unknown;
}): Promise<RestaurantResult<Restaurant>> {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const area = typeof input.area === "string" ? input.area.trim().replace(/\s+/g, " ") : "";
  const logo = typeof input.logo === "string" ? input.logo.trim() : "";
  const ownerId = typeof input.ownerId === "string" && input.ownerId ? input.ownerId : null;
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Enter the restaurant name (at least 2 characters).";
  else if (name.length > 80) errors.name = "Keep the restaurant name to 80 characters or fewer.";
  if (!area) errors.area = "Enter the restaurant's area or location.";
  else if (area.length > 120) errors.area = "Keep the area to 120 characters or fewer.";
  if (logo && !isAllowedImageUrl(logo)) errors.logo = "Use an image file or an https link to the logo.";

  if (ownerId) {
    const owner = await findAdminAccount(ownerId);
    if (!owner) errors.ownerId = "Choose an owner.";
    else {
      const all = await (await restaurantsCollection()).find({ managerId: ownerId }).limit(1).toArray();
      if (all.length > 0) errors.ownerId = "This owner already runs another restaurant.";
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };

  const doc: RestaurantDoc = {
    _id: `rest-${Date.now().toString(36)}-${randomHex(3)}`,
    name,
    nameKey: nameKeyOf(name),
    area,
    logo,
    managerId: ownerId,
    createdAt: new Date().toISOString(),
  };
  try {
    await (await restaurantsCollection()).insertOne(doc);
  } catch (err) {
    if (isDuplicateKeyError(err)) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors: { name: "A restaurant with this name already exists." } };
    throw err;
  }
  // The owner who runs the restaurant belongs to it.
  if (ownerId) await setOwnerRestaurant(ownerId, doc._id);
  return { ok: true, value: await toRestaurant(doc) };
}
