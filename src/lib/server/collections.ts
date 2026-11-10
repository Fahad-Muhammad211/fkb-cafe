import "server-only";
import { MongoClient, MongoServerSelectionError, type Collection, type Db, type Document, type IndexDescription } from "mongodb";

// The app's records live in MongoDB (MONGODB_URI, database MONGODB_DB). This module runs on the
// server only: the browser never talks to the database and never stores business data or sessions.
//
// Documents use a string _id (for example "admin-…", "user-…", "rest-…"), created by the data modules.

export type { Document };

// One MongoDB client per server process. In development Next.js reloads modules often, so the client
// is kept on globalThis; otherwise every reload would open another connection pool.
const globalForMongo = globalThis as unknown as { megMongoClient?: Promise<MongoClient> };

// A setup problem in the environment. Its message is safe to log because it never includes the URI.
export class DatabaseConfigError extends Error {
  override name = "DatabaseConfigError";
}

// The database could not be reached (DNS, network or authentication). The message carries the error
// name, code and per-server causes with the username and password removed.
export class DatabaseUnavailableError extends Error {
  override name = "DatabaseUnavailableError";
}

function connectionString(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new DatabaseConfigError("MONGODB_URI is not set. Add it to .env.local (see .env.example).");
  if (/<db_password>|REPLACE_WITH_DB_PASSWORD/i.test(uri)) {
    throw new DatabaseConfigError("MONGODB_URI still contains a password placeholder. Put the database user's password in .env.local.");
  }
  return uri;
}

function getMongoClient(): Promise<MongoClient> {
  if (!globalForMongo.megMongoClient) {
    const uri = connectionString();
    const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 10_000 });
    globalForMongo.megMongoClient = client.connect().catch((err: unknown) => {
      // Forget a failed connection so the next request retries instead of reusing the error, and close
      // its client so the monitoring connections it opened are not left behind.
      globalForMongo.megMongoClient = undefined;
      client.close().catch(() => undefined);
      throw new DatabaseUnavailableError(`Could not connect to MongoDB: ${describeConnectionError(err, uri)}`);
    });
  }
  return globalForMongo.megMongoClient;
}

// Explains a failed connection for the server log. A MongoServerSelectionError only says "server
// selection timed out", so the per-server causes ("bad auth", "ECONNREFUSED", TLS errors) are added.
function describeConnectionError(err: unknown, uri: string): string {
  const name = err instanceof Error ? err.name : "UnknownError";
  const code = (err as { code?: unknown } | null)?.code;
  const causes = new Set<string>();
  if (err instanceof MongoServerSelectionError) {
    for (const server of err.reason?.servers.values() ?? []) {
      if (server.error) causes.add(server.error.message);
    }
  } else if (err instanceof Error) {
    causes.add(err.message);
  }
  const detail = [...causes].join("; ");
  return redactCredentials(`${name}${code === undefined ? "" : ` (code ${String(code)})`}${detail ? `: ${detail}` : ""}`, uri);
}

// Replaces the username and password from the connection string with "***" wherever they appear.
function redactCredentials(text: string, uri: string): string {
  const start = uri.indexOf("://") + 3;
  const at = uri.lastIndexOf("@");
  if (at < start) return text;
  return uri
    .slice(start, at)
    .split(":")
    .flatMap((part) => [part, safeDecode(part)])
    .filter((part) => part.length >= 3)
    .reduce((out, secret) => out.split(secret).join("***"), text);
}

function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB || "meg");
}

const indexReady = new Map<string, Promise<void>>();

// Returns a typed collection and makes sure its indexes exist (created once per process). The indexes
// list says which fields must be unique; MongoDB enforces them, so racing writes cannot both succeed.
export async function getCollection<T extends { _id: string } & Document>(
  name: string,
  indexes: IndexDescription[] = [],
): Promise<Collection<T>> {
  const db = await getDb();
  const collection = db.collection<T>(name);
  if (indexes.length > 0) {
    let ready = indexReady.get(name);
    if (!ready) {
      ready = collection.createIndexes(indexes).then(
        () => undefined,
        (err: unknown) => {
          indexReady.delete(name);
          throw err;
        },
      );
      indexReady.set(name, ready);
    }
    await ready;
  }
  return collection;
}

export const isDuplicateKeyError = (err: unknown) => (err as { code?: unknown } | null)?.code === 11000;
