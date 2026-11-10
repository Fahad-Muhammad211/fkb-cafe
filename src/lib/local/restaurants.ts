import { getCollection, isDuplicateKeyError } from "@/lib/local/collections";
import { randomHex } from "@/lib/local/random";
import { findAdminAccount } from "@/lib/local/adminAccounts";
import { isAllowedImageUrl } from "@/lib/imageUpload";

// Restaurants. Each restaurant keeps its own orders, staff attendance, grocery, purchases and riders,
// all linked by restaurantId. A restaurant is run by one manager, and a manager runs at most one
// restaurant, so each restaurant's staff list (the manager's team) is unambiguous.

export interface Restaurant {
  id: string;
  name: string;
  area: string;
  logo: string;
  managerId: string | null;
  managerName: string | null;
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

async function managerNameOf(managerId: string | null): Promise<string | null> {
  if (!managerId) return null;
  return (await findAdminAccount(managerId))?.name ?? null;
}

async function toRestaurant(doc: RestaurantDoc): Promise<Restaurant> {
  return {
    id: doc._id,
    name: doc.name,
    area: doc.area,
    logo: doc.logo,
    managerId: doc.managerId,
    managerName: await managerNameOf(doc.managerId),
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
  managerId: unknown;
}): Promise<RestaurantResult<Restaurant>> {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const area = typeof input.area === "string" ? input.area.trim().replace(/\s+/g, " ") : "";
  const logo = typeof input.logo === "string" ? input.logo.trim() : "";
  const managerId = typeof input.managerId === "string" && input.managerId ? input.managerId : null;
  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Enter the restaurant name (at least 2 characters).";
  else if (name.length > 80) errors.name = "Keep the restaurant name to 80 characters or fewer.";
  if (!area) errors.area = "Enter the restaurant's area or location.";
  else if (area.length > 120) errors.area = "Keep the area to 120 characters or fewer.";
  if (logo && !isAllowedImageUrl(logo)) errors.logo = "Use an image file or an https link to the logo.";

  if (managerId) {
    const manager = await findAdminAccount(managerId);
    if (!manager || manager.role !== "manager") errors.managerId = "Choose a manager.";
    else {
      const all = await (await restaurantsCollection()).find({ managerId }).limit(1).toArray();
      if (all.length > 0) errors.managerId = "This manager already runs another restaurant.";
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };

  const doc: RestaurantDoc = {
    _id: `rest-${Date.now().toString(36)}-${randomHex(3)}`,
    name,
    nameKey: nameKeyOf(name),
    area,
    logo,
    managerId,
    createdAt: new Date().toISOString(),
  };
  try {
    await (await restaurantsCollection()).insertOne(doc);
  } catch (err) {
    if (isDuplicateKeyError(err)) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors: { name: "A restaurant with this name already exists." } };
    throw err;
  }
  return { ok: true, value: await toRestaurant(doc) };
}
