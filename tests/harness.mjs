// Shared test harness: starts a throwaway MongoDB server (mongodb-memory-server, a real mongod running
// in memory on this machine) and `next start` connected to it. The tests never connect to the database
// in .env.local: MONGODB_URI, MONGODB_DB and ADMIN_SETUP_KEY are set on the server process, and
// process environment variables take precedence over .env.local in Next.js.
//
// Run: npm run build, then npm test.

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const TEST_SETUP_KEY = "test-setup-key-0123456789abcdef";
const TEST_DB = "meg_test";

// Options: setupKey — the ADMIN_SETUP_KEY for the server; null starts it without one.
//          env — extra environment variables for the server (for example TRUSTED_PROXY_HOPS).
export async function startTestEnvironment({ setupKey = TEST_SETUP_KEY, env: extraEnv = {} } = {}) {
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("No production build found. Run npm run build first.");

  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(uri)) {
    await mongo.stop();
    throw new Error("Refusing to run: the test database is not a local in-memory server.");
  }

  const port = 3800 + Math.floor(Math.random() * 1000);
  const base = `http://localhost:${port}`;
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(TEST_DB);

  const server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: ROOT,
    // TRUSTED_PROXY_HOPS is cleared unless a test sets it, so a value in the shell cannot change results.
    env: { ...process.env, TRUSTED_PROXY_HOPS: "", ...extraEnv, MONGODB_URI: uri, MONGODB_DB: TEST_DB, ADMIN_SETUP_KEY: setupKey ?? "", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverLog = [];
  server.stdout.on("data", (chunk) => serverLog.push(String(chunk)));
  server.stderr.on("data", (chunk) => serverLog.push(String(chunk)));

  try {
    await waitForServer(base);
  } catch (err) {
    stopServer(server);
    await client.close();
    await mongo.stop();
    throw new Error(`${err.message}\n${serverLog.join("")}`);
  }

  return {
    base,
    db,
    serverLog,
    // Empties every collection (indexes are kept), so the next test starts from a fresh install.
    async reset() {
      for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
        await db.collection(name).deleteMany({});
      }
    },
    async stop() {
      stopServer(server);
      await client.close();
      await mongo.stop();
    },
  };
}

function stopServer(server) {
  if (!server.pid) return;
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  } catch {
    // Already stopped.
  }
}

async function waitForServer(base) {
  for (let i = 0; i < 90; i += 1) {
    try {
      const res = await fetch(`${base}/api/catalog`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`next start did not answer on ${base} within 90 seconds`);
}

export const randomGmail = () => `megtest${randomBytes(3).toString("hex")}@gmail.com`;
export const randomCustomerEmail = () => `customer.${randomBytes(4).toString("hex")}@example.com`;
export const TEST_PASSWORD = "TestPass123";

// Returns "name=value" for one cookie from a response, or null.
export function cookieFrom(res, name) {
  const found = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return found ? found.split(";")[0] : null;
}

// The full Set-Cookie header for one cookie, or null.
export function setCookieHeader(res, name) {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`)) ?? null;
}

export async function signUpCustomer(base, overrides = {}) {
  const email = overrides.email ?? randomCustomerEmail();
  const res = await fetch(`${base}/api/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: overrides.name ?? "Test Customer", email, phone: "03001234567", password: TEST_PASSWORD, confirm: TEST_PASSWORD }),
  });
  const body = await res.json();
  return { res, status: res.status, body, email, cookie: cookieFrom(res, "meg_customer_session") };
}

// Creates the first Admin through the setup route, sending only what the sign-up form sends (Full Name,
// Email, Password). The server allows it only while it has ADMIN_SETUP_KEY configured and no Admin exists.
export async function createFirstAdmin(base, overrides = {}) {
  const email = overrides.email ?? randomGmail();
  const res = await fetch(`${base}/api/admin/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: overrides.name ?? "Setup Admin", email, password: TEST_PASSWORD, ...overrides.extra }),
  });
  const body = await res.json().catch(() => null);
  return { res, status: res.status, body, email, cookie: cookieFrom(res, "meg_admin_session") };
}

export async function json(method, url, { cookie, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  return { status: res.status, data, text, res };
}
