import "server-only";
import { getCollection } from "@/lib/server/collections";
import { readCatalog } from "@/lib/server/catalog";
import { randomHex } from "@/lib/server/random";
import { STOCK_UNITS, type Recipe, type StockItem, type StockMovement, type StockMovementType, type StockSnapshot, type StockUnit } from "@/lib/stockTypes";

// Inventory for the cafe kitchen: ingredients (fish, oil, potatoes, ketchup…), their purchases, manual
// usage and waste, and the recipe of each menu product. When an order is completed, the ingredients in
// its products' recipes are deducted automatically and costed at the item's average purchase cost.
//
// Quantities are stored in the item's own unit (kg, L, pcs…). Average cost is a weighted average over
// purchases, so stock value and the cost of what was used are always real numbers from the database.

type ItemDoc = Omit<StockItem, "id"> & { _id: string };
type MovementDoc = Omit<StockMovement, "id"> & { _id: string };
type RecipeDoc = { _id: string; lines: Recipe["lines"]; updatedAt: string };

const itemsCol = () => getCollection<ItemDoc>("stock_items", [{ key: { nameLower: 1 }, name: "name_unique", unique: true }]);
const movementsCol = () =>
  getCollection<MovementDoc>("stock_movements", [
    { key: { at: -1 }, name: "at" },
    { key: { orderId: 1 }, name: "orderId", sparse: true },
  ]);
const recipesCol = () => getCollection<RecipeDoc>("recipes");

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({ ok: false, status, error });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${randomHex(4)}`;
const round = (n: number, places = 3) => Math.round(n * 10 ** places) / 10 ** places;
const money = (n: number) => Math.round(n * 100) / 100;

function toItem({ _id, ...rest }: ItemDoc): StockItem {
  const { nameLower: _drop, ...item } = rest as ItemDoc & { nameLower?: string };
  void _drop;
  return { id: _id, ...item };
}
const toMovement = ({ _id, ...rest }: MovementDoc): StockMovement => ({ id: _id, ...rest });

const positive = (v: unknown, max = 1_000_000) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};
const nonNegative = (v: unknown, max = 100_000_000) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};
const cleanText = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

export async function readStock(): Promise<StockSnapshot> {
  const [items, movements, recipes] = await Promise.all([
    (await itemsCol()).find({}).sort({ name: 1 }).toArray(),
    (await movementsCol()).find({}).sort({ at: -1 }).limit(150).toArray(),
    (await recipesCol()).find({}).toArray(),
  ]);
  return {
    items: items.map(toItem),
    movements: movements.map(toMovement),
    recipes: recipes.map((r) => ({ productId: r._id, lines: r.lines })),
  };
}

// A new ingredient. An opening quantity with its cost is saved as the first purchase.
export async function addItem(body: Record<string, unknown>): Promise<Result<StockItem>> {
  const name = cleanText(body.name, 60);
  if (!name) return fail(400, "Enter the item name.");
  const unit = body.unit as StockUnit;
  if (!STOCK_UNITS.includes(unit)) return fail(400, "Choose a unit.");
  const lowLevel = nonNegative(body.lowLevel ?? 0, 1_000_000);
  if (lowLevel === null) return fail(400, "Low-stock level must be 0 or more.");
  const openingQty = nonNegative(body.quantity ?? 0, 1_000_000);
  const openingCost = nonNegative(body.totalCost ?? 0);
  if (openingQty === null || openingCost === null) return fail(400, "Opening quantity and cost must be 0 or more.");

  const doc: ItemDoc & { nameLower: string } = {
    _id: newId("stock"),
    name,
    nameLower: name.toLowerCase(),
    unit,
    quantity: 0,
    avgCost: 0,
    lowLevel,
    createdAt: new Date().toISOString(),
  };
  try {
    await (await itemsCol()).insertOne(doc);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return fail(409, "An item with this name already exists.");
    throw err;
  }
  if (openingQty > 0) {
    const res = await recordPurchase(doc._id, { quantity: openingQty, totalCost: openingCost, note: "Opening stock" });
    if (!res.ok) return res;
  }
  const saved = await (await itemsCol()).findOne({ _id: doc._id });
  return ok(toItem(saved!));
}

export async function updateItem(id: string, body: Record<string, unknown>): Promise<Result<StockItem>> {
  const $set: Partial<ItemDoc> & { nameLower?: string } = {};
  if (body.name !== undefined) {
    const name = cleanText(body.name, 60);
    if (!name) return fail(400, "Enter the item name.");
    $set.name = name;
    $set.nameLower = name.toLowerCase();
  }
  if (body.lowLevel !== undefined) {
    const low = nonNegative(body.lowLevel, 1_000_000);
    if (low === null) return fail(400, "Low-stock level must be 0 or more.");
    $set.lowLevel = low;
  }
  if (Object.keys($set).length === 0) return fail(400, "Nothing to change.");
  try {
    const doc = await (await itemsCol()).findOneAndUpdate({ _id: id }, { $set }, { returnDocument: "after" });
    if (!doc) return fail(404, "Item not found.");
    return ok(toItem(doc));
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return fail(409, "An item with this name already exists.");
    throw err;
  }
}

// Removes an ingredient and takes it out of every recipe. Its past movements stay in the history.
export async function removeItem(id: string): Promise<Result<true>> {
  const { deletedCount } = await (await itemsCol()).deleteOne({ _id: id });
  if (!deletedCount) return fail(404, "Item not found.");
  await (await recipesCol()).updateMany({}, { $pull: { lines: { itemId: id } } });
  return ok(true);
}

// A purchase adds stock and updates the weighted average cost per unit.
export async function recordPurchase(id: string, body: Record<string, unknown>): Promise<Result<StockItem>> {
  const qty = positive(body.quantity);
  const totalCost = nonNegative(body.totalCost);
  if (qty === null) return fail(400, "Enter the quantity bought.");
  if (totalCost === null) return fail(400, "Enter the total cost (0 or more).");
  const col = await itemsCol();
  const item = await col.findOne({ _id: id });
  if (!item) return fail(404, "Item not found.");

  // Stock below zero (used before it was recorded) is not valued, so it does not skew the average.
  const onHand = Math.max(0, item.quantity);
  const avgCost = onHand + qty > 0 ? (onHand * item.avgCost + totalCost) / (onHand + qty) : item.avgCost;
  const updated = await col.findOneAndUpdate(
    { _id: id, quantity: item.quantity, avgCost: item.avgCost },
    { $set: { quantity: round(item.quantity + qty), avgCost: money(avgCost) } },
    { returnDocument: "after" },
  );
  if (!updated) return fail(409, "This item changed at the same time. Please try again.");
  await (await movementsCol()).insertOne({
    _id: newId("mov"),
    itemId: id,
    itemName: item.name,
    unit: item.unit,
    type: "purchase",
    qty: round(qty),
    unitCost: money(qty > 0 ? totalCost / qty : 0),
    totalCost: money(totalCost),
    note: cleanText(body.note, 120) || cleanText(body.supplier, 120),
    orderId: null,
    at: new Date().toISOString(),
  });
  return ok(toItem(updated));
}

// Manual stock out: kitchen use not covered by a recipe, waste, or a count correction.
export async function recordUsage(id: string, body: Record<string, unknown>): Promise<Result<StockItem>> {
  const type = body.type as StockMovementType;
  if (type !== "usage" && type !== "waste" && type !== "adjustment") return fail(400, "Choose usage, waste or a count correction.");
  const col = await itemsCol();
  const item = await col.findOne({ _id: id });
  if (!item) return fail(404, "Item not found.");

  let change: number;
  if (type === "adjustment") {
    // A physical count: the new quantity on hand.
    const counted = nonNegative(body.quantity, 1_000_000);
    if (counted === null) return fail(400, "Enter the counted quantity (0 or more).");
    change = round(counted - item.quantity);
    if (change === 0) return fail(400, "The count matches the current quantity.");
  } else {
    const qty = positive(body.quantity);
    if (qty === null) return fail(400, "Enter the quantity used.");
    change = -round(qty);
  }
  const updated = await col.findOneAndUpdate({ _id: id }, { $inc: { quantity: change } }, { returnDocument: "after" });
  if (!updated) return fail(404, "Item not found.");
  await col.updateOne({ _id: id }, { $set: { quantity: round(updated.quantity) } });
  await (await movementsCol()).insertOne({
    _id: newId("mov"),
    itemId: id,
    itemName: item.name,
    unit: item.unit,
    type,
    qty: change,
    unitCost: item.avgCost,
    totalCost: money(Math.abs(change) * item.avgCost),
    note: cleanText(body.note, 120),
    orderId: null,
    at: new Date().toISOString(),
  });
  return ok(toItem({ ...updated, quantity: round(updated.quantity) }));
}

// Saves what one unit of a product uses. An empty list removes the recipe.
export async function saveRecipe(productId: string, rawLines: unknown): Promise<Result<Recipe>> {
  if (!Array.isArray(rawLines) || rawLines.length > 40) return fail(400, "Invalid recipe.");
  const { products } = await readCatalog();
  if (!products.some((p) => p.id === productId)) return fail(404, "Product not found.");
  const itemIds = new Set((await (await itemsCol()).find({}, { projection: { _id: 1 } }).toArray()).map((d) => d._id));
  const lines: Recipe["lines"] = [];
  const seen = new Set<string>();
  for (const raw of rawLines) {
    const itemId = typeof raw?.itemId === "string" ? raw.itemId : "";
    const qty = positive(raw?.qty, 10_000);
    if (!itemIds.has(itemId)) return fail(400, "One of the ingredients no longer exists.");
    if (qty === null) return fail(400, "Each ingredient needs a quantity above 0.");
    if (seen.has(itemId)) return fail(400, "Each ingredient can be listed once.");
    seen.add(itemId);
    lines.push({ itemId, qty: round(qty, 4) });
  }
  const col = await recipesCol();
  if (lines.length === 0) await col.deleteOne({ _id: productId });
  else await col.updateOne({ _id: productId }, { $set: { lines, updatedAt: new Date().toISOString() } }, { upsert: true });
  return ok({ productId, lines });
}

// Deducts the recipe ingredients of a completed order. `orderId` makes it run once per order: if any
// movement already names this order, nothing is deducted again. Products without a recipe use nothing.
// Stock may go below zero (the sale already happened); the Stock page shows it in red.
export async function deductForOrder(orderId: string, lines: { productId: string; qty: number }[]): Promise<void> {
  const movements = await movementsCol();
  if (await movements.findOne({ orderId }, { projection: { _id: 1 } })) return;
  const recipes = await (await recipesCol()).find({ _id: { $in: [...new Set(lines.map((l) => l.productId))] } }).toArray();
  const byProduct = new Map(recipes.map((r) => [r._id, r.lines]));
  const need = new Map<string, number>();
  for (const line of lines) {
    for (const r of byProduct.get(line.productId) ?? []) need.set(r.itemId, (need.get(r.itemId) ?? 0) + r.qty * line.qty);
  }
  if (need.size === 0) return;
  const items = await itemsCol();
  const docs = await items.find({ _id: { $in: [...need.keys()] } }).toArray();
  const at = new Date().toISOString();
  const out: MovementDoc[] = [];
  for (const doc of docs) {
    const qty = round(need.get(doc._id) ?? 0);
    if (qty <= 0) continue;
    await items.updateOne({ _id: doc._id }, { $inc: { quantity: -qty } });
    out.push({
      _id: newId("mov"),
      itemId: doc._id,
      itemName: doc.name,
      unit: doc.unit,
      type: "order",
      qty: -qty,
      unitCost: doc.avgCost,
      totalCost: money(qty * doc.avgCost),
      note: "",
      orderId,
      at,
    });
  }
  if (out.length > 0) await movements.insertMany(out);
}

// Movements since `from` (for the dashboard's consumption and profit).
export async function movementsSince(from: string): Promise<StockMovement[]> {
  return (await (await movementsCol()).find({ at: { $gte: from } }).toArray()).map(toMovement);
}

export async function listItems(): Promise<StockItem[]> {
  return (await (await itemsCol()).find({}).sort({ name: 1 }).toArray()).map(toItem);
}
