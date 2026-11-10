import "server-only";
import { getCollection, isDuplicateKeyError } from "@/lib/server/collections";
import { randomInt } from "@/lib/server/random";
import { extraOptionGroups } from "@/data/menuOptions";
import { cancelOrder, confirmOrder } from "@/lib/server/orders";
import { listPurchases } from "@/lib/server/restaurantRecords";
import type { OwnerContext } from "@/lib/server/ownerAccess";
import type { CartLine, MenuItem, Order, OrderEvent, ProductOption } from "@/types";
import type {
  KitchenStatus,
  OrderType,
  PaymentHistoryEntry,
  PaymentInfo,
  PosLineInput,
  PosOrder,
  PosPaymentMethod,
  RestaurantTable,
  SalesSummary,
} from "@/types/pos";

// The restaurant POS, Kitchen Display Screen and Owner dashboard data.
//
// Single order record: POS orders (dine-in, takeaway) are written to the same "orders" collection as
// online orders from the website, with their payment record in "payments" and their status changes in
// "order_status_history" (the same shapes lib/server/orders.ts uses). Every screen reads that one
// document, so the Owner, the Kitchen and the Customer always see the same order.
//
// One invoice and one token per order: both are given out once, by a conditional update that only
// matches an order without an invoice. Unique indexes on the invoice number and on (restaurant, day,
// token) make MongoDB reject any duplicate, and the browser's clientOrderId (unique index) means a
// retried "Confirm order" returns the order already created instead of creating a second one.
//
// Kitchen progress is the order's existing fulfilment step (statusOverride), so the customer's
// tracking timeline, the admin order list and the kitchen screen all move together:
//   step 1 Pending, 2 Preparing, 3 Ready, 4 Served (dine-in/takeaway/pickup) or Delivered (delivery).

// Tokens restart every day at midnight restaurant time. Prices are in PKR, so days follow Pakistan time.
const TIME_ZONE = "Asia/Karachi";

const CLIENT_ORDER_ID = /^[A-Za-z0-9_-]{16,64}$/;
const PHONE = /^[0-9+\-\s()]{7,20}$/;
const MAX_LINES = 30;
const MAX_QTY = 99;
const LAST_STEP = 4;

type StoredOrderType = "dine_in" | "takeaway";

type OrderDoc = Omit<Order, "id" | "history" | "payment"> & {
  _id: string;
  payment: string;
  orderType?: StoredOrderType;
  tableId?: string;
  tableNumber?: number;
  invoiceNumber?: string;
  tokenNumber?: number;
  tokenDate?: string;
  createdBy?: string;
};

type PaymentDoc = {
  _id: string;
  orderId: string;
  restaurantId?: string;
  amount: number;
  currency: "PKR";
  method: PosPaymentMethod;
  status: "pending" | "paid" | "cancelled";
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  receivedBy?: string;
  history?: PaymentHistoryEntry[];
};

type EventDoc = OrderEvent & { _id: string; orderId: string };
type TableDoc = { _id: string; restaurantId: string; number: number; seats: number; reserved: boolean; createdAt: string };
type CounterDoc = { _id: string; seq: number };
// One per restaurant (_id = restaurantId): the Owner's table settings from /owner/settings.
type TableSettingsDoc = { _id: string; restaurantId: string; tableCount: number; seats: number; updatedAt: string; updatedBy?: string };
type ProductDoc = MenuItem & { _id: string };

export type PosResult<T> = { ok: true; value: T; created?: boolean } | { ok: false; status: number; error: string; errors?: Record<string, string> };

const fail = (status: number, error: string, errors?: Record<string, string>) => ({ ok: false as const, status, error, ...(errors ? { errors } : {}) });

// ---- Collections and indexes ----------------------------------------------------------------------

const ordersCollection = () => getCollection<OrderDoc>("orders");
const paymentsCollection = () => getCollection<PaymentDoc>("payments");
const historyCollection = () => getCollection<EventDoc>("order_status_history");
const countersCollection = () => getCollection<CounterDoc>("pos_counters");
const productsCollection = () => getCollection<ProductDoc>("products");
const tablesCollection = () =>
  getCollection<TableDoc>("restaurant_tables", [
    { key: { restaurantId: 1, number: 1 }, name: "tables_restaurant_number_unique", unique: true },
  ]);
const tableSettingsCollection = () => getCollection<TableSettingsDoc>("restaurant_settings");

// The order indexes this module relies on. Created once per process. createIndexes is a no-op for an
// index that already exists with the same definition (the clientOrderId one is also made by orders.ts).
let orderIndexes: Promise<void> | null = null;
function ensureOrderIndexes(): Promise<void> {
  if (!orderIndexes) {
    orderIndexes = (async () => {
      const orders = await ordersCollection();
      await orders.createIndexes([
        { key: { clientOrderId: 1 }, name: "orders_client_order_id_unique", unique: true },
        { key: { restaurantId: 1, createdAt: -1 }, name: "orders_restaurant_created" },
        {
          key: { invoiceNumber: 1 },
          name: "orders_invoice_number_unique",
          unique: true,
          partialFilterExpression: { invoiceNumber: { $type: "string" } },
        },
        {
          key: { restaurantId: 1, tokenDate: 1, tokenNumber: 1 },
          name: "orders_restaurant_day_token_unique",
          unique: true,
          partialFilterExpression: { tokenNumber: { $type: "number" } },
        },
      ]);
      await (await paymentsCollection()).createIndexes([{ key: { orderId: 1 }, name: "payments_order_unique", unique: true }]);
    })().catch((err: unknown) => {
      orderIndexes = null;
      throw err;
    });
  }
  return orderIndexes;
}

// ---- Dates, invoice and token numbers -------------------------------------------------------------

export function dayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

async function nextSequence(key: string): Promise<number> {
  const doc = await (await countersCollection()).findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  if (!doc) throw new Error("Counter update returned nothing.");
  return doc.seq;
}

// A fresh invoice number (unique across all restaurants) and the restaurant's next token for today.
async function issueNumbers(restaurantId: string): Promise<{ invoiceNumber: string; tokenNumber: number; tokenDate: string }> {
  const tokenDate = dayKey();
  const compact = tokenDate.replace(/-/g, "");
  const invoiceSeq = await nextSequence(`invoice:${tokenDate}`);
  const tokenNumber = await nextSequence(`token:${restaurantId}:${tokenDate}`);
  return { invoiceNumber: `INV-${compact}-${String(invoiceSeq).padStart(4, "0")}`, tokenNumber, tokenDate };
}

// Gives a confirmed order its invoice and token, once. If two requests race, only the first update
// matches (the filter requires no invoice yet); the other's numbers are simply never used.
async function ensureInvoice(doc: OrderDoc): Promise<OrderDoc> {
  if (doc.invoiceNumber || !doc.restaurantId || doc.status !== "confirmed") return doc;
  const numbers = await issueNumbers(doc.restaurantId);
  const orders = await ordersCollection();
  const updated = await orders.findOneAndUpdate(
    { _id: doc._id, invoiceNumber: { $exists: false } },
    { $set: numbers },
    { returnDocument: "after" },
  );
  return updated ?? (await orders.findOne({ _id: doc._id })) ?? doc;
}

// ---- Shaping orders for the screens --------------------------------------------------------------

function stepOf(doc: OrderDoc): number {
  return Math.min(LAST_STEP, Math.max(1, doc.statusOverride ?? 1));
}

function orderTypeOf(doc: OrderDoc): OrderType {
  return doc.orderType === "dine_in" || doc.orderType === "takeaway" ? doc.orderType : "online";
}

export function kitchenStatusOf(doc: { status?: string; statusOverride?: number; fulfilment: string }): KitchenStatus {
  if (doc.status === "cancelled") return "cancelled";
  if (doc.status === "pending") return "awaiting";
  const step = Math.min(LAST_STEP, Math.max(1, doc.statusOverride ?? 1));
  if (step <= 1) return "pending";
  if (step === 2) return "preparing";
  if (step === 3) return "ready";
  return doc.fulfilment === "delivery" ? "delivered" : "served";
}

function toPaymentInfo(p: PaymentDoc): PaymentInfo {
  return {
    id: p._id,
    status: p.status,
    method: p.method,
    amount: p.amount,
    paidAt: p.paidAt ?? null,
    history: p.history ?? [{ event: "created", amount: p.amount, method: p.method, at: p.createdAt, by: "customer" }],
  };
}

async function shape(docs: OrderDoc[]): Promise<PosOrder[]> {
  if (docs.length === 0) return [];
  const ids = docs.map((d) => d._id);
  const [events, payments] = await Promise.all([
    (await historyCollection()).find({ orderId: { $in: ids } }).sort({ at: 1 }).toArray(),
    (await paymentsCollection()).find({ orderId: { $in: ids } }).toArray(),
  ]);
  const paymentByOrder = new Map(payments.map((p) => [p.orderId, p]));
  return docs.map((doc) => {
    const { _id, ...rest } = doc;
    const payment = paymentByOrder.get(_id);
    return {
      ...(rest as Omit<OrderDoc, "_id">),
      payment: rest.payment as Order["payment"],
      id: _id,
      orderType: orderTypeOf(doc),
      kitchenStatus: kitchenStatusOf(doc),
      history: events.filter((e) => e.orderId === _id).map(({ event, step, at, actor }) => ({ event, step, at, actor })),
      ...(payment ? { paymentInfo: toPaymentInfo(payment) } : {}),
    };
  });
}

async function findRestaurantOrderDoc(restaurantId: string, orderId: string): Promise<OrderDoc | null> {
  return (await ordersCollection()).findOne({ _id: orderId, restaurantId });
}

// ---- Tables ----------------------------------------------------------------------------------------

const OPEN_DINE_IN = { orderType: "dine_in", status: { $ne: "cancelled" }, paymentStatus: { $ne: "paid" } } as const;

export async function listTables(restaurantId: string): Promise<RestaurantTable[]> {
  const tables = await (await tablesCollection()).find({ restaurantId }).sort({ number: 1 }).limit(500).toArray();
  const open = await (await ordersCollection())
    .find({ restaurantId, ...OPEN_DINE_IN }, { projection: { _id: 1, tableId: 1, invoiceNumber: 1, tokenNumber: 1, total: 1, status: 1, statusOverride: 1, fulfilment: 1 } })
    .sort({ createdAt: 1 })
    .limit(1000)
    .toArray();
  return tables.map((t) => {
    const openOrders = open
      .filter((o) => o.tableId === t._id)
      .map((o) => ({ id: o._id, invoiceNumber: o.invoiceNumber, tokenNumber: o.tokenNumber, total: o.total, kitchenStatus: kitchenStatusOf(o) }));
    return {
      id: t._id,
      number: t.number,
      seats: t.seats,
      reserved: t.reserved,
      status: openOrders.length > 0 ? "occupied" : t.reserved ? "reserved" : "available",
      openOrders,
    };
  });
}

const isWhole = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

export async function createTable(restaurantId: string, input: Record<string, unknown>): Promise<PosResult<RestaurantTable>> {
  const tables = await tablesCollection();
  let number = input.number;
  if (number === undefined || number === null || number === "") {
    const last = await tables.find({ restaurantId }).sort({ number: -1 }).limit(1).toArray();
    number = (last[0]?.number ?? 0) + 1;
  }
  const seats = input.seats === undefined ? 4 : input.seats;
  const errors: Record<string, string> = {};
  if (!isWhole(number, 1, 999)) errors.number = "Enter a table number from 1 to 999.";
  if (!isWhole(seats, 1, 50)) errors.seats = "Enter the number of seats (1 to 50).";
  if (Object.keys(errors).length > 0) return fail(400, "Please correct the highlighted fields.", errors);
  const doc: TableDoc = {
    _id: `table-${restaurantId}-${number as number}`,
    restaurantId,
    number: number as number,
    seats: seats as number,
    reserved: false,
    createdAt: new Date().toISOString(),
  };
  try {
    await tables.insertOne(doc);
  } catch (err) {
    if (isDuplicateKeyError(err)) return fail(400, "Please correct the highlighted fields.", { number: `Table ${doc.number} already exists.` });
    throw err;
  }
  await syncStoredTableCount(restaurantId);
  return { ok: true, value: { id: doc._id, number: doc.number, seats: doc.seats, reserved: false, status: "available", openOrders: [] } };
}

export async function updateTable(restaurantId: string, tableId: string, input: Record<string, unknown>): Promise<PosResult<RestaurantTable>> {
  const $set: Partial<TableDoc> = {};
  if (input.seats !== undefined) {
    if (!isWhole(input.seats, 1, 50)) return fail(400, "Enter the number of seats (1 to 50).");
    $set.seats = input.seats;
  }
  if (input.reserved !== undefined) {
    if (typeof input.reserved !== "boolean") return fail(400, "Invalid reservation value.");
    $set.reserved = input.reserved;
  }
  if (Object.keys($set).length === 0) return fail(400, "Nothing to change.");
  const updated = await (await tablesCollection()).findOneAndUpdate({ _id: tableId, restaurantId }, { $set }, { returnDocument: "after" });
  if (!updated) return fail(404, "Table not found.");
  const table = (await listTables(restaurantId)).find((t) => t.id === tableId);
  return table ? { ok: true, value: table } : fail(404, "Table not found.");
}

export async function deleteTable(restaurantId: string, tableId: string): Promise<PosResult<{ id: string }>> {
  const open = await (await ordersCollection()).countDocuments({ restaurantId, tableId, ...OPEN_DINE_IN });
  if (open > 0) return fail(409, "This table has an open order. Settle or cancel it before removing the table.");
  const { deletedCount } = await (await tablesCollection()).deleteOne({ _id: tableId, restaurantId });
  if (deletedCount === 0) return fail(404, "Table not found.");
  await syncStoredTableCount(restaurantId);
  return { ok: true, value: { id: tableId } };
}

// ---- Table settings (Seats and Tables Number) --------------------------------------------------------

export const DEFAULT_SEATS = 4;
export const MAX_TABLE_COUNT = 200;

export type TableSettings = { tableCount: number; seats: number };
export type TableSettingsResult = TableSettings & { tables: RestaurantTable[]; created: number[]; removed: number[]; kept: number[] };

// The saved settings. A restaurant that never saved them reports the tables it has and the default seats.
export async function getTableSettings(restaurantId: string): Promise<TableSettings> {
  const doc = await (await tableSettingsCollection()).findOne({ _id: restaurantId });
  if (doc) return { tableCount: doc.tableCount, seats: doc.seats };
  return { tableCount: await (await tablesCollection()).countDocuments({ restaurantId }), seats: DEFAULT_SEATS };
}

// Keeps the saved Tables Number equal to the real table count after "Add table" or "Remove" in Settings.
async function syncStoredTableCount(restaurantId: string): Promise<void> {
  const count = await (await tablesCollection()).countDocuments({ restaurantId });
  await (await tableSettingsCollection()).updateOne(
    { _id: restaurantId },
    { $set: { tableCount: count, updatedAt: new Date().toISOString() } },
  );
}

// Saves Seats and Tables Number, then makes the table list match: Tables 1..N exist afterwards.
//  - Missing numbers are created with the configured seats. Each one is an upsert on the unique
//    (restaurant, number) pair, so repeated or concurrent saves never create a duplicate table.
//  - Existing tables keep their own seats (set per table in Settings) and their reservations.
//  - Tables numbered above N are removed only when they have no open order; otherwise they are kept and
//    reported. Orders are never deleted or changed; past orders keep their table number.
export async function saveTableSettings(restaurantId: string, input: Record<string, unknown>, by?: string): Promise<PosResult<TableSettingsResult>> {
  const errors: Record<string, string> = {};
  if (!isWhole(input.tableCount, 0, MAX_TABLE_COUNT)) errors.tableCount = `Enter the number of tables (0 to ${MAX_TABLE_COUNT}).`;
  if (!isWhole(input.seats, 1, 50)) errors.seats = "Enter the number of seats (1 to 50).";
  if (Object.keys(errors).length > 0) return fail(400, "Please correct the highlighted fields.", errors);
  const tableCount = input.tableCount as number;
  const seats = input.seats as number;

  const tables = await tablesCollection();
  const existing = await tables.find({ restaurantId }, { projection: { _id: 1, number: 1 } }).limit(1000).toArray();
  const have = new Set(existing.map((t) => t.number));

  const created: number[] = [];
  const now = new Date().toISOString();
  for (let number = 1; number <= tableCount; number++) {
    if (have.has(number)) continue;
    try {
      const res = await tables.updateOne(
        { restaurantId, number },
        { $setOnInsert: { _id: `table-${restaurantId}-${number}`, restaurantId, number, seats, reserved: false, createdAt: now } },
        { upsert: true },
      );
      if (res.upsertedCount === 1) created.push(number);
    } catch (err) {
      // Another save created it at the same moment: it exists, which is all that matters.
      if (!isDuplicateKeyError(err)) throw err;
    }
  }

  const removed: number[] = [];
  const kept: number[] = [];
  const extra = existing.filter((t) => t.number > tableCount).sort((a, b) => a.number - b.number);
  if (extra.length > 0) {
    const orders = await ordersCollection();
    for (const t of extra) {
      const open = await orders.countDocuments({ restaurantId, tableId: t._id, ...OPEN_DINE_IN });
      if (open > 0) {
        kept.push(t.number);
        continue;
      }
      const { deletedCount } = await tables.deleteOne({ _id: t._id, restaurantId });
      if (deletedCount === 1) removed.push(t.number);
    }
  }

  await (await tableSettingsCollection()).updateOne(
    { _id: restaurantId },
    { $set: { restaurantId, tableCount, seats, updatedAt: now, ...(by ? { updatedBy: by } : {}) } },
    { upsert: true },
  );
  return { ok: true, value: { tableCount, seats, tables: await listTables(restaurantId), created, removed, kept } };
}

// ---- Menu for the POS ------------------------------------------------------------------------------

function optionGroups(item: MenuItem): { id: string; label: string; options: ProductOption[] }[] {
  const groups: { id: string; label: string; options: ProductOption[] }[] = [];
  if (item.sizes?.length) groups.push({ id: "size", label: "Size", options: item.sizes });
  if (item.flavors?.length) groups.push({ id: "flavor", label: "Flavour", options: item.flavors });
  for (const group of extraOptionGroups(item)) groups.push({ id: group.id, label: group.label, options: group.options });
  return groups;
}

export interface PosMenuItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  image?: string;
  description?: string;
  available: boolean;
  groups: { id: string; label: string; options: ProductOption[] }[];
}

export async function readPosMenu(): Promise<PosMenuItem[]> {
  const docs = await (await productsCollection()).find({}).sort({ position: 1 }).limit(1000).toArray();
  return docs.map((item) => ({
    id: item._id,
    categoryId: item.categoryId,
    name: item.name,
    price: item.price,
    ...(item.image ? { image: item.image } : {}),
    ...(item.description ? { description: item.description } : {}),
    available: item.available !== false && item.stock !== "out",
    groups: optionGroups(item),
  }));
}

// ---- Creating a POS order --------------------------------------------------------------------------

function parseLines(raw: unknown): PosLineInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_LINES) return null;
  const lines: PosLineInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const l = entry as Record<string, unknown>;
    if (typeof l.itemId !== "string" || !l.itemId || l.itemId.length > 80) return null;
    if (!isWhole(l.qty, 1, MAX_QTY)) return null;
    const choices: Record<string, string> = {};
    if (l.choices !== undefined) {
      if (typeof l.choices !== "object" || l.choices === null || Array.isArray(l.choices)) return null;
      for (const [k, v] of Object.entries(l.choices as Record<string, unknown>)) {
        if (typeof v !== "string" || k.length > 40 || v.length > 80) return null;
        choices[k] = v;
      }
    }
    const instructions = typeof l.instructions === "string" ? l.instructions.trim().slice(0, 300) : "";
    lines.push({ itemId: l.itemId, qty: l.qty, choices, instructions });
  }
  return lines;
}

// Prices every line from the menu in the database. The browser's idea of the price is never used.
async function priceLines(input: PosLineInput[]): Promise<PosResult<CartLine[]>> {
  const ids = [...new Set(input.map((l) => l.itemId))];
  const docs = await (await productsCollection()).find({ _id: { $in: ids } }).toArray();
  const byId = new Map(docs.map((d) => [d._id, d]));
  const lines: CartLine[] = [];
  for (const [index, line] of input.entries()) {
    const item = byId.get(line.itemId);
    if (!item) return fail(400, "An item in the order is no longer on the menu.");
    if (item.available === false || item.stock === "out") return fail(409, `${item.name} is sold out right now.`);
    let unitPrice = item.price;
    const options: string[] = [];
    for (const group of optionGroups(item)) {
      const chosenId = line.choices?.[group.id];
      const option = chosenId ? group.options.find((o) => o.id === chosenId) : group.options[0];
      if (!option) return fail(400, `Choose a valid ${group.label.toLowerCase()} for ${item.name}.`);
      unitPrice += option.priceDelta;
      if (option.priceDelta !== 0 || group.id === "size" || group.id === "flavor") options.push(option.label);
    }
    lines.push({
      id: `line-${index + 1}`,
      itemId: item._id,
      name: item.name,
      unitPrice,
      qty: line.qty,
      total: unitPrice * line.qty,
      options,
      instructions: line.instructions ?? "",
    });
  }
  return { ok: true, value: lines };
}

export async function createPosOrder(ctx: OwnerContext, body: Record<string, unknown>): Promise<PosResult<PosOrder>> {
  await ensureOrderIndexes();
  const restaurantId = ctx.restaurant.id;
  const errors: Record<string, string> = {};

  const clientOrderId = typeof body.clientOrderId === "string" ? body.clientOrderId : "";
  if (!CLIENT_ORDER_ID.test(clientOrderId)) errors.clientOrderId = "The order request is missing its reference. Please try again.";
  const orderType = body.orderType;
  if (orderType !== "dine_in" && orderType !== "takeaway") errors.orderType = "Choose dine-in or takeaway.";
  const customer = (typeof body.customer === "object" && body.customer !== null ? body.customer : {}) as Record<string, unknown>;
  const name = typeof customer.name === "string" ? customer.name.trim().replace(/\s+/g, " ") : "";
  const phone = typeof customer.phone === "string" ? customer.phone.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (name.length > 60) errors.name = "Keep the customer name to 60 characters or fewer.";
  if (phone && !PHONE.test(phone)) errors.phone = "Enter a valid phone number.";
  if (notes.length > 300) errors.notes = "Keep the notes to 300 characters or fewer.";

  let table: TableDoc | null = null;
  if (orderType === "dine_in") {
    table = typeof body.tableId === "string" ? await (await tablesCollection()).findOne({ _id: body.tableId, restaurantId }) : null;
    if (!table) errors.tableId = "Choose a table for this dine-in order.";
  }
  if (Object.keys(errors).length > 0) return fail(400, "Please correct the highlighted fields.", errors);

  // A retried confirmation returns the order it already created.
  const orders = await ordersCollection();
  const existing = await orders.findOne({ clientOrderId });
  if (existing) {
    if (existing.restaurantId !== restaurantId) return fail(409, "This order request was already used. Please start a new order.");
    return { ok: true, value: (await shape([existing]))[0], created: false };
  }

  const parsed = parseLines(body.lines);
  if (!parsed) return fail(400, "The cart is empty or has an invalid item.");
  const priced = await priceLines(parsed);
  if (!priced.ok) return priced;
  const lines = priced.value;
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const now = new Date().toISOString();
  const numbers = await issueNumbers(restaurantId);

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `MEG-${randomInt(100000, 1000000)}`;
    const doc: OrderDoc = {
      _id: id,
      clientOrderId,
      createdAt: now,
      updatedAt: now,
      customer: {
        name: name || (table ? `Table ${table.number}` : "Walk-in customer"),
        phone,
        address: "",
        notes,
      },
      fulfilment: "pickup",
      payment: "cash",
      paymentStatus: "pending",
      status: "confirmed",
      statusOverride: 1,
      lines,
      subtotal,
      deliveryFee: 0,
      total: subtotal,
      restaurantId,
      restaurantName: ctx.restaurant.name,
      orderType: orderType as StoredOrderType,
      ...(table ? { tableId: table._id, tableNumber: table.number } : {}),
      ...numbers,
      createdBy: ctx.owner.id,
    };
    const payment: PaymentDoc = {
      _id: `PAY-${id}`,
      orderId: id,
      restaurantId,
      amount: subtotal,
      currency: "PKR",
      method: "cash",
      status: "pending",
      createdAt: now,
      updatedAt: now,
      history: [{ event: "created", amount: subtotal, method: "cash", at: now, by: ctx.owner.name }],
    };
    const events: EventDoc[] = [
      { _id: `EVT-${id}-placed`, orderId: id, event: "placed", at: now, actor: "admin" },
      { _id: `EVT-${id}-confirmed`, orderId: id, event: "confirmed", at: now, actor: "admin" },
    ];
    try {
      await orders.insertOne(doc);
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const raced = await orders.findOne({ clientOrderId });
      if (raced) {
        if (raced.restaurantId !== restaurantId) return fail(409, "This order request was already used. Please start a new order.");
        return { ok: true, value: (await shape([raced]))[0], created: false };
      }
      continue; // The random order id was taken: try another.
    }
    try {
      await (await paymentsCollection()).insertOne(payment);
      await (await historyCollection()).insertMany(events);
    } catch (err) {
      // Never leave an order without its payment record.
      await (await paymentsCollection()).deleteOne({ _id: payment._id });
      await (await historyCollection()).deleteMany({ orderId: id });
      await orders.deleteOne({ _id: id });
      throw err;
    }
    // A reserved table is taken by the guests who sat down.
    if (table?.reserved) await (await tablesCollection()).updateOne({ _id: table._id }, { $set: { reserved: false } });
    return { ok: true, value: (await shape([doc]))[0], created: true };
  }
  return fail(503, "Could not create the order. Please try again.");
}

// ---- Reading orders --------------------------------------------------------------------------------

export interface OrderFilter {
  type?: OrderType;
  open?: boolean;
  tableId?: string;
  limit?: number;
}

export async function listRestaurantOrders(restaurantId: string, filter: OrderFilter = {}): Promise<PosOrder[]> {
  await ensureOrderIndexes();
  const query: Record<string, unknown> = { restaurantId };
  if (filter.type === "online") query.orderType = { $nin: ["dine_in", "takeaway"] };
  else if (filter.type) query.orderType = filter.type;
  if (filter.tableId) query.tableId = filter.tableId;
  if (filter.open) {
    query.status = { $ne: "cancelled" };
    // Open: still in the kitchen or not paid yet.
    query.$or = [
      { paymentStatus: { $ne: "paid" } },
      { statusOverride: { $lt: LAST_STEP } },
      { statusOverride: { $exists: false } },
      { status: "pending" },
    ];
  }
  let docs = await (await ordersCollection()).find(query).sort({ createdAt: -1 }).limit(Math.min(filter.limit ?? 300, 1000)).toArray();
  docs = await Promise.all(docs.map((d) => (d.status === "confirmed" && stepOf(d) < LAST_STEP ? ensureInvoice(d) : d)));
  return shape(docs);
}

export async function getRestaurantOrder(restaurantId: string, orderId: string): Promise<PosOrder | null> {
  const doc = await findRestaurantOrderDoc(restaurantId, orderId);
  return doc ? (await shape([doc]))[0] : null;
}

// ---- Online orders: confirm and cancel -------------------------------------------------------------

export async function confirmOnlineOrder(restaurantId: string, orderId: string): Promise<PosResult<PosOrder>> {
  await ensureOrderIndexes();
  const doc = await findRestaurantOrderDoc(restaurantId, orderId);
  if (!doc) return fail(404, "Order not found.");
  if (doc.status === "pending") {
    const result = await confirmOrder(orderId);
    if (!result.ok) return fail(result.status, result.error);
  } else if (doc.status !== "confirmed") {
    return fail(409, "Only pending orders can be confirmed.");
  }
  const confirmed = await findRestaurantOrderDoc(restaurantId, orderId);
  if (!confirmed) return fail(404, "Order not found.");
  return { ok: true, value: (await shape([await ensureInvoice(confirmed)]))[0] };
}

export async function cancelRestaurantOrder(ctx: OwnerContext, orderId: string): Promise<PosResult<PosOrder>> {
  const doc = await findRestaurantOrderDoc(ctx.restaurant.id, orderId);
  if (!doc) return fail(404, "Order not found.");
  if (doc.paymentStatus === "paid") return fail(409, "This order is already paid and cannot be cancelled.");
  if (doc.status === "pending") {
    // An online order the restaurant has not accepted yet: cancelOrder allows that for customers only,
    // so it is cancelled here with the same conditional update.
    const now = new Date().toISOString();
    const update = await (await ordersCollection()).updateOne(
      { _id: orderId, restaurantId: ctx.restaurant.id, status: "pending" },
      { $set: { status: "cancelled", paymentStatus: "cancelled", updatedAt: now } },
    );
    if (update.matchedCount !== 1) return fail(409, "This order can no longer be cancelled.");
    await (await historyCollection()).insertOne({ _id: `EVT-${orderId}-cancelled-${now}`, orderId, event: "cancelled", at: now, actor: "admin" });
  } else {
    const result = await cancelOrder(orderId, { admin: true });
    if (!result.ok) return fail(result.status, result.error);
  }
  const now = new Date().toISOString();
  await (await paymentsCollection()).updateOne(
    { orderId, status: { $ne: "paid" } },
    { $set: { status: "cancelled", updatedAt: now }, $push: { history: { event: "cancelled", amount: doc.total, method: "cash", at: now, by: ctx.owner.name } } },
  );
  const order = await getRestaurantOrder(ctx.restaurant.id, orderId);
  return order ? { ok: true, value: order } : fail(404, "Order not found.");
}

// ---- Kitchen ---------------------------------------------------------------------------------------

// Orders the kitchen is working on: confirmed and not yet served or delivered, oldest first.
export async function listKitchenOrders(restaurantId: string): Promise<PosOrder[]> {
  await ensureOrderIndexes();
  const docs = await (await ordersCollection())
    .find({ restaurantId, status: "confirmed", $or: [{ statusOverride: { $lt: LAST_STEP } }, { statusOverride: { $exists: false } }] })
    .sort({ createdAt: 1 })
    .limit(300)
    .toArray();
  return shape(await Promise.all(docs.map(ensureInvoice)));
}

const KITCHEN_STEPS: Partial<Record<KitchenStatus, number>> = { preparing: 2, ready: 3, served: 4, delivered: 4 };

// Moves an order one step forward: Pending → Preparing → Ready → Served/Delivered. The update only
// matches the order at its current step, so two kitchen screens cannot skip or repeat a step.
export async function advanceKitchenStatus(restaurantId: string, orderId: string, target: unknown): Promise<PosResult<PosOrder>> {
  const doc = await findRestaurantOrderDoc(restaurantId, orderId);
  if (!doc) return fail(404, "Order not found.");
  if (doc.status !== "confirmed") return fail(409, doc.status === "cancelled" ? "This order was cancelled." : "Confirm the order before the kitchen starts it.");
  const step = typeof target === "string" ? KITCHEN_STEPS[target as KitchenStatus] : undefined;
  if (step === undefined) return fail(400, "Choose a valid kitchen status.");
  const current = stepOf(doc);
  if (step !== current + 1) return fail(409, `This order is ${kitchenStatusOf(doc)}; it can only move to the next step.`);
  const now = new Date().toISOString();
  const atCurrent = current === 1 ? { $or: [{ statusOverride: 1 }, { statusOverride: { $exists: false } }] } : { statusOverride: current };
  const update = await (await ordersCollection()).updateOne(
    { _id: orderId, restaurantId, status: "confirmed", ...atCurrent },
    { $set: { statusOverride: step, updatedAt: now } },
  );
  if (update.matchedCount !== 1) return fail(409, "This order was just updated on another screen. Refresh and try again.");
  await (await historyCollection()).insertOne({ _id: `EVT-${orderId}-progress-${step}-${now}`, orderId, event: "progress", step, at: now, actor: "admin" });
  const order = await getRestaurantOrder(restaurantId, orderId);
  return order ? { ok: true, value: order } : fail(404, "Order not found.");
}

// ---- Payments --------------------------------------------------------------------------------------

export async function recordPayment(ctx: OwnerContext, orderId: string, method: unknown): Promise<PosResult<PosOrder>> {
  if (method !== "cash" && method !== "card") return fail(400, "Choose cash or card.");
  const doc = await findRestaurantOrderDoc(ctx.restaurant.id, orderId);
  if (!doc) return fail(404, "Order not found.");
  if (doc.status === "cancelled") return fail(409, "This order was cancelled.");
  if (doc.status === "pending") return fail(409, "Confirm the order before taking payment.");
  const now = new Date().toISOString();
  const entry: PaymentHistoryEntry = { event: "paid", amount: doc.total, method, at: now, by: ctx.owner.name };
  const payments = await paymentsCollection();
  const paid = await payments.findOneAndUpdate(
    { orderId, status: "pending" },
    { $set: { status: "paid", method, paidAt: now, receivedBy: ctx.owner.id, updatedAt: now, amount: doc.total }, $push: { history: entry } },
    { returnDocument: "after" },
  );
  if (!paid) {
    const current = await payments.findOne({ orderId });
    if (current?.status === "paid") return fail(409, "This order is already paid.");
    if (current) return fail(409, "This payment can no longer be recorded.");
    // Orders saved before payment records existed get their record now.
    try {
      await payments.insertOne({
        _id: `PAY-${orderId}`,
        orderId,
        restaurantId: ctx.restaurant.id,
        amount: doc.total,
        currency: "PKR",
        method,
        status: "paid",
        createdAt: now,
        updatedAt: now,
        paidAt: now,
        receivedBy: ctx.owner.id,
        history: [entry],
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) return fail(409, "This order is already paid.");
      throw err;
    }
  }
  await (await ordersCollection()).updateOne({ _id: orderId }, { $set: { paymentStatus: "paid", updatedAt: now } });
  const order = await getRestaurantOrder(ctx.restaurant.id, orderId);
  return order ? { ok: true, value: order } : fail(404, "Order not found.");
}

// ---- Sales -----------------------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function salesSummary(restaurantId: string, fromInput: string | null, toInput: string | null): Promise<PosResult<SalesSummary>> {
  const today = dayKey();
  const from = fromInput && DATE.test(fromInput) ? fromInput : today;
  const to = toInput && DATE.test(toInput) ? toInput : today;
  if (from > to) return fail(400, "The start date must be on or before the end date.");
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 366) return fail(400, "Choose a range of one year or less.");

  // A wide UTC window, then each order is placed on its restaurant-time day.
  const start = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString();
  const end = new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86_400_000).toISOString();
  const docs = await (await ordersCollection())
    .find({ restaurantId, createdAt: { $gte: start, $lt: end } }, { projection: { lines: 0, customer: 0 } })
    .limit(20_000)
    .toArray();
  const inRange = docs.filter((d) => {
    const day = dayKey(new Date(d.createdAt));
    return day >= from && day <= to;
  });
  const payments = await (await paymentsCollection()).find({ orderId: { $in: inRange.map((d) => d._id) }, status: "paid" }).toArray();
  const methodByOrder = new Map(payments.map((p) => [p.orderId, p.method]));

  const summary: SalesSummary = {
    from,
    to,
    orders: 0,
    paidOrders: 0,
    unpaidOrders: 0,
    cancelledOrders: 0,
    grossSales: 0,
    paidSales: 0,
    unpaidSales: 0,
    byType: { dine_in: { orders: 0, sales: 0 }, takeaway: { orders: 0, sales: 0 }, online: { orders: 0, sales: 0 } },
    byMethod: {},
    expenses: 0,
    days: [],
  };
  const days = new Map<string, { orders: number; sales: number }>();
  for (const d of inRange) {
    if (d.status === "cancelled") {
      summary.cancelledOrders += 1;
      continue;
    }
    if (d.status === "pending") continue; // Not accepted yet: not a sale.
    summary.orders += 1;
    summary.grossSales += d.total;
    const type = orderTypeOf(d);
    summary.byType[type].orders += 1;
    summary.byType[type].sales += d.total;
    if (d.paymentStatus === "paid") {
      summary.paidOrders += 1;
      summary.paidSales += d.total;
      const method = methodByOrder.get(d._id) ?? "cash";
      summary.byMethod[method] = (summary.byMethod[method] ?? 0) + d.total;
    } else {
      summary.unpaidOrders += 1;
      summary.unpaidSales += d.total;
    }
    const day = dayKey(new Date(d.createdAt));
    const entry = days.get(day) ?? { orders: 0, sales: 0 };
    entry.orders += 1;
    entry.sales += d.total;
    days.set(day, entry);
  }
  summary.days = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v }));
  summary.expenses = (await listPurchases(restaurantId)).filter((p) => p.date >= from && p.date <= to).reduce((sum, p) => sum + p.amount, 0);
  return { ok: true, value: summary };
}
