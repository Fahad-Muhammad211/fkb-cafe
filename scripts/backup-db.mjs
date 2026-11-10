// Read-only backup of the MongoDB database named in MONGODB_DB (default "meg").
// Every collection is written as Extended JSON to backups/<db>-<timestamp>/<collection>.json, and a
// summary (document counts and field names, no values) is printed. Nothing in the database is changed.
//
// Run: npm run db:backup   (reads MONGODB_URI and MONGODB_DB from .env.local)
// The backups/ folder is gitignored: it holds real customer data and password hashes.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import mongodb from "mongodb";

const { BSON, MongoClient } = mongodb;
const { EJSON } = BSON;

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "meg";
if (!uri) {
  console.error("MONGODB_URI is not set. Run with --env-file=.env.local.");
  process.exit(1);
}

const root = path.resolve(import.meta.dirname, "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.join(root, "backups", `${dbName}-${stamp}`);

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const db = client.db(dbName);
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  mkdirSync(outDir, { recursive: true });
  const summary = {};
  for (const name of collections) {
    const docs = await db.collection(name).find({}).toArray();
    writeFileSync(path.join(outDir, `${name}.json`), EJSON.stringify(docs, null, 2, { relaxed: false }));
    const fields = new Set();
    for (const doc of docs) for (const key of Object.keys(doc)) fields.add(key);
    summary[name] = { count: docs.length, fields: [...fields].sort() };
  }
  writeFileSync(path.join(outDir, "_summary.json"), JSON.stringify({ db: dbName, takenAt: new Date().toISOString(), collections: summary }, null, 2));
  console.log(`Backed up ${collections.length} collections from "${dbName}" to ${outDir}`);
  for (const [name, info] of Object.entries(summary)) console.log(`  ${name}: ${info.count} docs; fields: ${info.fields.join(", ")}`);
} finally {
  await client.close();
}
