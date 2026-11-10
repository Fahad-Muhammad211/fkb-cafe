import { randomHex } from "@/lib/server/random";
import { getCollection } from "@/lib/server/collections";
import type { RestaurantResult } from "@/lib/server/restaurants";

// Records kept per restaurant. Every query is filtered by restaurantId, so one restaurant never sees
// another's grocery, purchases, attendance or riders.

// ---- Grocery -------------------------------------------------------------------------------------

export interface GroceryItem {
  id: string;
  restaurantId: string;
  name: string;
  unit: string;
  quantity: number;
  available: number;
  createdAt: string;
}

type GroceryDoc = Omit<GroceryItem, "id"> & { _id: string };

const groceryCollection = () => getCollection<GroceryDoc>("grocery_items", [{ key: { restaurantId: 1 }, name: "grocery_by_restaurant" }]);

const toGrocery = (d: GroceryDoc): GroceryItem => ({
  id: d._id,
  restaurantId: d.restaurantId,
  name: d.name,
  unit: d.unit,
  quantity: d.quantity,
  available: d.available,
  createdAt: d.createdAt,
});

const isQuantity = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000;

export async function listGrocery(restaurantId: string): Promise<GroceryItem[]> {
  const docs = await (await groceryCollection()).find({ restaurantId }).sort({ name: 1 }).limit(1000).toArray();
  return docs.map(toGrocery);
}

export async function addGroceryItem(restaurantId: string, input: Record<string, unknown>): Promise<RestaurantResult<GroceryItem>> {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const unit = typeof input.unit === "string" && input.unit.trim() ? input.unit.trim() : "pcs";
  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 80) errors.name = "Enter the item name (2 to 80 characters).";
  if (unit.length > 20) errors.unit = "Keep the unit to 20 characters or fewer.";
  if (!isQuantity(input.quantity)) errors.quantity = "Enter a quantity of 0 or more.";
  if (!isQuantity(input.available) || (isQuantity(input.quantity) && (input.available as number) > (input.quantity as number))) {
    errors.available = "Enter the available stock, between 0 and the quantity.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };

  const doc: GroceryDoc = {
    _id: `groc-${Date.now().toString(36)}-${randomHex(3)}`,
    restaurantId,
    name,
    unit,
    quantity: input.quantity as number,
    available: input.available as number,
    createdAt: new Date().toISOString(),
  };
  await (await groceryCollection()).insertOne(doc);
  return { ok: true, value: toGrocery(doc) };
}

// Changes a grocery item's quantity or available stock. The item must belong to the restaurant in the URL.
export async function updateGroceryItem(restaurantId: string, id: string, changes: Record<string, unknown>): Promise<RestaurantResult<GroceryItem>> {
  const collection = await groceryCollection();
  const current = await collection.findOne({ _id: id, restaurantId });
  if (!current) return { ok: false, status: 404, error: "Grocery item not found." };
  const $set: Partial<GroceryDoc> = {};
  if (changes.quantity !== undefined) {
    if (!isQuantity(changes.quantity)) return { ok: false, status: 400, error: "Enter a quantity of 0 or more." };
    $set.quantity = changes.quantity;
  }
  if (changes.available !== undefined) {
    if (!isQuantity(changes.available)) return { ok: false, status: 400, error: "Enter the available stock, between 0 and the quantity." };
    $set.available = changes.available;
  }
  const quantity = $set.quantity ?? current.quantity;
  const available = $set.available ?? current.available;
  if (available > quantity) return { ok: false, status: 400, error: "Available stock cannot be more than the quantity." };
  if (Object.keys($set).length === 0) return { ok: false, status: 400, error: "Nothing to change." };
  const updated = await collection.findOneAndUpdate({ _id: id, restaurantId }, { $set }, { returnDocument: "after" });
  if (!updated) return { ok: false, status: 404, error: "Grocery item not found." };
  return { ok: true, value: toGrocery(updated) };
}

// ---- Purchases -----------------------------------------------------------------------------------

export interface PurchaseRecord {
  id: string;
  restaurantId: string;
  supplier: string;
  description: string;
  amount: number;
  date: string;
  createdAt: string;
}

type PurchaseDoc = Omit<PurchaseRecord, "id"> & { _id: string };

const purchaseCollection = () => getCollection<PurchaseDoc>("purchases", [{ key: { restaurantId: 1 }, name: "purchases_by_restaurant" }]);

const toPurchase = (d: PurchaseDoc): PurchaseRecord => ({
  id: d._id,
  restaurantId: d.restaurantId,
  supplier: d.supplier,
  description: d.description,
  amount: d.amount,
  date: d.date,
  createdAt: d.createdAt,
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const isValidDate = (value: unknown): value is string => typeof value === "string" && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));

export async function listPurchases(restaurantId: string): Promise<PurchaseRecord[]> {
  const docs = await (await purchaseCollection()).find({ restaurantId }).sort({ date: -1 }).limit(1000).toArray();
  return docs.map(toPurchase);
}

export async function addPurchase(restaurantId: string, input: Record<string, unknown>): Promise<RestaurantResult<PurchaseRecord>> {
  const supplier = typeof input.supplier === "string" ? input.supplier.trim().replace(/\s+/g, " ") : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const errors: Record<string, string> = {};
  if (supplier.length < 2 || supplier.length > 80) errors.supplier = "Enter the supplier name (2 to 80 characters).";
  if (description.length > 200) errors.description = "Keep the description to 200 characters or fewer.";
  if (!isQuantity(input.amount)) errors.amount = "Enter the amount in PKR.";
  if (!isValidDate(input.date)) errors.date = "Choose the purchase date.";
  if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };

  const doc: PurchaseDoc = {
    _id: `purch-${Date.now().toString(36)}-${randomHex(3)}`,
    restaurantId,
    supplier,
    description,
    amount: input.amount as number,
    date: input.date as string,
    createdAt: new Date().toISOString(),
  };
  await (await purchaseCollection()).insertOne(doc);
  return { ok: true, value: toPurchase(doc) };
}

// ---- Attendance ----------------------------------------------------------------------------------

export interface AttendanceRecord {
  staffId: string;
  date: string;
  status: "present" | "absent";
  checkIn: string;
  checkOut: string;
  updatedAt: string;
}

type AttendanceDoc = AttendanceRecord & { _id: string; restaurantId: string };

const attendanceCollection = () =>
  getCollection<AttendanceDoc>("attendance_records", [{ key: { restaurantId: 1, date: 1 }, name: "attendance_by_restaurant_date" }]);

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function listAttendance(restaurantId: string, date: string): Promise<AttendanceRecord[]> {
  const docs = await (await attendanceCollection()).find({ restaurantId, date }).limit(1000).toArray();
  return docs.map((d) => ({ staffId: d.staffId, date: d.date, status: d.status, checkIn: d.checkIn, checkOut: d.checkOut, updatedAt: d.updatedAt }));
}

// Saves one staff member's attendance for one day. Marking someone absent clears their times.
// The caller checks that the staff member works for this restaurant.
export async function saveAttendance(
  restaurantId: string,
  input: { staffId: string; date: unknown; status: unknown; checkIn: unknown; checkOut: unknown },
): Promise<RestaurantResult<AttendanceRecord>> {
  if (!isValidDate(input.date)) return { ok: false, status: 400, error: "Choose a valid date." };
  if (input.status !== "present" && input.status !== "absent") return { ok: false, status: 400, error: "Choose present or absent." };
  const checkIn = typeof input.checkIn === "string" ? input.checkIn : "";
  const checkOut = typeof input.checkOut === "string" ? input.checkOut : "";
  const errors: Record<string, string> = {};
  if (input.status === "present") {
    if (checkIn && !TIME_PATTERN.test(checkIn)) errors.checkIn = "Use a 24-hour time such as 09:30.";
    if (checkOut && !TIME_PATTERN.test(checkOut)) errors.checkOut = "Use a 24-hour time such as 18:00.";
    if (checkIn && checkOut && checkOut <= checkIn) errors.checkOut = "Check-out must be after check-in.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };

  const record: AttendanceRecord = {
    staffId: input.staffId,
    date: input.date as string,
    status: input.status,
    checkIn: input.status === "present" ? checkIn : "",
    checkOut: input.status === "present" ? checkOut : "",
    updatedAt: new Date().toISOString(),
  };
  const id = `att-${restaurantId}-${record.date}-${record.staffId}`;
  await (await attendanceCollection()).updateOne({ _id: id }, { $set: { ...record, restaurantId, _id: id } }, { upsert: true });
  return { ok: true, value: record };
}

// ---- Riders --------------------------------------------------------------------------------------

export interface Rider {
  id: string;
  restaurantId: string;
  name: string;
  phone: string;
  status: "online" | "offline";
  lat: number | null;
  lng: number | null;
  locatedAt: string | null;
  createdAt: string;
}

type RiderDoc = Omit<Rider, "id"> & { _id: string };

const riderCollection = () => getCollection<RiderDoc>("riders", [{ key: { restaurantId: 1 }, name: "riders_by_restaurant" }]);

const toRider = (d: RiderDoc): Rider => ({
  id: d._id,
  restaurantId: d.restaurantId,
  name: d.name,
  phone: d.phone,
  status: d.status,
  lat: d.lat,
  lng: d.lng,
  locatedAt: d.locatedAt,
  createdAt: d.createdAt,
});

export async function listRiders(restaurantId: string): Promise<Rider[]> {
  const docs = await (await riderCollection()).find({ restaurantId }).sort({ name: 1 }).limit(500).toArray();
  return docs.map(toRider);
}

export async function findRider(id: string): Promise<Rider | null> {
  const doc = await (await riderCollection()).findOne({ _id: id });
  return doc ? toRider(doc) : null;
}

const PHONE_PATTERN = /^[0-9+\-\s()]{7,20}$/;

export async function addRider(restaurantId: string, input: Record<string, unknown>): Promise<RestaurantResult<Rider>> {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const errors: Record<string, string> = {};
  if (name.length < 2 || name.length > 60) errors.name = "Enter the rider's name (2 to 60 characters).";
  if (!PHONE_PATTERN.test(phone)) errors.phone = "Enter a valid phone number.";
  if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };
  const doc: RiderDoc = {
    _id: `rider-${Date.now().toString(36)}-${randomHex(3)}`,
    restaurantId,
    name,
    phone,
    status: "offline",
    lat: null,
    lng: null,
    locatedAt: null,
    createdAt: new Date().toISOString(),
  };
  await (await riderCollection()).insertOne(doc);
  return { ok: true, value: toRider(doc) };
}

export async function updateRiderStatus(id: string, status: unknown): Promise<RestaurantResult<Rider>> {
  if (status !== "online" && status !== "offline") return { ok: false, status: 400, error: "Choose online or offline." };
  const updated = await (await riderCollection()).findOneAndUpdate({ _id: id }, { $set: { status } }, { returnDocument: "after" });
  if (!updated) return { ok: false, status: 404, error: "Rider not found." };
  return { ok: true, value: toRider(updated) };
}

// Stores a rider's position as reported by the browser that shares it.
export async function setRiderLocation(id: string, lat: unknown, lng: unknown): Promise<RestaurantResult<Rider>> {
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, status: 400, error: "Invalid latitude." };
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) return { ok: false, status: 400, error: "Invalid longitude." };
  const updated = await (await riderCollection()).findOneAndUpdate(
    { _id: id },
    { $set: { lat, lng, locatedAt: new Date().toISOString() } },
    { returnDocument: "after" },
  );
  if (!updated) return { ok: false, status: 404, error: "Rider not found." };
  return { ok: true, value: toRider(updated) };
}
