import { randomInt } from "@/lib/local/random";
import { DELIVERY_FEE } from "@/lib/constants";
import { ORDER_STEPS } from "@/lib/orderStatus";
import { validateCheckout } from "@/lib/validation";
import { extraOptionGroups } from "@/data/menuOptions";
import { getCollection, isDuplicateKeyError } from "@/lib/local/collections";
import { sanitizeCartLine, MAX_CART_LINES } from "@/lib/local/carts";
import { listRestaurantsForCustomers } from "@/lib/local/restaurants";
import { findRider } from "@/lib/local/restaurantRecords";
import type { CartLine, CheckoutValues, MenuItem, Order, OrderEvent, OrderStatus, PaymentStatus, ProductOption } from "@/types";

// Orders, their payment records and their status history live in this browser's storage:
//   orders               one document per order, including its items (lines) and current status
//   payments             one payment record per order (cash on delivery for now)
//   order_status_history one document per status change, shown on both the client and admin views
//
// Every change to an order is written in one transaction, and status changes are conditional
// updates, so two admins cannot both confirm or cancel the same order.

type OrderDoc = Omit<Order, "id" | "history"> & {
  _id: string;
  clientOrderId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  updatedAt: string;
};
type PaymentDoc = { _id: string; orderId: string; amount: number; currency: "PKR"; method: "cod"; status: PaymentStatus; createdAt: string; updatedAt: string };
type EventDoc = OrderEvent & { _id: string; orderId: string };

const ordersCollection = () =>
  getCollection<OrderDoc>("orders", [
    { key: { clientOrderId: 1 }, name: "orders_client_order_id_unique", unique: true },
    { key: { userId: 1, createdAt: -1 }, name: "orders_user_created" },
    { key: { createdAt: -1 }, name: "orders_created" },
  ]);
const paymentsCollection = () =>
  getCollection<PaymentDoc>("payments", [{ key: { orderId: 1 }, name: "payments_order_unique", unique: true }]);
const historyCollection = () =>
  getCollection<EventDoc>("order_status_history", [{ key: { orderId: 1, at: 1 }, name: "history_order_time" }]);

const productsCollection = () => getCollection<MenuItem & { _id: string }>("products");

const LAST_STEP = ORDER_STEPS.length - 1;
const CLIENT_ORDER_ID = /^[A-Za-z0-9_-]{16,64}$/;

export type OrderActor = { admin: true } | { userId: string };

export type OrderResult =
  | { ok: true; order: Order; created: boolean }
  | { ok: false; status: number; error: string; errors?: FieldErrors };
type FieldErrors = Record<string, string>;

// Lowest and highest price a product can have once one size, flavour and extra option is chosen.
// Every option group holds exactly one choice, so each group contributes between its min and max delta.
function priceRange(item: MenuItem): { min: number; max: number } {
  const groups: ProductOption[][] = [];
  if (item.sizes?.length) groups.push(item.sizes);
  if (item.flavors?.length) groups.push(item.flavors);
  for (const group of extraOptionGroups(item)) groups.push(group.options);
  let min = item.price;
  let max = item.price;
  for (const options of groups) {
    const deltas = options.map((o) => o.priceDelta);
    min += Math.min(...deltas);
    max += Math.max(...deltas);
  }
  return { min, max };
}

function withHistory(doc: OrderDoc, events: EventDoc[]): Order {
  const { _id, ...rest } = doc;
  const history = events
    .filter((e) => e.orderId === _id)
    .map(({ event, step, at, actor }) => ({ event, step, at, actor }));
  return { id: _id, ...rest, history };
}

async function attachHistory(docs: OrderDoc[]): Promise<Order[]> {
  if (docs.length === 0) return [];
  const events = await (await historyCollection())
    .find({ orderId: { $in: docs.map((d) => d._id) } })
    .sort({ at: 1 })
    .toArray();
  return docs.map((doc) => withHistory(doc, events));
}

const canView = (doc: OrderDoc, actor: OrderActor) => "admin" in actor || doc.userId === actor.userId;

export async function getOrderForActor(id: string, actor: OrderActor): Promise<Order | null> {
  const doc = await (await ordersCollection()).findOne({ _id: id });
  if (!doc || !canView(doc, actor)) return null;
  return (await attachHistory([doc]))[0];
}

export async function listOrdersForUser(userId: string): Promise<Order[]> {
  const docs = await (await ordersCollection()).find({ userId }).sort({ createdAt: -1 }).limit(500).toArray();
  return attachHistory(docs);
}

export async function listAllOrders(): Promise<Order[]> {
  const docs = await (await ordersCollection()).find({}).sort({ createdAt: -1 }).limit(1000).toArray();
  return attachHistory(docs);
}

// Orders placed for one restaurant, newest first.
export async function listOrdersForRestaurant(restaurantId: string): Promise<Order[]> {
  const docs = await (await ordersCollection()).find({ restaurantId }).sort({ createdAt: -1 }).limit(1000).toArray();
  return attachHistory(docs);
}

// Sets or clears the rider on a delivery. The rider must work for the order's restaurant.
export async function assignRider(orderId: string, riderId: string | null): Promise<OrderResult> {
  const orders = await ordersCollection();
  const order = await orders.findOne({ _id: orderId });
  if (!order) return { ok: false, status: 404, error: "Order not found." };
  if (riderId) {
    const rider = await findRider(riderId);
    if (!rider || !order.restaurantId || rider.restaurantId !== order.restaurantId) {
      return { ok: false, status: 400, error: "Choose a rider from this order's restaurant." };
    }
  }
  await orders.updateOne({ _id: orderId }, { $set: { riderId: riderId, updatedAt: new Date().toISOString() } });
  return loaded(orderId);
}

// Writes the order, its payment record and its history entry. If a later write fails, the earlier
// ones are removed again, so an order is never left without its payment record.
async function insertOrderSet(order: OrderDoc, payment: PaymentDoc, placed: EventDoc) {
  await (await ordersCollection()).insertOne(order);
  try {
    await (await paymentsCollection()).insertOne(payment);
    await (await historyCollection()).insertOne(placed);
  } catch (err) {
    await (await paymentsCollection()).deleteOne({ _id: payment._id });
    await (await ordersCollection()).deleteOne({ _id: order._id });
    throw err;
  }
}

export async function createOrder(input: unknown, userId: string | null): Promise<OrderResult> {
  if (typeof input !== "object" || input === null) return { ok: false, status: 400, error: "Invalid order." };
  const body = input as Record<string, unknown>;
  const customer = (body.customer ?? {}) as Record<string, unknown>;
  const values: CheckoutValues = {
    name: String(customer.name ?? ""),
    phone: String(customer.phone ?? ""),
    address: String(customer.address ?? ""),
    notes: String(customer.notes ?? ""),
    fulfilment: body.fulfilment === "pickup" ? "pickup" : "delivery",
  };
  const errors: FieldErrors = { ...validateCheckout(values) };

  const clientOrderId = typeof body.clientOrderId === "string" ? body.clientOrderId : "";
  if (!CLIENT_ORDER_ID.test(clientOrderId)) errors.clientOrderId = "The order request is missing its reference. Please try again.";

  // Once any restaurant exists, the customer must choose which one the order is for.
  let restaurant: { id: string; name: string } | null = null;
  const restaurants = await listRestaurantsForCustomers();
  if (restaurants.length > 0) {
    const choice = typeof body.restaurantId === "string" ? body.restaurantId : "";
    restaurant = restaurants.find((r) => r.id === choice) ?? null;
    if (!restaurant) errors.restaurantId = "Choose the restaurant you are ordering from.";
  }
  if (Object.keys(errors).length > 0) return { ok: false, status: 400, error: "Please correct the highlighted fields.", errors };

  // A retried request returns the order it already created, instead of creating a second one.
  const orders = await ordersCollection();
  const existing = await orders.findOne({ clientOrderId });
  if (existing) return sameOwnerOrConflict(existing, userId);

  if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.length > MAX_CART_LINES) {
    return { ok: false, status: 400, error: "Your cart is empty or has too many items." };
  }
  const parsed = body.lines.map(sanitizeCartLine);
  if (parsed.some((line) => line === null)) return { ok: false, status: 400, error: "One or more cart items are invalid." };

  const catalog = await (await productsCollection()).find({ _id: { $in: [...new Set(parsed.map((l) => (l as CartLine).itemId))] } }).toArray();
  const byId = new Map(catalog.map((item) => [item._id, item]));

  const lines: CartLine[] = [];
  for (const line of parsed as CartLine[]) {
    const item = byId.get(line.itemId);
    if (!item) return { ok: false, status: 400, error: "An item in your cart is no longer on the menu." };
    if (item.available === false || item.stock === "out") {
      return { ok: false, status: 409, error: `${item.name} is sold out right now.` };
    }
    const { min, max } = priceRange(item);
    if (line.unitPrice < min || line.unitPrice > max) {
      return { ok: false, status: 400, error: `The price for ${item.name} has changed. Please review your cart.` };
    }
    // Use the catalog name, not the one the browser sent.
    lines.push({ ...line, name: item.name, total: line.unitPrice * line.qty });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const deliveryFee = values.fulfilment === "delivery" ? DELIVERY_FEE : 0;
  const total = subtotal + deliveryFee;
  const now = new Date().toISOString();
  const shared = {
    createdAt: now,
    updatedAt: now,
    clientOrderId,
    customer: {
      name: values.name.trim(),
      phone: values.phone.trim(),
      address: values.fulfilment === "delivery" ? values.address.trim() : "",
      notes: values.notes.trim(),
    },
    fulfilment: values.fulfilment,
    payment: "cod" as const,
    paymentStatus: "pending" as const,
    status: "pending" as const,
    lines,
    subtotal,
    deliveryFee,
    total,
    ...(userId ? { userId } : {}),
    ...(restaurant ? { restaurantId: restaurant.id, restaurantName: restaurant.name } : {}),
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = `MEG-${randomInt(100000, 1000000)}`;
    const doc: OrderDoc = { _id: id, ...shared };
    const payment: PaymentDoc = {
      _id: `PAY-${id}`,
      orderId: id,
      amount: total,
      currency: "PKR",
      method: "cod",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    const placed: EventDoc = { _id: `EVT-${id}-placed`, orderId: id, event: "placed", at: now, actor: "customer" };
    try {
      await insertOrderSet(doc, payment, placed);
      return { ok: true, order: withHistory(doc, [placed]), created: true };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      // Two identical requests raced: the second one returns the first order.
      const raced = await orders.findOne({ clientOrderId });
      if (raced) return sameOwnerOrConflict(raced, userId);
      // Otherwise the random order number was already taken, so try another.
    }
  }
  return { ok: false, status: 503, error: "Could not create your order. Please try again." };
}

async function sameOwnerOrConflict(existing: OrderDoc, userId: string | null): Promise<OrderResult> {
  if ((existing.userId ?? null) !== userId) {
    return { ok: false, status: 409, error: "This order request was already used. Please start a new checkout." };
  }
  return { ok: true, order: (await attachHistory([existing]))[0], created: false };
}

// Moves a pending order to confirmed. Admins only.
export async function confirmOrder(id: string): Promise<OrderResult> {
  const now = new Date().toISOString();
  const result = await (await ordersCollection()).updateOne(
    { _id: id, status: "pending" },
    { $set: { status: "confirmed", statusOverride: 1, updatedAt: now } },
  );
  if (result.matchedCount === 0) return notChangeable(id, "Only pending orders can be confirmed.");
  await (await historyCollection()).insertOne({ _id: `EVT-${id}-confirmed`, orderId: id, event: "confirmed", at: now, actor: "admin" });
  return loaded(id);
}

// Cancels an order. Customers can cancel only while it is pending. Admins can cancel until it is delivered.
export async function cancelOrder(id: string, actor: OrderActor): Promise<OrderResult> {
  const doc = await (await ordersCollection()).findOne({ _id: id });
  if (!doc || !canView(doc, actor)) return { ok: false, status: 404, error: "Order not found." };
  if (doc.status === "cancelled") return { ok: false, status: 409, error: "This order is already cancelled." };

  const adminMayCancel = "admin" in actor && doc.status === "confirmed" && (doc.statusOverride ?? 0) < LAST_STEP;
  const customerMayCancel = !("admin" in actor) && doc.status === "pending";
  if (!adminMayCancel && !customerMayCancel) {
    return { ok: false, status: 409, error: "This order can no longer be cancelled." };
  }

  const now = new Date().toISOString();
  // The order is changed first, with a condition, so a second cancel cannot succeed too.
  const update = await (await ordersCollection()).updateOne(
    { _id: id, status: { $in: ["pending", "confirmed"] } },
    { $set: { status: "cancelled", paymentStatus: "cancelled", updatedAt: now } },
  );
  if (update.matchedCount !== 1) return notChangeable(id, "This order can no longer be cancelled.");
  // Only unpaid payment records are cancelled. A "paid" record is never changed here.
  await (await paymentsCollection()).updateOne({ orderId: id, status: { $ne: "paid" } }, { $set: { status: "cancelled", updatedAt: now } });
  await (await historyCollection()).insertOne({
    _id: `EVT-${id}-cancelled-${now}`,
    orderId: id,
    event: "cancelled",
    at: now,
    actor: "admin" in actor ? "admin" : "customer",
  });
  return loaded(id);
}

// Sets the fulfilment step (Preparing, Out for Delivery, ...). Admins only, and only for confirmed orders.
export async function setOrderProgress(id: string, step: unknown): Promise<OrderResult> {
  if (typeof step !== "number" || !Number.isInteger(step) || step < 0 || step > LAST_STEP) {
    return { ok: false, status: 400, error: "Invalid status.", errors: { statusOverride: "Choose a valid status." } };
  }
  const now = new Date().toISOString();
  const result = await (await ordersCollection()).updateOne(
    { _id: id, status: "confirmed" },
    { $set: { statusOverride: step, updatedAt: now } },
  );
  if (result.matchedCount === 0) {
    const exists = await (await ordersCollection()).findOne({ _id: id }, { projection: { _id: 1 } });
    return exists ? notChangeable(id, "Confirm the order before changing its progress.") : { ok: false, status: 404, error: "Order not found." };
  }
  await (await historyCollection()).insertOne({ _id: `EVT-${id}-progress-${now}`, orderId: id, event: "progress", step, at: now, actor: "admin" });
  return loaded(id);
}

async function notChangeable(id: string, error: string): Promise<OrderResult> {
  const exists = await (await ordersCollection()).findOne({ _id: id }, { projection: { _id: 1 } });
  return exists ? { ok: false, status: 409, error } : { ok: false, status: 404, error: "Order not found." };
}

async function loaded(id: string): Promise<OrderResult> {
  const doc = await (await ordersCollection()).findOne({ _id: id });
  if (!doc) return { ok: false, status: 404, error: "Order not found." };
  return { ok: true, order: (await attachHistory([doc]))[0], created: false };
}
