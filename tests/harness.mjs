// Shared test harness: starts `next start` against a throwaway database (meg_test_<random>) and drops
// that database when the tests finish. The real database (MONGODB_DB) is only counted before and after,
// to prove the tests did not change it.

import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

export const ROOT = path.resolve(import.meta.dirname, "..");

export async function startTestEnvironment() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set. Run the tests with --env-file=.env.local (npm test does this).");
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("No production build found. Run npm run build first.");

  const realDb = process.env.MONGODB_DB || "meg";
  const testDb = `meg_test_${randomBytes(4).toString("hex")}`;
  if (!testDb.startsWith("meg_test_") || testDb === realDb) throw new Error("Refusing to run: the test database name is not isolated.");

  const port = 3800 + Math.floor(Math.random() * 500);
  const base = `http://localhost:${port}`;

  const realClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await realClient.connect();
  const realCountsBefore = await countReal(realClient, realDb);

  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await client.connect();

  const server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, MONGODB_DB: testDb, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", () => {});

  await waitForServer(base);

  return {
    base,
    db: client.db(testDb),
    testDb,
    async stop() {
      if (server.pid) {
        if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
        else server.kill("SIGTERM");
      }
      if (testDb.startsWith("meg_test_") && testDb !== realDb) await client.db(testDb).dropDatabase();
      await client.close();
      const countsAfter = await countReal(realClient, realDb);
      await realClient.close();
      if (JSON.stringify(countsAfter) !== JSON.stringify(realCountsBefore)) {
        throw new Error(`The real database changed during the tests: ${JSON.stringify(realCountsBefore)} -> ${JSON.stringify(countsAfter)}`);
      }
    },
  };
}

async function countReal(client, dbName) {
  const db = client.db(dbName);
  return {
    admins: await db.collection("admins").countDocuments(),
    customers: await db.collection("customers").countDocuments(),
    orders: await db.collection("orders").countDocuments(),
  };
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
