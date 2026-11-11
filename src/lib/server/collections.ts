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

// Why the database cannot be used. Each kind has a message that is safe to show to visitors: it names
// the cause and the fix, but never the connection string, host names, username or password.
export type DatabaseProblem = "not_configured" | "invalid_uri" | "network_blocked" | "dns" | "auth" | "timeout" | "unknown";

export const DATABASE_PROBLEM_MESSAGES: Record<DatabaseProblem, string> = {
  not_configured: "The server's database connection is not configured (MONGODB_URI is missing or still has a placeholder).",
  invalid_uri: "The server's database connection string (MONGODB_URI) is not valid.",
  network_blocked:
    "The database refused the connection from this server. In MongoDB Atlas, allow this server's IP address under Network Access (0.0.0.0/0 for Vercel) and make sure the cluster is not paused.",
  dns: "The database address could not be found. Check the cluster host in MONGODB_URI and the server's internet connection.",
  auth: "The database rejected the username or password in MONGODB_URI.",
  timeout: "The database did not respond in time. Please try again shortly.",
  unknown: "The service is unavailable right now. Please try again shortly.",
};

// A setup problem in the environment. Its message is safe to log because it never includes the URI.
export class DatabaseConfigError extends Error {
  override name = "DatabaseConfigError";
  constructor(
    message: string,
    readonly problem: DatabaseProblem = "not_configured",
  ) {
    super(message);
  }
}

// The database could not be reached (DNS, network or authentication). The message carries the error
// name, code and per-server causes with the username and password removed.
export class DatabaseUnavailableError extends Error {
  override name = "DatabaseUnavailableError";
  constructor(
    message: string,
    readonly problem: DatabaseProblem = "unknown",
  ) {
    super(message);
  }
}

function connectionString(): string {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new DatabaseConfigError("MONGODB_URI is not set. Add it to .env.local (see .env.example) or to the host's environment settings.");
  if (/<db_password>|REPLACE_WITH_DB_PASSWORD/i.test(uri)) {
    throw new DatabaseConfigError("MONGODB_URI still contains a password placeholder. Put the database user's password in .env.local.");
  }
  return uri;
}

// Kept under Vercel's default 10-second function limit, so a failed connection returns this app's own
// error instead of the platform's timeout page.
const SERVER_SELECTION_TIMEOUT_MS = 8_000;

function getMongoClient(): Promise<MongoClient> {
  if (!globalForMongo.megMongoClient) {
    const uri = connectionString();
    let client: MongoClient;
    try {
      client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
    } catch (err) {
      // The driver parses the URI here; its message can quote the URI, so only the error name is kept.
      throw new DatabaseConfigError(`MONGODB_URI could not be parsed (${err instanceof Error ? err.name : "error"}).`, "invalid_uri");
    }
    globalForMongo.megMongoClient = client.connect().catch((err: unknown) => {
      // Forget a failed connection so the next request retries instead of reusing the error, and close
      // its client so the monitoring connections it opened are not left behind.
      globalForMongo.megMongoClient = undefined;
      client.close().catch(() => undefined);
      const detail = describeConnectionError(err, uri);
      throw new DatabaseUnavailableError(`Could not connect to MongoDB: ${detail}`, classifyConnectionError(detail));
    });
  }
  return globalForMongo.megMongoClient;
}

// Sorts a connection failure into a cause from the (already redacted) driver detail.
function classifyConnectionError(detail: string): DatabaseProblem {
  if (/bad auth|authentication failed|auth.*fail|code 18\b|AuthenticationFailed/i.test(detail)) return "auth";
  // Atlas answers a client that is not on its IP Access List (or a paused cluster) by aborting the TLS
  // handshake with alert 80 "internal error"; a closed or refused port means the same in practice.
  if (/alert number 80|tlsv1 alert internal error|ECONNREFUSED|ECONNRESET|socket hang up/i.test(detail)) return "network_blocked";
  if (/querySrv|queryTxt|ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(detail)) return "dns";
  if (/timed out|ETIMEDOUT|timeout/i.test(detail)) return "timeout";
  return "unknown";
}

// The 503 an API route returns when the database cannot be used, with a message naming the cause. The
// full (credential-free) detail is logged on the server under `tag`.
export function databaseErrorResponse(err: DatabaseConfigError | DatabaseUnavailableError, tag: string): Response {
  console.error(`[${tag}] ${err.message}`);
  const body = { error: DATABASE_PROBLEM_MESSAGES[err.problem], code: `database_${err.problem}` };
  return new Response(JSON.stringify(body), { status: 503, headers: { "Content-Type": "application/json" } });
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

// The database every module uses, for sign-up and login alike. MONGODB_DB names it; without it the app
// uses "restaurant_system" (the name in .env.example), never a different, empty database.
export const DEFAULT_DB_NAME = "restaurant_system";

async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB?.trim() || DEFAULT_DB_NAME);
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
