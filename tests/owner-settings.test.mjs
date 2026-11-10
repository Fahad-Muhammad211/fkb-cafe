// /owner/settings: the Seats and Tables Number settings. They are saved in MongoDB for the Owner's own
// restaurant, the table list follows Tables Number without duplicates, and orders are never deleted.
// Runs against the production build and a throwaway in-memory MongoDB (tests/harness.mjs).
//
// Run: npm run build, then node --test tests/owner-settings.test.mjs

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { TEST_PASSWORD, cookieFrom, createFirstAdmin, json, randomGmail, startTestEnvironment } from "./harness.mjs";

const ADMIN_COOKIE = "meg_admin_session";
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

let env;
let base;

before(async () => {
  env = await startTestEnvironment();
  base = env.base;
});
after(async () => {
  if (env) await env.stop();
});
beforeEach(async () => {
  await env.reset();
});

// The Admin creates a restaurant and its Owner; returns the Owner's credentials, session and restaurant id.
async function ownerFor(adminCookie, name) {
  const rest = await json("POST", `${base}/api/admin/restaurants`, { cookie: adminCookie, body: { name, area: "Gulberg" } });
  assert.equal(rest.status, 201, rest.text);
  const restaurantId = rest.data.restaurant.id;
  const email = randomGmail();
  const owner = await json("POST", `${base}/api/admin/accounts`, {
    cookie: adminCookie,
    body: { name: `${name} Owner`, email, password: TEST_PASSWORD, confirm: TEST_PASSWORD, restaurantId },
  });
  assert.equal(owner.status, 201, owner.text);
  const login = await json("POST", `${base}/api/admin/session`, { body: { email, password: TEST_PASSWORD } });
  assert.equal(login.status, 200, login.text);
  return { email, restaurantId, cookie: cookieFrom(login.res, ADMIN_COOKIE) };
}

const save = (cookie, body) => json("PUT", `${base}/api/owner/settings`, { cookie, body });
const listTables = async (cookie) => (await json("GET", `${base}/api/owner/tables`, { cookie })).data.tables;

describe("Seats and Tables Number", () => {
  test("are saved in MongoDB for the Owner's restaurant and read back", async () => {
    const admin = await createFirstAdmin(base);
    const owner = await ownerFor(admin.cookie, "Settings Kitchen");

    // Before any save: no tables, default seats.
    assert.deepEqual((await json("GET", `${base}/api/owner/settings`, { cookie: owner.cookie })).data, { tableCount: 0, seats: 4 });

    const saved = await save(owner.cookie, { tableCount: 5, seats: 6 });
    assert.equal(saved.status, 200, saved.text);
    assert.equal(saved.data.tableCount, 5);
    assert.equal(saved.data.seats, 6);
    assert.deepEqual(saved.data.created, [1, 2, 3, 4, 5]);

    // Stored against the restaurant from the session.
    const doc = await env.db.collection("restaurant_settings").findOne({ _id: owner.restaurantId });
    assert.equal(doc.restaurantId, owner.restaurantId);
    assert.equal(doc.tableCount, 5);
    assert.equal(doc.seats, 6);

    // A fresh read (as after a page refresh) returns the saved values.
    assert.deepEqual((await json("GET", `${base}/api/owner/settings`, { cookie: owner.cookie })).data, { tableCount: 5, seats: 6 });
    const tables = await listTables(owner.cookie);
    assert.deepEqual(tables.map((t) => t.number), [1, 2, 3, 4, 5]);
    assert.ok(tables.every((t) => t.seats === 6));
  });

  test("saving again never creates duplicate tables, and existing tables keep their seats", async () => {
    const admin = await createFirstAdmin(base);
    const owner = await ownerFor(admin.cookie, "Repeat Kitchen");
    await save(owner.cookie, { tableCount: 3, seats: 4 });
    // The Owner gives Table 2 its own seat count.
    const t2 = (await listTables(owner.cookie)).find((t) => t.number === 2);
    assert.equal((await json("PATCH", `${base}/api/owner/tables/${t2.id}`, { cookie: owner.cookie, body: { seats: 8 } })).status, 200);

    // Same settings twice, and several saves at once.
    assert.deepEqual((await save(owner.cookie, { tableCount: 3, seats: 4 })).data.created, []);
    const racing = await Promise.all([0, 1, 2, 3].map(() => save(owner.cookie, { tableCount: 6, seats: 2 })));
    assert.ok(racing.every((r) => r.status === 200), racing.map((r) => r.text).join("\n"));

    const docs = await env.db.collection("restaurant_tables").find({ restaurantId: owner.restaurantId }).toArray();
    assert.equal(docs.length, 6, "exactly one table per number");
    assert.deepEqual(docs.map((d) => d.number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
    const byNumber = new Map(docs.map((d) => [d.number, d.seats]));
    assert.equal(byNumber.get(2), 8, "Table 2 keeps its own seats");
    assert.equal(byNumber.get(1), 4);
    assert.equal(byNumber.get(4), 2, "new tables get the configured seats");
  });

  test("lowering the count removes free tables but keeps tables with open orders, and deletes no orders", async () => {
    const admin = await createFirstAdmin(base);
    const owner = await ownerFor(admin.cookie, "Shrink Kitchen");
    await env.db.collection("products").insertOne({ _id: "test-dish", categoryId: "mains", name: "Test Dish", price: 500, position: 0, available: true });
    await save(owner.cookie, { tableCount: 5, seats: 4 });
    const t4 = (await listTables(owner.cookie)).find((t) => t.number === 4);

    const order = await json("POST", `${base}/api/owner/orders`, {
      cookie: owner.cookie,
      body: { clientOrderId: `settings-test-${Date.now()}`, orderType: "dine_in", tableId: t4.id, lines: [{ itemId: "test-dish", qty: 2 }] },
    });
    assert.equal(order.status, 201, order.text);
    const ordersBefore = await env.db.collection("orders").countDocuments();

    const shrink = await save(owner.cookie, { tableCount: 2, seats: 4 });
    assert.equal(shrink.status, 200, shrink.text);
    assert.deepEqual(shrink.data.removed, [3, 5]);
    assert.deepEqual(shrink.data.kept, [4]);
    assert.deepEqual((await listTables(owner.cookie)).map((t) => t.number), [1, 2, 4]);
    assert.equal(await env.db.collection("orders").countDocuments(), ordersBefore, "no order was deleted");
    assert.equal((await env.db.collection("orders").findOne({ _id: order.data.order.id })).tableId, t4.id);

    // Growing back recreates the missing numbers once, next to the kept table.
    const grow = await save(owner.cookie, { tableCount: 5, seats: 4 });
    assert.deepEqual(grow.data.created, [3, 5]);
    assert.deepEqual((await listTables(owner.cookie)).map((t) => t.number), [1, 2, 3, 4, 5]);
  });

  test("rejects invalid values and only touches the Owner's own restaurant", async () => {
    const admin = await createFirstAdmin(base);
    const a = await ownerFor(admin.cookie, "Kitchen A");
    const b = await ownerFor(admin.cookie, "Kitchen B");

    const bad = await save(a.cookie, { tableCount: -1, seats: 0 });
    assert.equal(bad.status, 400);
    assert.ok(bad.data.errors.tableCount && bad.data.errors.seats);
    assert.equal((await save(a.cookie, { tableCount: 201, seats: 4 })).status, 400);
    assert.equal((await save(a.cookie, { tableCount: 2.5, seats: 4 })).status, 400);

    // A restaurantId in the body is ignored: the session decides.
    assert.equal((await save(a.cookie, { tableCount: 3, seats: 4, restaurantId: b.restaurantId })).status, 200);
    assert.equal((await listTables(a.cookie)).length, 3);
    assert.equal((await listTables(b.cookie)).length, 0);
    assert.equal(await env.db.collection("restaurant_settings").countDocuments({ _id: b.restaurantId }), 0);

    // Signed-out visitors and the Admin cannot use the Owner settings.
    assert.equal((await save(undefined, { tableCount: 3, seats: 4 })).status >= 401, true);
    assert.equal((await json("GET", `${base}/api/owner/settings`)).status >= 401, true);
  });

  test("Add table and Remove keep the saved Tables Number in step", async () => {
    const admin = await createFirstAdmin(base);
    const owner = await ownerFor(admin.cookie, "Step Kitchen");
    await save(owner.cookie, { tableCount: 2, seats: 4 });
    assert.equal((await json("POST", `${base}/api/owner/tables`, { cookie: owner.cookie, body: { seats: 4 } })).status, 201);
    assert.equal((await json("GET", `${base}/api/owner/settings`, { cookie: owner.cookie })).data.tableCount, 3);
    const t1 = (await listTables(owner.cookie)).find((t) => t.number === 1);
    assert.equal((await json("DELETE", `${base}/api/owner/tables/${t1.id}`, { cookie: owner.cookie })).status, 200);
    assert.equal((await json("GET", `${base}/api/owner/settings`, { cookie: owner.cookie })).data.tableCount, 2);
  });
});

describe("/owner/settings page", () => {
  let browser;
  before(async () => {
    const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
    if (!chromePath) throw new Error("Chrome was not found. Set CHROME_PATH to the Chrome executable.");
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  test("saves both settings, shows them after a refresh, and the Tables dashboard lists the tables", async () => {
    const admin = await createFirstAdmin(base);
    const owner = await ownerFor(admin.cookie, "Browser Kitchen");
    const context = await browser.newContext();
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
    try {
      await page.goto(`${base}/admin/login`);
      await page.fill("#admin-login-email", owner.email);
      await page.fill("#admin-login-password", TEST_PASSWORD);
      await page.getByRole("button", { name: "Login", exact: true }).click();
      await page.waitForURL((url) => url.pathname.startsWith("/owner"));

      await page.goto(`${base}/owner/settings`);
      // The existing Restaurant card is still there.
      await page.getByRole("heading", { name: "Restaurant" }).waitFor();
      const count = page.getByLabel("Tables Number");
      const seats = page.getByLabel("Seats", { exact: true });
      await page.waitForFunction(() => document.querySelector("#settings-tableCount")?.value === "0");
      await count.fill("4");
      await seats.fill("3");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByText("Saved: 4 tables, 3 seats.").waitFor();
      await page.getByText("Table 4", { exact: true }).waitFor();

      // Refresh: the saved values come back from MongoDB.
      await page.reload();
      await page.waitForFunction(() => document.querySelector("#settings-tableCount")?.value === "4");
      assert.equal(await seats.inputValue(), "3");
      assert.equal(await page.getByLabel("Seats at table 1").inputValue(), "3");

      // The Tables dashboard shows the configured tables.
      await page.goto(`${base}/owner/tables`);
      for (const n of [1, 2, 3, 4]) await page.getByText(`Table ${n}`, { exact: true }).first().waitFor();
      assert.equal(await page.getByText("3 seats").count(), 4);
      assert.deepEqual(problems, []);
    } finally {
      await context.close();
    }
  });
});
