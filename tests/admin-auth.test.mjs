// Admin and customer auth tests. They run against a real `next start` server and a real MongoDB
// database, using a throwaway database named meg_test_<random>. That database is dropped at the end.
// The real database (MONGODB_DB) is only read, to check that its admin and customer counts did not change.
//
// Run: npm run build, then npm test. Needs MONGODB_URI in .env.local.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 3300 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const TEST_DB = `meg_test_${randomBytes(4).toString("hex")}`;
const REAL_DB = process.env.MONGODB_DB || "meg";
const PASSWORD = "TestPass123";

const randomGmail = () => `megtest${randomBytes(3).toString("hex")}@gmail.com`;
const randomCustomerEmail = () => `customer.${randomBytes(4).toString("hex")}@example.com`;

let server;
let client;
let realClient;
let realCountsBefore;

// Pulls one cookie value out of a response's Set-Cookie headers, returned as "name=value".
function cookieFrom(res, name) {
  const found = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return found ? found.split(";")[0] : null;
}

const postJson = (urlPath, body, cookie) =>
  fetch(BASE + urlPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    redirect: "manual",
  });

const get = (urlPath, cookie) => fetch(BASE + urlPath, { headers: cookie ? { cookie } : {}, redirect: "manual" });

const testDb = () => client.db(TEST_DB);

async function countRealCollections() {
  const db = realClient.db(REAL_DB);
  return { admins: await db.collection("admins").countDocuments(), customers: await db.collection("customers").countDocuments() };
}

async function waitForServer() {
  for (let i = 0; i < 90; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/catalog`);
      if (res.ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`next start did not answer on ${BASE} within 90 seconds`);
}

before(async () => {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set. Run the tests with --env-file=.env.local (npm test does this).");
  if (!TEST_DB.startsWith("meg_test_") || TEST_DB === REAL_DB) throw new Error("Refusing to run: the test database name is not isolated.");
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("No production build found. Run npm run build first.");

  realClient = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await realClient.connect();
  realCountsBefore = await countRealCollections();

  client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  await client.connect();

  server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, MONGODB_DB: TEST_DB, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", () => {});
  await waitForServer();
});

after(async () => {
  if (server?.pid) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  if (client) {
    if (TEST_DB.startsWith("meg_test_") && TEST_DB !== REAL_DB) await testDb().dropDatabase();
    await client.close();
  }
  if (realClient) {
    const countsAfter = realCountsBefore ? await countRealCollections() : null;
    await realClient.close();
    if (realCountsBefore) assert.deepEqual(countsAfter, realCountsBefore, "the real database must not change during the tests");
  }
});

describe("initial admin setup", () => {
  test("the signup page shows the form before any admin exists", async () => {
    const res = await get("/admin/signup");
    assert.equal(res.status, 200);
    assert.match(await res.text(), /admin-signup-email/);
  });

  let winnerCookie;

  test("concurrent setup requests create exactly one initial admin", async () => {
    const attempts = Array.from({ length: 8 }, () =>
      postJson("/api/admin/accounts", { name: "Setup Admin", email: randomGmail(), password: PASSWORD, confirm: PASSWORD }),
    );
    const results = await Promise.all(attempts);
    const statuses = results.map((r) => r.status).sort();
    assert.equal(statuses.filter((s) => s === 201).length, 1, `expected exactly one 201, got ${statuses.join(",")}`);
    assert.equal(statuses.filter((s) => s === 403).length, 7, `expected seven 403s, got ${statuses.join(",")}`);

    const winner = results.find((r) => r.status === 201);
    winnerCookie = cookieFrom(winner, "meg_admin_session");
    assert.ok(winnerCookie, "the initial admin must be signed in");

    const admins = await testDb().collection("admins").find({}).toArray();
    assert.equal(admins.length, 1, "exactly one admin document in the test database");
    assert.equal(admins[0]._id, "admin-initial");
  });

  test("setup stays closed after the initial admin exists", async () => {
    const res = await postJson("/api/admin/accounts", { name: "Late Admin", email: randomGmail(), password: PASSWORD, confirm: PASSWORD });
    assert.equal(res.status, 403);
    assert.equal(await testDb().collection("admins").countDocuments(), 1);
  });

  test("the signup page is closed and the login page no longer links to it", async () => {
    const signup = await get("/admin/signup");
    assert.equal(signup.status, 200);
    const signupHtml = await signup.text();
    assert.match(signupHtml, /Admin signup closed/);
    assert.doesNotMatch(signupHtml, /admin-signup-email/);

    const login = await get("/admin/login");
    assert.equal(login.status, 200);
    assert.doesNotMatch(await login.text(), /Create one/);
  });

  describe("unauthorized admin creation", () => {
    test("no session cannot create an admin", async () => {
      const res = await postJson("/api/admin/accounts", { name: "Intruder", email: randomGmail(), password: PASSWORD, confirm: PASSWORD });
      assert.equal(res.status, 403);
      assert.equal(await testDb().collection("admins").countDocuments(), 1);
    });

    test("a forged or malformed admin cookie cannot create an admin", async () => {
      const res = await postJson(
        "/api/admin/accounts",
        { name: "Intruder", email: randomGmail(), password: PASSWORD, confirm: PASSWORD },
        "meg_admin_session=eyJzdWIiOiJhZG1pbi1pbml0aWFsIn0.forgedsignature",
      );
      assert.equal(res.status, 403);
      assert.equal(await testDb().collection("admins").countDocuments(), 1);
    });

    test("a customer session cannot create an admin", async () => {
      const signup = await postJson("/api/customers", {
        name: "Shop Customer",
        email: randomCustomerEmail(),
        phone: "03001234567",
        password: PASSWORD,
        confirm: PASSWORD,
      });
      assert.equal(signup.status, 201);
      const customerCookie = cookieFrom(signup, "meg_customer_session");
      assert.ok(customerCookie);

      const res = await postJson("/api/admin/accounts", { name: "Sneaky", email: randomGmail(), password: PASSWORD, confirm: PASSWORD }, customerCookie);
      assert.equal(res.status, 403);
      assert.equal(await testDb().collection("admins").countDocuments(), 1);
    });

    test("admin-only APIs reject a customer session", async () => {
      const signup = await postJson("/api/customers", {
        name: "Another Customer",
        email: randomCustomerEmail(),
        phone: "03001234567",
        password: PASSWORD,
        confirm: PASSWORD,
      });
      const customerCookie = cookieFrom(signup, "meg_customer_session");
      const res = await get("/api/admin/customers", customerCookie);
      assert.equal(res.status, 401);
    });
  });

  describe("authorized admin creation", () => {
    let newAdminEmail;

    test("a signed-in admin can create another admin without changing their own session", async () => {
      newAdminEmail = randomGmail();
      const res = await postJson("/api/admin/accounts", { name: "Second Admin", email: newAdminEmail, password: PASSWORD, confirm: PASSWORD, responsibilities: ["orders"] }, winnerCookie);
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.account.email, newAdminEmail);
      assert.equal(cookieFrom(res, "meg_admin_session"), null, "the caller's session must not be replaced");

      const admins = await testDb().collection("admins").find({}).toArray();
      assert.equal(admins.length, 2);
      const created = admins.find((a) => a.email === newAdminEmail);
      assert.ok(created, "the new admin is saved in the database");
      assert.notEqual(created._id, "admin-initial");
      assert.ok(created.passwordHash.startsWith("scrypt$"), "the password is stored as a scrypt hash");
      assert.ok(!created.passwordHash.includes(PASSWORD));
    });

    test("the creator's dashboard is still reachable after creating an admin", async () => {
      const res = await get("/admin", winnerCookie);
      assert.equal(res.status, 200);
    });

    test("a duplicate Gmail address is rejected", async () => {
      const res = await postJson("/api/admin/accounts", { name: "Dup", email: newAdminEmail, password: PASSWORD, confirm: PASSWORD, responsibilities: ["orders"] }, winnerCookie);
      assert.equal(res.status, 400);
      assert.ok((await res.json()).errors.email);
    });

    test("the new admin can log in with their own credentials", async () => {
      const res = await postJson("/api/admin/session", { email: newAdminEmail, password: PASSWORD });
      assert.equal(res.status, 200);
      assert.ok(cookieFrom(res, "meg_admin_session"));
    });

    test("the dashboard redirects signed-out visitors to login", async () => {
      const res = await get("/admin");
      assert.equal(res.status, 307);
      assert.match(res.headers.get("location"), /\/admin\/login$/);
    });
  });
});

describe("customer flows are unchanged", () => {
  const email = randomCustomerEmail();
  let customerCookie;

  test("customer signup saves an account and signs the customer in", async () => {
    const res = await postJson("/api/customers", { name: "Flow Customer", email, phone: "03001234567", password: PASSWORD, confirm: PASSWORD });
    assert.equal(res.status, 201);
    customerCookie = cookieFrom(res, "meg_customer_session");
    assert.ok(customerCookie);
    const saved = await testDb().collection("customers").findOne({ email });
    assert.ok(saved, "the customer is saved in the database");
    assert.ok(saved.passwordHash.startsWith("scrypt$"));
  });

  test("customer login with the right password succeeds", async () => {
    const res = await postJson("/api/customer/session", { email, password: PASSWORD });
    assert.equal(res.status, 200);
    assert.ok(cookieFrom(res, "meg_customer_session"));
  });

  test("customer login with the wrong password is rejected", async () => {
    const res = await postJson("/api/customer/session", { email, password: "WrongPass999" });
    assert.equal(res.status, 401);
  });

  test("the signed-in customer can read their profile", async () => {
    const res = await get("/api/customer/profile", customerCookie);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).user.email, email);
  });

  test("the public catalog responds with products", async () => {
    const res = await get("/api/catalog");
    assert.equal(res.status, 200);
    assert.ok((await res.json()).products.length > 0);
  });
});
