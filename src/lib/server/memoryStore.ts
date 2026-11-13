import "server-only";
import type { Collection, Document, IndexDescription } from "mongodb";
import demoData from "./demoData.json";

// Demo mode without a database: an in-memory stand-in for the MongoDB collections, used only when
// MONGODB_URI is not set (or the database cannot be reached). It supports the part of the driver API
// this app uses: find/findOne with filters, sort, limit, skip and projection; insert, update, replace
// and delete; findOneAnd*; count; bulkWrite replaceOne; unique indexes. Data lives in the server
// process, so it resets when the server restarts (on Vercel, when an idle instance is recycled).

type Doc = Record<string, unknown> & { _id: unknown };
type Filter = Record<string, unknown>;

const globalStore = globalThis as unknown as { megMemoryStore?: Map<string, MemoryCollection> };

class DuplicateKeyError extends Error {
  override name = "MongoServerError";
  code = 11000;
  constructor(index: string) {
    super(`E11000 duplicate key error (index: ${index})`);
  }
}

const clone = <T>(v: T): T => structuredClone(v);

function getPath(doc: unknown, path: string): unknown {
  let cur: unknown = doc;
  for (const part of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur) && !/^\d+$/.test(part)) return cur.map((item) => getPath(item, part)).flat();
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setPath(doc: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cur: Record<string, unknown> = doc;
  for (const part of parts.slice(0, -1)) {
    if (typeof cur[part] !== "object" || cur[part] === null) cur[part] = {};
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function unsetPath(doc: Record<string, unknown>, path: string) {
  const parts = path.split(".");
  let cur: Record<string, unknown> | undefined = doc;
  for (const part of parts.slice(0, -1)) cur = cur?.[part] as Record<string, unknown> | undefined;
  if (cur) delete cur[parts[parts.length - 1]];
}

const raw = (v: unknown) => (v instanceof Date ? v.getTime() : v);

function equals(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) return raw(a) === raw(b);
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function compare(a: unknown, b: unknown): number {
  const x = raw(a);
  const y = raw(b);
  if (x === y) return 0;
  if (x === undefined || x === null) return -1;
  if (y === undefined || y === null) return 1;
  return (x as number | string) < (y as number | string) ? -1 : 1;
}

const isOperatorObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date) && Object.keys(v).length > 0 && Object.keys(v).every((k) => k.startsWith("$"));

// Does one value (possibly an array) satisfy a query condition?
function matchValue(value: unknown, cond: unknown): boolean {
  if (isOperatorObject(cond)) {
    return Object.entries(cond).every(([op, arg]) => {
      const values = Array.isArray(value) ? value : [value];
      switch (op) {
        case "$eq":
          return matchValue(value, arg);
        case "$ne":
          return !matchValue(value, arg);
        case "$in":
          return (arg as unknown[]).some((a) => matchValue(value, a));
        case "$nin":
          return !(arg as unknown[]).some((a) => matchValue(value, a));
        case "$gt":
          return values.some((v) => v !== undefined && v !== null && compare(v, arg) > 0);
        case "$gte":
          return values.some((v) => v !== undefined && v !== null && compare(v, arg) >= 0);
        case "$lt":
          return values.some((v) => v !== undefined && v !== null && compare(v, arg) < 0);
        case "$lte":
          return values.some((v) => v !== undefined && v !== null && compare(v, arg) <= 0);
        case "$exists":
          return (value !== undefined) === Boolean(arg);
        case "$type":
          return arg === "null" ? value === null : arg === "array" ? Array.isArray(value) : arg === "date" ? value instanceof Date : typeof value === arg;
        case "$regex": {
          const re = arg instanceof RegExp ? arg : new RegExp(String(arg), String((cond as Record<string, unknown>).$options ?? ""));
          return values.some((v) => typeof v === "string" && re.test(v));
        }
        case "$options":
          return true;
        case "$elemMatch":
          return Array.isArray(value) && value.some((item) => matches(item as Doc, arg as Filter));
        default:
          throw new Error(`Demo store: unsupported query operator ${op}`);
      }
    });
  }
  if (cond instanceof RegExp) return (Array.isArray(value) ? value : [value]).some((v) => typeof v === "string" && cond.test(v));
  if (cond === null) return value === null || value === undefined;
  if (Array.isArray(value) && !Array.isArray(cond)) return value.some((v) => equals(v, cond));
  return equals(value, cond);
}

function matches(doc: Doc, filter: Filter = {}): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Filter[]).some((f) => matches(doc, f));
    if (key === "$and") return (cond as Filter[]).every((f) => matches(doc, f));
    if (key === "$nor") return !(cond as Filter[]).some((f) => matches(doc, f));
    return matchValue(getPath(doc, key), cond);
  });
}

function project<T>(doc: Doc, projection?: Record<string, unknown>): T {
  if (!projection || Object.keys(projection).length === 0) return clone(doc) as T;
  const entries = Object.entries(projection);
  const include = entries.some(([k, v]) => k !== "_id" && Boolean(v));
  if (include) {
    const out: Record<string, unknown> = {};
    if (projection._id !== 0 && projection._id !== false) out._id = doc._id;
    for (const [k, v] of entries) if (v && k !== "_id") {
      const value = getPath(doc, k);
      if (value !== undefined) setPath(out, k, clone(value));
    }
    return out as T;
  }
  const out = clone(doc) as Record<string, unknown>;
  for (const [k] of entries) unsetPath(out, k);
  return out as T;
}

function sortDocs(docs: Doc[], sort?: Record<string, 1 | -1>): Doc[] {
  if (!sort) return docs;
  const keys = Object.entries(sort);
  return [...docs].sort((a, b) => {
    for (const [k, dir] of keys) {
      const c = compare(getPath(a, k), getPath(b, k));
      if (c !== 0) return c * (dir === -1 ? -1 : 1);
    }
    return 0;
  });
}

function applyUpdate(doc: Doc, update: Filter, inserting: boolean): Doc {
  const out = clone(doc) as Doc;
  const ops = Object.keys(update);
  if (ops.length && !ops[0].startsWith("$")) {
    // A replacement document keeps the _id.
    return { ...clone(update), _id: doc._id } as Doc;
  }
  for (const [op, fields] of Object.entries(update)) {
    for (const [path, value] of Object.entries(fields as Record<string, unknown>)) {
      switch (op) {
        case "$set":
          setPath(out, path, clone(value));
          break;
        case "$setOnInsert":
          if (inserting) setPath(out, path, clone(value));
          break;
        case "$unset":
          unsetPath(out, path);
          break;
        case "$inc":
          setPath(out, path, ((getPath(out, path) as number) ?? 0) + (value as number));
          break;
        case "$push": {
          const list = (getPath(out, path) as unknown[]) ?? [];
          const each = isOperatorObject(value) && "$each" in value ? (value.$each as unknown[]) : [value];
          setPath(out, path, [...list, ...clone(each)]);
          break;
        }
        case "$addToSet": {
          const list = (getPath(out, path) as unknown[]) ?? [];
          const each = isOperatorObject(value) && "$each" in value ? (value.$each as unknown[]) : [value];
          setPath(out, path, [...list, ...each.filter((v) => !list.some((x) => equals(x, v)))]);
          break;
        }
        case "$pull": {
          const list = (getPath(out, path) as unknown[]) ?? [];
          const keep = list.filter((item) =>
            typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date) && !isOperatorObject(value)
              ? !matches(item as Doc, value as Filter)
              : !matchValue(item, value),
          );
          setPath(out, path, keep);
          break;
        }
        default:
          throw new Error(`Demo store: unsupported update operator ${op}`);
      }
    }
  }
  return out;
}

// The equality fields of a filter, used as the starting document of an upsert.
function seedFromFilter(filter: Filter): Doc {
  const doc: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith("$")) continue;
    if (isOperatorObject(v)) {
      if ("$eq" in v) setPath(doc, k, clone(v.$eq));
      continue;
    }
    setPath(doc, k, clone(v));
  }
  return doc as Doc;
}

const newId = () => `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type FindOptions = { projection?: Record<string, unknown>; sort?: Record<string, 1 | -1>; limit?: number; skip?: number };

class MemoryCursor<T> {
  private sortSpec?: Record<string, 1 | -1>;
  private limitN = 0;
  private skipN = 0;
  private projection?: Record<string, unknown>;
  private mapper: ((doc: unknown) => unknown) | null = null;

  constructor(
    private readonly source: () => Doc[],
    options: FindOptions = {},
  ) {
    this.sortSpec = options.sort;
    this.limitN = options.limit ?? 0;
    this.skipN = options.skip ?? 0;
    this.projection = options.projection;
  }
  sort(spec: Record<string, 1 | -1>) {
    this.sortSpec = spec;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  skip(n: number) {
    this.skipN = n;
    return this;
  }
  project(p: Record<string, unknown>) {
    this.projection = p;
    return this;
  }
  map<U>(fn: (doc: T) => U): MemoryCursor<U> {
    const prev = this.mapper;
    this.mapper = (doc) => fn((prev ? prev(doc) : doc) as T);
    return this as unknown as MemoryCursor<U>;
  }
  async toArray(): Promise<T[]> {
    let docs = sortDocs(this.source(), this.sortSpec).slice(this.skipN);
    if (this.limitN > 0) docs = docs.slice(0, this.limitN);
    return docs.map((d) => {
      const p = project<T>(d, this.projection);
      return (this.mapper ? this.mapper(p) : p) as T;
    });
  }
  async *[Symbol.asyncIterator]() {
    for (const doc of await this.toArray()) yield doc;
  }
}

class MemoryCollection {
  docs: Doc[] = [];
  private unique: { name: string; keys: string[]; sparse: boolean; partial?: Filter }[] = [];

  constructor(readonly collectionName: string) {}

  addIndexes(indexes: IndexDescription[]) {
    for (const ix of indexes) {
      if (!ix.unique) continue;
      const name = ix.name ?? Object.keys(ix.key).join("_");
      if (this.unique.some((u) => u.name === name)) continue;
      this.unique.push({ name, keys: Object.keys(ix.key as Record<string, unknown>), sparse: Boolean(ix.sparse), partial: ix.partialFilterExpression as Filter | undefined });
    }
  }

  private checkUnique(doc: Doc, exceptId?: unknown) {
    if (this.docs.some((d) => d._id === doc._id && d._id !== exceptId)) throw new DuplicateKeyError("_id_");
    for (const u of this.unique) {
      if (u.partial && !matches(doc, u.partial)) continue;
      const values = u.keys.map((k) => getPath(doc, k));
      if (u.sparse && values.every((v) => v === undefined)) continue;
      const clash = this.docs.some(
        (d) => d._id !== exceptId && d._id !== doc._id && (!u.partial || matches(d, u.partial)) && u.keys.every((k, i) => equals(getPath(d, k) ?? null, values[i] ?? null)),
      );
      if (clash) throw new DuplicateKeyError(u.name);
    }
  }

  find(filter: Filter = {}, options: FindOptions = {}) {
    return new MemoryCursor<Doc>(() => this.docs.filter((d) => matches(d, filter)), options);
  }

  async findOne(filter: Filter = {}, options: FindOptions = {}) {
    const [doc] = await this.find(filter, { ...options, limit: 1 }).toArray();
    return doc ?? null;
  }

  async countDocuments(filter: Filter = {}) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }

  async estimatedDocumentCount() {
    return this.docs.length;
  }

  async insertOne(doc: Doc) {
    const stored = clone({ ...doc, _id: doc._id ?? newId() }) as Doc;
    this.checkUnique(stored);
    this.docs.push(stored);
    if (doc._id === undefined) (doc as Record<string, unknown>)._id = stored._id;
    return { acknowledged: true, insertedId: stored._id };
  }

  async insertMany(docs: Doc[], options: { ordered?: boolean } = {}) {
    const ids: unknown[] = [];
    let error: unknown = null;
    for (const doc of docs) {
      try {
        ids.push((await this.insertOne(doc)).insertedId);
      } catch (err) {
        error = err;
        if (options.ordered !== false) break;
      }
    }
    if (error) throw error;
    return { acknowledged: true, insertedCount: ids.length, insertedIds: Object.fromEntries(ids.map((id, i) => [i, id])) };
  }

  private updateAt(index: number, update: Filter, inserting = false) {
    const next = applyUpdate(this.docs[index], update, inserting);
    this.checkUnique(next, this.docs[index]._id);
    const changed = JSON.stringify(next) !== JSON.stringify(this.docs[index]);
    this.docs[index] = next;
    return changed;
  }

  private upsert(filter: Filter, update: Filter): Doc {
    const base = seedFromFilter(filter);
    const isReplacement = Object.keys(update).length > 0 && !Object.keys(update)[0].startsWith("$");
    const doc = (isReplacement ? { ...base, ...clone(update) } : applyUpdate({ ...base, _id: base._id } as Doc, update, true)) as Doc;
    if (doc._id === undefined) doc._id = newId();
    this.checkUnique(doc);
    this.docs.push(doc);
    return doc;
  }

  async updateOne(filter: Filter, update: Filter, options: { upsert?: boolean } = {}) {
    const index = this.docs.findIndex((d) => matches(d, filter));
    if (index >= 0) {
      const changed = this.updateAt(index, update);
      return { acknowledged: true, matchedCount: 1, modifiedCount: changed ? 1 : 0, upsertedCount: 0, upsertedId: null };
    }
    if (options.upsert) {
      const doc = this.upsert(filter, update);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: doc._id };
    }
    return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0, upsertedId: null };
  }

  async updateMany(filter: Filter, update: Filter, options: { upsert?: boolean } = {}) {
    let matched = 0;
    let modified = 0;
    this.docs.forEach((d, i) => {
      if (!matches(d, filter)) return;
      matched++;
      if (this.updateAt(i, update)) modified++;
    });
    if (!matched && options.upsert) {
      const doc = this.upsert(filter, update);
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: doc._id };
    }
    return { acknowledged: true, matchedCount: matched, modifiedCount: modified, upsertedCount: 0, upsertedId: null };
  }

  async replaceOne(filter: Filter, replacement: Doc, options: { upsert?: boolean } = {}) {
    const { _id: _ignored, ...rest } = replacement;
    void _ignored;
    return this.updateOne(filter, rest as Filter, options);
  }

  async findOneAndUpdate(filter: Filter, update: Filter, options: { upsert?: boolean; returnDocument?: "before" | "after"; projection?: Record<string, unknown> } = {}) {
    const index = this.docs.findIndex((d) => matches(d, filter));
    if (index >= 0) {
      const before = this.docs[index];
      this.updateAt(index, update);
      return project(options.returnDocument === "after" ? this.docs[index] : before, options.projection);
    }
    if (options.upsert) {
      const doc = this.upsert(filter, update);
      return options.returnDocument === "after" ? project(doc, options.projection) : null;
    }
    return null;
  }

  async findOneAndReplace(filter: Filter, replacement: Doc, options: { upsert?: boolean; returnDocument?: "before" | "after" } = {}) {
    const { _id: _ignored, ...rest } = replacement;
    void _ignored;
    return this.findOneAndUpdate(filter, rest as Filter, options);
  }

  async findOneAndDelete(filter: Filter) {
    const index = this.docs.findIndex((d) => matches(d, filter));
    if (index < 0) return null;
    const [doc] = this.docs.splice(index, 1);
    return clone(doc);
  }

  async deleteOne(filter: Filter = {}) {
    const index = this.docs.findIndex((d) => matches(d, filter));
    if (index >= 0) this.docs.splice(index, 1);
    return { acknowledged: true, deletedCount: index >= 0 ? 1 : 0 };
  }

  async deleteMany(filter: Filter = {}) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matches(d, filter));
    return { acknowledged: true, deletedCount: before - this.docs.length };
  }

  async bulkWrite(ops: Record<string, Record<string, unknown>>[]) {
    let upserted = 0;
    let modified = 0;
    let inserted = 0;
    let deleted = 0;
    for (const op of ops) {
      const [kind, args] = Object.entries(op)[0];
      if (kind === "replaceOne") {
        const r = await this.replaceOne(args.filter as Filter, args.replacement as Doc, { upsert: Boolean(args.upsert) });
        upserted += r.upsertedCount;
        modified += r.modifiedCount;
      } else if (kind === "updateOne" || kind === "updateMany") {
        const r = await this[kind](args.filter as Filter, args.update as Filter, { upsert: Boolean(args.upsert) });
        upserted += r.upsertedCount;
        modified += r.modifiedCount;
      } else if (kind === "insertOne") {
        await this.insertOne(args.document as Doc);
        inserted++;
      } else if (kind === "deleteOne" || kind === "deleteMany") {
        deleted += (await this[kind](args.filter as Filter)).deletedCount;
      } else throw new Error(`Demo store: unsupported bulkWrite operation ${kind}`);
    }
    return { ok: 1, insertedCount: inserted, upsertedCount: upserted, modifiedCount: modified, deletedCount: deleted };
  }

  async createIndexes(indexes: IndexDescription[]) {
    this.addIndexes(indexes);
    return indexes.map((ix) => ix.name ?? "");
  }

  async createIndex(key: Record<string, 1 | -1>, options: Partial<IndexDescription> = {}) {
    this.addIndexes([{ key, ...options }]);
    return options.name ?? "";
  }

  async drop() {
    this.docs = [];
    return true;
  }
}

function store(): Map<string, MemoryCollection> {
  if (!globalStore.megMemoryStore) {
    globalStore.megMemoryStore = new Map();
    loadDemoData(globalStore.megMemoryStore);
  }
  return globalStore.megMemoryStore;
}

// Fills a new store with the sample team, attendance, pay and stock (src/lib/server/demoData.json).
function loadDemoData(collections: Map<string, MemoryCollection>) {
  const data = demoData as unknown as Record<string, Doc[]>;
  for (const [name, docs] of Object.entries(data)) {
    const col = new MemoryCollection(name);
    col.docs = docs.map((d) => reviveDates(d) as Doc);
    collections.set(name, col);
  }
}

// JSON has no Date type: fields saved as { $date: "…" } become Dates again.
function reviveDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Object.keys(obj).length === 1 && typeof obj.$date === "string") return new Date(obj.$date);
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, reviveDates(v)]));
  }
  return value;
}

export function memoryCollection<T extends Document>(name: string, indexes: IndexDescription[] = []): Collection<T> {
  const collections = store();
  let col = collections.get(name);
  if (!col) {
    col = new MemoryCollection(name);
    collections.set(name, col);
  }
  col.addIndexes(indexes);
  return col as unknown as Collection<T>;
}
