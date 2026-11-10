import { parseCategories } from "@/lib/categories";
import { parseProducts } from "@/lib/products";
import { getCollection, isDuplicateKeyError } from "@/lib/server/collections";
import type { MenuItem, ProductOption, StoredCategory } from "@/types";

// The menu lives in the "products" and "categories" collections. The first read seeds them from
// the built-in menu (data/menu.ts) when they are empty; after that, only admin saves change them.

type Position = { position: number };
type ProductDoc = MenuItem & Position & { _id: string };
type CategoryDoc = StoredCategory & Position & { _id: string };

const productsCollection = () => getCollection<ProductDoc>("products", [{ key: { position: 1 }, name: "position" }]);
const categoriesCollection = () => getCollection<CategoryDoc>("categories", [{ key: { position: 1 }, name: "position" }]);

const isText = (value: unknown, max = 500): value is string => typeof value === "string" && value.length <= max;

function sanitizeOptions(value: unknown): ProductOption[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((o): o is ProductOption => typeof o === "object" && o !== null && isText(o.id, 80) && isText(o.label, 120) && typeof o.priceDelta === "number")
    .map((o) => ({ id: o.id, label: o.label, priceDelta: o.priceDelta }));
}

// Keeps only known fields of a product, so unexpected input cannot be stored.
export function sanitizeProduct(raw: unknown): MenuItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (!isText(p.id, 80) || !p.id || !isText(p.categoryId, 80) || !isText(p.name, 120) || typeof p.price !== "number" || p.price < 0) {
    return null;
  }
  const item: MenuItem = { id: p.id, categoryId: p.categoryId, name: p.name, price: Math.round(p.price) };
  if (isText(p.pieces, 80)) item.pieces = p.pieces;
  if (isText(p.description, 1000)) item.description = p.description;
  if (isText(p.badge, 40)) item.badge = p.badge;
  if (isText(p.image, 2000)) item.image = p.image;
  const sizes = sanitizeOptions(p.sizes);
  if (sizes) item.sizes = sizes;
  const flavors = sanitizeOptions(p.flavors);
  if (flavors) item.flavors = flavors;
  if (typeof p.available === "boolean") item.available = p.available;
  if (p.stock === "in" || p.stock === "out") item.stock = p.stock;
  return item;
}

export function sanitizeCategory(raw: unknown): StoredCategory | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Record<string, unknown>;
  if (!isText(c.id, 80) || !c.id || !isText(c.label, 80) || !isText(c.iconName, 60)) return null;
  const category: StoredCategory = { id: c.id, label: c.label, iconName: c.iconName };
  if (isText(c.tagline, 200) && c.tagline) category.tagline = c.tagline;
  return category;
}

async function seedIfEmpty() {
  const products = await productsCollection();
  if ((await products.estimatedDocumentCount()) === 0) {
    const seed = parseProducts(null).map((item, position) => ({ ...item, _id: item.id, position }));
    // Unordered and ignoring duplicate keys, so two requests seeding at once cannot fail each other.
    await products.insertMany(seed, { ordered: false }).catch((err: unknown) => {
      if (!isDuplicateKeyError(err)) throw err;
    });
  }
  const categories = await categoriesCollection();
  if ((await categories.estimatedDocumentCount()) === 0) {
    const seed = parseCategories(null).map((category, position) => ({ ...category, _id: category.id, position }));
    await categories.insertMany(seed, { ordered: false }).catch((err: unknown) => {
      if (!isDuplicateKeyError(err)) throw err;
    });
  }
}

export async function readCatalog(): Promise<{ products: MenuItem[]; categories: StoredCategory[] }> {
  await seedIfEmpty();
  // The projection drops the storage-only fields (_id and position) before the data leaves the server.
  const hide = { _id: 0, position: 0 } as const;
  const [products, categories] = await Promise.all([
    (await productsCollection()).find({}, { projection: hide }).sort({ position: 1 }).toArray(),
    (await categoriesCollection()).find({}, { projection: hide }).sort({ position: 1 }).toArray(),
  ]);
  return { products: products as MenuItem[], categories: categories as StoredCategory[] };
}

// Replaces the product list with the one an admin saved. Items left out are removed.
export async function replaceProducts(items: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = items.map(sanitizeProduct);
  if (clean.some((item) => item === null)) return { ok: false, error: "One or more products are invalid." };
  const products = clean as MenuItem[];
  if (new Set(products.map((p) => p.id)).size !== products.length) return { ok: false, error: "Product ids must be unique." };

  const collection = await productsCollection();
  if (products.length > 0) {
    await collection.bulkWrite(
      products.map((item, position) => ({
        replaceOne: { filter: { _id: item.id }, replacement: { ...item, _id: item.id, position }, upsert: true },
      })),
    );
  }
  await collection.deleteMany({ _id: { $nin: products.map((p) => p.id) } });
  return { ok: true };
}

export async function replaceCategories(items: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = items.map(sanitizeCategory);
  if (clean.some((item) => item === null)) return { ok: false, error: "One or more categories are invalid." };
  const categories = clean as StoredCategory[];
  if (new Set(categories.map((c) => c.id)).size !== categories.length) return { ok: false, error: "Category ids must be unique." };

  const collection = await categoriesCollection();
  if (categories.length > 0) {
    await collection.bulkWrite(
      categories.map((category, position) => ({
        replaceOne: { filter: { _id: category.id }, replacement: { ...category, _id: category.id, position }, upsert: true },
      })),
    );
  }
  await collection.deleteMany({ _id: { $nin: categories.map((c) => c.id) } });
  return { ok: true };
}
