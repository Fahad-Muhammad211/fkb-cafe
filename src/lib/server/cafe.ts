import "server-only";
import { getCollection } from "@/lib/server/collections";
import { readCatalog } from "@/lib/server/catalog";
import { randomHex } from "@/lib/server/random";
import { deductForOrder } from "@/lib/server/stock";
import { addStaff, removeStaffRecord, staffCol } from "@/lib/server/cafeStaff";
import type { Actor } from "@/lib/server/activity";
import type { CafeOrder, CafeOrderLine, CafeSettings, CafeSnapshot, CafeTable, CafeWaiter, CafeHistory, WaiterStats } from "@/lib/cafeTypes";

// The Admin's in-house cafe: dine-in tables served by waiters, and takeaway orders.
//
// Table lifecycle:  free → (order placed) occupied → (bill paid) cleaning → (cleaned) free
// Order lifecycle:  preparing → (food ready / served) ready → (paid) completed
//
// Every state change is a conditional update on the current state, so two devices pressing the same
// button cannot skip or repeat a step. Prices come from the saved menu, never from the browser.

type TableDoc = Omit<CafeTable, "id"> & { _id: string };
type OrderDoc = Omit<CafeOrder, "id"> & { _id: string };
type SettingsDoc = CafeSettings & { _id: string; nextOrderNumber: number };

const tablesCol = () => getCollection<TableDoc>("cafe_tables", [{ key: { number: 1 }, name: "number", unique: true }]);
const ordersCol = () =>
  getCollection<OrderDoc>("cafe_orders", [
    { key: { createdAt: -1 }, name: "createdAt" },
    { key: { status: 1 }, name: "status" },
  ]);
const settingsCol = () => getCollection<SettingsDoc>("cafe_settings");

export const MAX_TABLES = 200;
const MAX_LINES = 60;
const MAX_QTY = 99;
const DEFAULT_SETTINGS: CafeSettings = { prepAlertMinutes: 15, tableAlertMinutes: 60 };

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

const toTable = ({ _id, ...rest }: TableDoc): CafeTable => ({ id: _id, ...rest });
const toOrder = ({ _id, ...rest }: OrderDoc): CafeOrder => ({ id: _id, ...rest });
const now = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${randomHex(4)}`;

async function readSettings(): Promise<CafeSettings> {
  const doc = await (await settingsCol()).findOne({ _id: "settings" });
  return { prepAlertMinutes: doc?.prepAlertMinutes ?? DEFAULT_SETTINGS.prepAlertMinutes, tableAlertMinutes: doc?.tableAlertMinutes ?? DEFAULT_SETTINGS.tableAlertMinutes };
}

async function nextOrderNumber(): Promise<number> {
  const doc = await (await settingsCol()).findOneAndUpdate(
    { _id: "settings" },
    { $inc: { nextOrderNumber: 1 }, $setOnInsert: { ...DEFAULT_SETTINGS } },
    { upsert: true, returnDocument: "after" },
  );
  return doc?.nextOrderNumber ?? 1;
}

// Everything the Cafe and Takeaway screens show: tables, waiters, settings and the open orders.
export async function readCafe(): Promise<CafeSnapshot> {
  const [tables, waiters, orders, settings] = await Promise.all([
    (await tablesCol()).find({}).sort({ number: 1 }).toArray(),
    (await staffCol()).find({ kind: "waiter", active: true }).sort({ nameLower: 1 }).toArray(),
    (await ordersCol()).find({ status: { $ne: "completed" } }).sort({ createdAt: 1 }).toArray(),
    readSettings(),
  ]);
  return { tables: tables.map(toTable), waiters: waiters.map((w): CafeWaiter => ({ id: w._id, name: w.name, phone: w.phone, createdAt: w.createdAt })), openOrders: orders.map(toOrder), settings };
}

// ----- Setup: tables, waiters, assignments, alert thresholds -----

// Sets the total number of tables. New tables are numbered after the last one. Reducing removes the
// highest-numbered tables, but only when they are free.
export async function setTableCount(raw: unknown): Promise<Result<number>> {
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 0 || count > MAX_TABLES) return fail(400, `Enter a whole number from 0 to ${MAX_TABLES}.`);
  const col = await tablesCol();
  const existing = await col.find({}).sort({ number: 1 }).toArray();
  if (count > existing.length) {
    const highest = existing.reduce((max, t) => Math.max(max, t.number), 0);
    const fresh: TableDoc[] = Array.from({ length: count - existing.length }, (_, i) => ({
      _id: newId("table"),
      number: highest + i + 1,
      status: "free",
      waiterId: null,
      orderId: null,
    }));
    await col.insertMany(fresh);
  } else if (count < existing.length) {
    const remove = existing.slice(count);
    const busy = remove.filter((t) => t.status !== "free");
    if (busy.length > 0) return fail(409, `Table ${busy.map((t) => t.number).join(", ")} is in use. Finish it before removing tables.`);
    await col.deleteMany({ _id: { $in: remove.map((t) => t._id) }, status: "free" });
  }
  return ok(count);
}

// Waiters are kept in the staff directory (Employees page); the Cafe screen adds them by name and phone.
export async function addWaiter(body: Record<string, unknown>, actor: Actor): Promise<Result<CafeWaiter>> {
  const res = await addStaff("waiter", { name: body.name, phone: body.phone, salary: body.salary, duty: body.duty }, actor);
  if (!res.ok) return fail(res.status, res.errors ? Object.values(res.errors)[0] : res.error);
  return ok({ id: res.value.id, name: res.value.name, phone: res.value.phone, createdAt: res.value.createdAt });
}

// Removes a waiter. Their tables become unassigned; past orders keep the waiter's name.
export async function removeWaiter(id: string): Promise<Result<true>> {
  const waiter = await (await staffCol()).findOne({ _id: id, kind: "waiter" });
  if (!waiter) return fail(404, "Waiter not found.");
  const res = await removeStaffRecord(id);
  return res.ok ? ok(true) : fail(res.status, res.error);
}

// Adds one table after the highest table number.
export async function addTable(): Promise<Result<CafeTable>> {
  const col = await tablesCol();
  if ((await col.countDocuments()) >= MAX_TABLES) return fail(400, `A cafe can have up to ${MAX_TABLES} tables.`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await col.find({}).sort({ number: -1 }).limit(1).toArray();
    const doc: TableDoc = { _id: newId("table"), number: (last[0]?.number ?? 0) + 1, status: "free", waiterId: null, orderId: null };
    try {
      await col.insertOne(doc);
      return ok(toTable(doc));
    } catch (err) {
      // Another screen added the same number at the same moment: try the next one.
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  return fail(409, "Could not add a table. Please try again.");
}

// Gives the waiter exactly these tables. A table belongs to one waiter, so a table taken from another
// waiter moves over; tables this waiter had but are not listed become unassigned.
export async function assignTables(waiterId: string, raw: unknown): Promise<Result<true>> {
  if (!Array.isArray(raw) || raw.length > MAX_TABLES || !raw.every((v) => typeof v === "string")) return fail(400, "Invalid table list.");
  if (!(await (await staffCol()).findOne({ _id: waiterId, kind: "waiter", active: true }))) return fail(404, "Waiter not found.");
  const col = await tablesCol();
  const ids = [...new Set(raw as string[])];
  await col.updateMany({ waiterId, _id: { $nin: ids } }, { $set: { waiterId: null } });
  if (ids.length > 0) await col.updateMany({ _id: { $in: ids } }, { $set: { waiterId } });
  return ok(true);
}

export async function saveSettings(body: Record<string, unknown>): Promise<Result<CafeSettings>> {
  const prep = Number(body.prepAlertMinutes);
  const table = Number(body.tableAlertMinutes);
  if (!Number.isInteger(prep) || prep < 1 || prep > 600) return fail(400, "Preparation alert must be 1–600 minutes.");
  if (!Number.isInteger(table) || table < 1 || table > 1440) return fail(400, "Table alert must be 1–1440 minutes.");
  const settings = { prepAlertMinutes: prep, tableAlertMinutes: table };
  await (await settingsCol()).updateOne({ _id: "settings" }, { $set: settings, $setOnInsert: { nextOrderNumber: 0 } }, { upsert: true });
  return ok(settings);
}

// ----- Orders -----

// Turns [{ productId, qty }] into priced lines from the saved menu. Unknown, hidden or sold-out
// products are refused, so the bill always matches the menu.
async function priceLines(raw: unknown): Promise<Result<CafeOrderLine[]>> {
  if (!Array.isArray(raw) || raw.length === 0) return fail(400, "Select at least one item.");
  if (raw.length > MAX_LINES) return fail(400, "Too many items in one order.");
  const { products } = await readCatalog();
  const byId = new Map(products.map((p) => [p.id, p]));
  const merged = new Map<string, number>();
  for (const entry of raw) {
    const productId = typeof entry?.productId === "string" ? entry.productId : "";
    const qty = Number(entry?.qty);
    if (!productId || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail(400, "Each item needs a quantity from 1 to 99.");
    merged.set(productId, Math.min(MAX_QTY, (merged.get(productId) ?? 0) + qty));
  }
  const lines: CafeOrderLine[] = [];
  for (const [productId, qty] of merged) {
    const product = byId.get(productId);
    if (!product || product.available === false) return fail(400, "One of the items is no longer on the menu.");
    if (product.stock === "out") return fail(400, `${product.name} is sold out.`);
    lines.push({ productId, name: product.name, price: product.price, qty });
  }
  return ok(lines);
}

const totalOf = (lines: CafeOrderLine[]) => lines.reduce((sum, l) => sum + l.price * l.qty, 0);

function mergeLines(existing: CafeOrderLine[], added: CafeOrderLine[]): CafeOrderLine[] {
  const out = existing.map((l) => ({ ...l }));
  for (const line of added) {
    const same = out.find((l) => l.productId === line.productId && l.price === line.price);
    if (same) same.qty = Math.min(MAX_QTY, same.qty + line.qty);
    else out.push(line);
  }
  return out;
}

// Places the order for a free table (the timer starts now), or adds items to the table's open order.
// Items added after the food was served put the order back to "preparing".
export async function orderForTable(tableId: string, rawItems: unknown): Promise<Result<CafeOrder>> {
  const priced = await priceLines(rawItems);
  if (!priced.ok) return priced;
  const tables = await tablesCol();
  const table = await tables.findOne({ _id: tableId });
  if (!table) return fail(404, "Table not found.");
  const orders = await ordersCol();

  if (table.status === "occupied" && table.orderId) {
    const current = await orders.findOne({ _id: table.orderId, status: { $ne: "completed" } });
    if (!current) return fail(409, "This table's order is already closed.");
    const items = mergeLines(current.items, priced.value);
    const updated = await orders.findOneAndUpdate(
      { _id: current._id, status: current.status, items: current.items },
      { $set: { items, total: totalOf(items), status: "preparing", readyAt: null } },
      { returnDocument: "after" },
    );
    if (!updated) return fail(409, "The order changed on another screen. Please try again.");
    return ok(toOrder(updated));
  }
  if (table.status !== "free") return fail(409, "This table is waiting to be cleaned.");

  // Claim the table first, so two screens cannot seat two orders at it (and the loser uses no order number).
  const orderId = newId("cafe");
  const createdAt = now();
  const claimed = await tables.updateOne({ _id: tableId, status: "free" }, { $set: { status: "occupied", orderId, occupiedAt: createdAt } });
  if (!claimed.modifiedCount) return fail(409, "This table was just taken on another screen.");

  const waiter = table.waiterId ? await (await staffCol()).findOne({ _id: table.waiterId }) : null;
  const doc: OrderDoc = {
    _id: orderId,
    number: await nextOrderNumber(),
    kind: "table",
    tableId,
    tableNumber: table.number,
    waiterId: waiter?._id ?? null,
    waiterName: waiter?.name ?? null,
    customerName: null,
    items: priced.value,
    total: totalOf(priced.value),
    status: "preparing",
    createdAt,
    readyAt: null,
    completedAt: null,
  };
  await orders.insertOne(doc);
  return ok(toOrder(doc));
}

export async function createTakeaway(body: Record<string, unknown>): Promise<Result<CafeOrder>> {
  const priced = await priceLines(body.items);
  if (!priced.ok) return priced;
  const customerName = String(body.customerName ?? "").trim().slice(0, 60) || null;
  const doc: OrderDoc = {
    _id: newId("cafe"),
    number: await nextOrderNumber(),
    kind: "takeaway",
    tableId: null,
    tableNumber: null,
    waiterId: null,
    waiterName: null,
    customerName,
    items: priced.value,
    total: totalOf(priced.value),
    status: "preparing",
    createdAt: now(),
    readyAt: null,
    completedAt: null,
  };
  await (await ordersCol()).insertOne(doc);
  return ok(toOrder(doc));
}

// Food is ready (takeaway) or served (table): records how long it took to prepare.
export async function markReady(orderId: string): Promise<Result<CafeOrder>> {
  const doc = await (await ordersCol()).findOneAndUpdate({ _id: orderId, status: "preparing" }, { $set: { status: "ready", readyAt: now() } }, { returnDocument: "after" });
  if (!doc) return fail(409, "This order is not being prepared.");
  return ok(toOrder(doc));
}

// Bill received. The order is completed; a dine-in table moves to "needs cleaning".
export async function completeOrder(orderId: string): Promise<Result<CafeOrder>> {
  const orders = await ordersCol();
  const at = now();
  const current = await orders.findOne({ _id: orderId, status: { $ne: "completed" } });
  if (!current) return fail(409, "This order is already completed.");
  const doc = await orders.findOneAndUpdate(
    { _id: orderId, status: current.status },
    { $set: { status: "completed", completedAt: at, readyAt: current.readyAt ?? at } },
    { returnDocument: "after" },
  );
  if (!doc) return fail(409, "The order changed on another screen. Please try again.");
  if (doc.tableId) {
    await (await tablesCol()).updateOne({ _id: doc.tableId, orderId }, { $set: { status: "cleaning", orderId: null, cleaningSince: at } });
  }
  // Paid: take the recipe ingredients out of stock.
  await deductForOrder(doc._id, doc.items);
  return ok(toOrder(doc));
}

export async function markCleaned(tableId: string): Promise<Result<true>> {
  const res = await (await tablesCol()).updateOne(
    { _id: tableId, status: "cleaning" },
    { $set: { status: "free", orderId: null }, $unset: { occupiedAt: "", cleaningSince: "" } },
  );
  if (!res.matchedCount) return fail(409, "This table is not waiting to be cleaned.");
  return ok(true);
}

// ----- History -----

// Completed and open orders placed since `from` (or all of them), with totals. Revenue counts only
// completed (paid) orders.
export async function readHistory(fromRaw: string | null): Promise<Result<CafeHistory>> {
  let filter = {};
  if (fromRaw) {
    const from = new Date(fromRaw);
    if (Number.isNaN(from.getTime())) return fail(400, "Invalid date.");
    filter = { createdAt: { $gte: from.toISOString() } };
  }
  const col = await ordersCol();
  const [docs, all] = await Promise.all([
    col.find(filter).sort({ createdAt: -1 }).limit(300).toArray(),
    col.find(filter, { projection: { kind: 1, status: 1, total: 1, createdAt: 1, readyAt: 1 } }).toArray(),
  ]);
  const paid = all.filter((o) => o.status === "completed");
  const prepTimes = all.filter((o) => o.readyAt).map((o) => Date.parse(o.readyAt as string) - Date.parse(o.createdAt));
  return ok({
    orders: docs.map(toOrder),
    totalOrders: all.length,
    completedOrders: paid.length,
    tableOrders: all.filter((o) => o.kind === "table").length,
    takeawayOrders: all.filter((o) => o.kind === "takeaway").length,
    revenue: paid.reduce((sum, o) => sum + o.total, 0),
    averagePrepMs: prepTimes.length ? Math.round(prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) : null,
  });
}

// ----- Waiter performance -----

function sinceFilter(fromRaw: string | null): Result<Record<string, unknown>> {
  if (!fromRaw) return ok({});
  const from = new Date(fromRaw);
  if (Number.isNaN(from.getTime())) return fail(400, "Invalid date.");
  return ok({ createdAt: { $gte: from.toISOString() } });
}

// Per waiter: orders taken on their tables, paid bills and sales. Waiters who were removed still
// appear while their past orders fall in the period.
export async function readWaiterPerformance(fromRaw: string | null): Promise<Result<WaiterStats[]>> {
  const since = sinceFilter(fromRaw);
  if (!since.ok) return since;
  const [waiters, tables, orders] = await Promise.all([
    (await staffCol()).find({ kind: "waiter" }).toArray(),
    (await tablesCol()).find({}).sort({ number: 1 }).toArray(),
    (await ordersCol())
      .find({ ...since.value, kind: "table", waiterId: { $ne: null } }, { projection: { waiterId: 1, waiterName: 1, status: 1, total: 1, createdAt: 1 } })
      .toArray(),
  ]);
  const blank = (id: string, name: string, active: boolean, current: boolean, tableNumbers: number[]): WaiterStats => ({
    id,
    name,
    active,
    current,
    tables: tableNumbers,
    totalOrders: 0,
    openOrders: 0,
    totalBills: 0,
    totalSales: 0,
    averageBill: 0,
    lastOrderAt: null,
  });
  const stats = new Map<string, WaiterStats>();
  for (const w of waiters) {
    stats.set(w._id, blank(w._id, w.name, w.active, true, tables.filter((t) => t.waiterId === w._id).map((t) => t.number)));
  }
  for (const o of orders) {
    const id = o.waiterId as string;
    let s = stats.get(id);
    if (!s) {
      s = blank(id, o.waiterName ?? "Removed waiter", false, false, []);
      stats.set(id, s);
    }
    s.totalOrders += 1;
    if (o.status === "completed") {
      s.totalBills += 1;
      s.totalSales += o.total;
    } else s.openOrders += 1;
    if (!s.lastOrderAt || o.createdAt > s.lastOrderAt) s.lastOrderAt = o.createdAt;
  }
  const list = [...stats.values()]
    .filter((s) => s.current || s.totalOrders > 0)
    .map((s) => ({ ...s, averageBill: s.totalBills ? Math.round(s.totalSales / s.totalBills) : 0 }));
  list.sort((a, b) => b.totalSales - a.totalSales || a.name.localeCompare(b.name));
  return ok(list);
}

export async function readWaiterOrders(waiterId: string, fromRaw: string | null): Promise<Result<CafeOrder[]>> {
  const since = sinceFilter(fromRaw);
  if (!since.ok) return since;
  const docs = await (await ordersCol()).find({ ...since.value, waiterId }).sort({ createdAt: -1 }).limit(300).toArray();
  return ok(docs.map(toOrder));
}

// ----- Dashboard reads -----

// Every order placed since `from`.
export async function cafeOrdersSince(from: string): Promise<CafeOrder[]> {
  return (await (await ordersCol()).find({ createdAt: { $gte: from } }).toArray()).map(toOrder);
}

// Orders paid since `from` (by payment time), whenever they were placed.
export async function cafeOrdersPaidSince(from: string): Promise<CafeOrder[]> {
  return (await (await ordersCol()).find({ status: "completed", completedAt: { $gte: from } }).toArray()).map(toOrder);
}

export async function recentCafeOrders(limit: number): Promise<CafeOrder[]> {
  return (await (await ordersCol()).find({}).sort({ createdAt: -1 }).limit(limit).toArray()).map(toOrder);
}

export async function allCafeOrderLines(): Promise<{ items: CafeOrderLine[] }[]> {
  return (await (await ordersCol()).find({}, { projection: { items: 1 } }).toArray()) as unknown as { items: CafeOrderLine[] }[];
}
