// Browser storage for the app's records. Each collection is one JSON array in this browser's
// localStorage (key "meg-local:<collection>"), so data stays on this device only. The methods accept
// the subset of MongoDB query syntax the app uses (equality, $in, $nin, $ne, $gt, $gte, $lt, $lte,
// $exists, $or and the $set, $addToSet, $pull updates), so the data code reads the same as it did
// when it talked to a database.
//
// Browser JavaScript runs one task at a time, so each read-then-write step below is atomic within
// this tab. Two open tabs writing at the same moment can still overwrite each other's change.

export type Document = Record<string, unknown>;
type AnyDoc = Record<string, unknown>;
export type Filter = Record<string, unknown>;
export type Projection = Record<string, 0 | 1>;
export type SortSpec = Record<string, 1 | -1>;

export interface IndexDescription {
  key: Record<string, 1 | -1>;
  name?: string;
  unique?: boolean;
}

export const STORE_NAMES = [
  "customers",
  "admins",
  "products",
  "categories",
  "orders",
  "payments",
  "order_status_history",
  "carts",
  "addresses",
  "wishlists",
  "coupons",
  "support_tickets",
  "offices",
  "staff_members",
  "manager_activity",
  "restaurants",
  "grocery_items",
  "purchases",
  "attendance_records",
  "riders",
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

// Same shape as the duplicate-key error the database used to raise, so callers can keep checking it.
export class DuplicateKeyError extends Error {
  readonly code = 11000;
  readonly keyPattern: Record<string, number>;

  constructor(keyPattern: Record<string, number>) {
    super("A record with this value already exists.");
    this.name = "DuplicateKeyError";
    this.keyPattern = keyPattern;
  }
}

export const isDuplicateKeyError = (err: unknown) =>
  err instanceof DuplicateKeyError || (err as { code?: unknown } | null)?.code === 11000;

const KEY_PREFIX = "meg-local:";

function storage(): Storage {
  if (typeof globalThis.localStorage === "undefined") {
    throw new Error("This browser does not support localStorage, so the app cannot save data here.");
  }
  return globalThis.localStorage;
}

// Reads a whole collection. A missing or damaged value counts as an empty collection.
function readStore(store: StoreName): AnyDoc[] {
  const raw = storage().getItem(KEY_PREFIX + store);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnyDoc[]) : [];
  } catch {
    return [];
  }
}

function writeStore(store: StoreName, docs: AnyDoc[]): void {
  storage().setItem(KEY_PREFIX + store, JSON.stringify(docs));
}

async function readAll(store: StoreName): Promise<AnyDoc[]> {
  return readStore(store);
}

// Replaces the document with the same _id, or appends it when there is none.
async function putDoc(store: StoreName, doc: AnyDoc): Promise<void> {
  const docs = readStore(store);
  const index = docs.findIndex((d) => d._id === doc._id);
  if (index >= 0) docs[index] = doc;
  else docs.push(doc);
  writeStore(store, docs);
}

async function deleteDoc(store: StoreName, id: string): Promise<void> {
  writeStore(store, readStore(store).filter((d) => d._id !== id));
}

const queues = new Map<string, Promise<unknown>>();

// Runs tasks for one collection one after another, so read-then-write steps cannot interleave.
function exclusive<T>(store: StoreName, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(store) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  queues.set(store, next.catch(() => undefined));
  return next;
}

const isOperatorObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length > 0 && Object.keys(value).every((k) => k.startsWith("$"));

// Two values are equal when they match. A missing field counts as null, as in MongoDB.
function equal(a: unknown, b: unknown): boolean {
  const x = a ?? null;
  const y = b ?? null;
  if (x === y) return true;
  if (typeof x === "object" && typeof y === "object") return JSON.stringify(x) === JSON.stringify(y);
  return false;
}

// Orders two values for sorting and range checks. Missing values sort first.
function compareValues(a: unknown, b: unknown): number {
  if (a === undefined || a === null || b === undefined || b === null) {
    if (a === b || (a == null && b == null)) return 0;
    return a == null ? -1 : 1;
  }
  if ((typeof a === "number" && typeof b === "number") || (typeof a === "string" && typeof b === "string")) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function matchField(value: unknown, condition: unknown): boolean {
  if (!isOperatorObject(condition)) return equal(value, condition);
  return Object.entries(condition).every(([op, arg]) => {
    switch (op) {
      case "$in":
        return (arg as unknown[]).some((candidate) => equal(value, candidate));
      case "$nin":
        return !(arg as unknown[]).some((candidate) => equal(value, candidate));
      case "$ne":
        return !equal(value, arg);
      case "$gt":
        return value != null && compareValues(value, arg) > 0;
      case "$gte":
        return value != null && compareValues(value, arg) >= 0;
      case "$lt":
        return value != null && compareValues(value, arg) < 0;
      case "$lte":
        return value != null && compareValues(value, arg) <= 0;
      case "$exists":
        return (value !== undefined) === Boolean(arg);
      default:
        throw new Error(`Unsupported query operator ${op}`);
    }
  });
}

function matches(doc: AnyDoc, filter: Filter): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$or") return (condition as Filter[]).some((sub) => matches(doc, sub));
    return matchField(doc[key], condition);
  });
}

// Applies a projection: {field: 1} keeps only those fields, {field: 0} drops them. _id is kept
// unless it is switched off.
function project(doc: AnyDoc, projection?: Projection): AnyDoc {
  if (!projection) return { ...doc };
  const entries = Object.entries(projection);
  const included = entries.filter(([key, on]) => key !== "_id" && on === 1).map(([key]) => key);
  if (included.length > 0 || projection._id === 1) {
    const out: AnyDoc = {};
    if (projection._id !== 0) out._id = doc._id;
    for (const key of included) if (key in doc) out[key] = doc[key];
    return out;
  }
  const out: AnyDoc = { ...doc };
  for (const [key, on] of entries) if (on === 0) delete out[key];
  return out;
}

function comparator(spec: SortSpec) {
  return (a: AnyDoc, b: AnyDoc) => {
    for (const [field, direction] of Object.entries(spec)) {
      const c = compareValues(a[field], b[field]) * direction;
      if (c !== 0) return c;
    }
    return 0;
  };
}

function applyUpdate(doc: AnyDoc, update: Record<string, unknown>): AnyDoc {
  const next: AnyDoc = { ...doc };
  for (const [op, fields] of Object.entries(update)) {
    for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
      switch (op) {
        case "$set":
          next[field] = value;
          break;
        case "$addToSet": {
          const list = Array.isArray(next[field]) ? [...(next[field] as unknown[])] : [];
          if (!list.some((item) => equal(item, value))) list.push(value);
          next[field] = list;
          break;
        }
        case "$pull": {
          const list = Array.isArray(next[field]) ? (next[field] as unknown[]) : [];
          next[field] = list.filter((item) => !equal(item, value));
          break;
        }
        default:
          throw new Error(`Unsupported update operator ${op}`);
      }
    }
  }
  return next;
}

export function newId(prefix = ""): string {
  const random = crypto.getRandomValues(new Uint8Array(4));
  const suffix = Array.from(random, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}${Date.now().toString(36)}-${suffix}`;
}

class Cursor<T> {
  private sortBy: SortSpec | null = null;
  private max: number | null = null;

  constructor(
    private readonly load: () => Promise<AnyDoc[]>,
    private readonly filter: Filter,
    private readonly projection?: Projection,
  ) {}

  sort(spec: SortSpec): this {
    this.sortBy = spec;
    return this;
  }

  limit(n: number): this {
    this.max = n;
    return this;
  }

  async toArray(): Promise<T[]> {
    let docs = (await this.load()).filter((doc) => matches(doc, this.filter));
    if (this.sortBy) docs = [...docs].sort(comparator(this.sortBy));
    if (this.max !== null) docs = docs.slice(0, this.max);
    return docs.map((doc) => project(doc, this.projection) as T);
  }
}

export class LocalCollection<T extends { _id: string }> {
  constructor(
    private readonly store: StoreName,
    private readonly indexes: IndexDescription[],
  ) {}

  private readAll(): Promise<AnyDoc[]> {
    return readAll(this.store);
  }

  private put(doc: AnyDoc): Promise<void> {
    return putDoc(this.store, doc);
  }

  // Writes one document, refusing a duplicate _id or a clash on a unique index.
  private async insertRaw(doc: AnyDoc): Promise<void> {
    const existing = await this.readAll();
    if (existing.some((d) => d._id === doc._id)) throw new DuplicateKeyError({ _id: 1 });
    for (const index of this.indexes.filter((i) => i.unique)) {
      const fields = Object.keys(index.key);
      if (existing.some((d) => fields.every((f) => equal(d[f], doc[f])))) {
        throw new DuplicateKeyError(Object.fromEntries(fields.map((f) => [f, 1])));
      }
    }
    await this.put(doc);
  }

  async findOne(filter: Filter = {}, options: { projection?: Projection } = {}): Promise<T | null> {
    const doc = (await this.readAll()).find((d) => matches(d, filter));
    return doc ? (project(doc, options.projection) as T) : null;
  }

  find(filter: Filter = {}, options: { projection?: Projection } = {}): Cursor<T> {
    return new Cursor<T>(() => this.readAll(), filter, options.projection);
  }

  async insertOne(doc: T): Promise<{ acknowledged: true; insertedId: string }> {
    const record = doc as unknown as AnyDoc;
    await exclusive(this.store, () => this.insertRaw(record));
    return { acknowledged: true, insertedId: doc._id };
  }

  // Inserts each document. With ordered: false, the others are still written when one is a duplicate.
  async insertMany(docs: T[], options: { ordered?: boolean } = {}): Promise<{ acknowledged: true; insertedCount: number }> {
    let duplicate: unknown = null;
    let inserted = 0;
    for (const doc of docs) {
      try {
        await exclusive(this.store, () => this.insertRaw(doc as unknown as AnyDoc));
        inserted += 1;
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err;
        duplicate = err;
        if (options.ordered !== false) throw err;
      }
    }
    if (duplicate) throw duplicate;
    return { acknowledged: true, insertedCount: inserted };
  }

  updateOne(
    filter: Filter,
    update: Record<string, unknown>,
    options: { upsert?: boolean } = {},
  ): Promise<{ matchedCount: number; modifiedCount: number; upsertedId: string | null }> {
    return exclusive(this.store, async () => {
      const found = (await this.readAll()).find((d) => matches(d, filter));
      if (found) {
        await this.put(applyUpdate(found, update));
        return { matchedCount: 1, modifiedCount: 1, upsertedId: null };
      }
      if (!options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedId: null };
      // Upsert: the new document starts from the equality fields of the filter, then the update is applied.
      const base: AnyDoc = {};
      for (const [key, condition] of Object.entries(filter)) {
        if (!key.startsWith("$") && !isOperatorObject(condition)) base[key] = condition;
      }
      const doc = applyUpdate(base, update);
      if (typeof doc._id !== "string") doc._id = newId();
      await this.insertRaw(doc);
      return { matchedCount: 0, modifiedCount: 0, upsertedId: doc._id as string };
    });
  }

  findOneAndUpdate(
    filter: Filter,
    update: Record<string, unknown>,
    options: { returnDocument?: "before" | "after" } = {},
  ): Promise<T | null> {
    return exclusive(this.store, async () => {
      const found = (await this.readAll()).find((d) => matches(d, filter));
      if (!found) return null;
      const next = applyUpdate(found, update);
      await this.put(next);
      return (options.returnDocument === "before" ? found : next) as unknown as T;
    });
  }

  deleteOne(filter: Filter): Promise<{ deletedCount: number }> {
    return exclusive(this.store, async () => {
      const found = (await this.readAll()).find((d) => matches(d, filter));
      if (!found) return { deletedCount: 0 };
      await deleteDoc(this.store, found._id as string);
      return { deletedCount: 1 };
    });
  }

  deleteMany(filter: Filter): Promise<{ deletedCount: number }> {
    return exclusive(this.store, async () => {
      const matching = (await this.readAll()).filter((d) => matches(d, filter));
      for (const doc of matching) {
        await deleteDoc(this.store, doc._id as string);
      }
      return { deletedCount: matching.length };
    });
  }

  async countDocuments(filter: Filter = {}): Promise<number> {
    return (await this.readAll()).filter((d) => matches(d, filter)).length;
  }

  async estimatedDocumentCount(): Promise<number> {
    return (await this.readAll()).length;
  }

  // Only replaceOne operations are used. Each one replaces the matching document, or inserts the
  // replacement when upsert is set.
  bulkWrite(ops: { replaceOne: { filter: Filter; replacement: T; upsert?: boolean } }[]): Promise<{ acknowledged: true }> {
    return exclusive(this.store, async () => {
      for (const { replaceOne } of ops) {
        const replacement = replaceOne.replacement as unknown as AnyDoc;
        const found = (await this.readAll()).find((d) => matches(d, replaceOne.filter));
        if (found) await this.put({ ...replacement, _id: found._id });
        else if (replaceOne.upsert) await this.insertRaw(replacement);
      }
      return { acknowledged: true };
    });
  }
}

// Returns the collection for one store. The indexes list says which fields must be unique.
export async function getCollection<T extends { _id: string }>(
  name: StoreName,
  indexes: IndexDescription[] = [],
): Promise<LocalCollection<T>> {
  return new LocalCollection<T>(name, indexes);
}
