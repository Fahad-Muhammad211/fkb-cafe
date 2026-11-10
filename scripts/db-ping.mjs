// Read-only MongoDB connectivity check. Prints the cluster host, database name, ping result and the
// collection inventory with document counts. Never prints the connection string or credentials.
//
// Run: npm run db:ping   (reads MONGODB_URI and MONGODB_DB from .env.local)

import mongodb from "mongodb";

const { MongoClient } = mongodb;

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "meg";
if (!uri) {
  console.error("MONGODB_URI is not set. Run with --env-file=.env.local.");
  process.exit(1);
}

let host = "(unparseable)";
let user = "(none)";
try {
  const parsed = new URL(uri);
  host = parsed.host;
  user = parsed.username ? `${decodeURIComponent(parsed.username).slice(0, 2)}***` : "(none)";
} catch {
  // mongodb+srv URIs always parse with URL; leave the placeholders otherwise.
}
console.log(`host=${host} db=${dbName} user=${user}`);

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
try {
  await client.connect();
  const db = client.db(dbName);
  const ping = await db.command({ ping: 1 });
  console.log(`ping ok=${ping.ok}`);
  const collections = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).sort();
  console.log(`collections=${collections.length}`);
  for (const name of collections) {
    console.log(`  ${name}: ${await db.collection(name).countDocuments({})}`);
  }
} catch (error) {
  console.error(`MongoDB error: ${error?.name}: ${error?.message}`);
  if (error?.codeName) console.error(`codeName=${error.codeName} code=${error.code}`);
  process.exitCode = 1;
} finally {
  await client.close();
}
