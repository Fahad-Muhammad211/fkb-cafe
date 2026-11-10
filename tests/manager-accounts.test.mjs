// Manager accounts: the Admin creates them on /admin/employees, they sign in at /login, and they use the
// restaurant dashboard (/owner) for their assigned restaurant only, with no Admin access. Runs against the
// production build and a throwaway in-memory MongoDB (tests/harness.mjs); never the database in .env.local.
//
// Run: npm run build, then node --test tests/manager-accounts.test.mjs

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { TEST_PASSWORD, cookieFrom, createFirstAdmin, json, randomGmail, signUpCustomer, startTestEnvironment } from "./harness.mjs";

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

async function restaurant(adminCookie, name, area = "Gulberg") {
  const res = await json("POST", `${base}/api/admin/restaurants`, { cookie: adminCookie, body: { name, area } });
  assert.equal(res.status, 201, res.text);
  return res.data.restaurant.id;
}

const addManager = (adminCookie, body) => json("POST", `${base}/api/admin/managers`, { cookie: adminCookie, body });

// Signs in through /login (the customer login endpoint, which also accepts staff credentials).
async function loginAtSlashLogin(email, password = TEST_PASSWORD) {
  const res = await json("POST", `${base}/api/customer/session`, { body: { email, password } });
  return { ...res, cookie: cookieFrom(res.res, ADMIN_COOKIE) };
}

describe("creating Manager accounts", () => {
  test("the Admin creates a Manager with a hashed password, tied to one restaurant", async () => {
    const admin = await createFirstAdmin(base);
    const restId = await restaurant(admin.cookie, "Manager Kitchen");
    const email = randomGmail();
    const res = await addManager(admin.cookie, { name: "Maria Manager", email, password: TEST_PASSWORD, restaurantId: restId, role: "admin" });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.data.account.role, "manager", "the role is set by the server, not the request");
    assert.equal(res.data.account.restaurantId, restId);
    assert.equal(cookieFrom(res.res, ADMIN_COOKIE), null, "the Admin's session is not replaced");
    assert.equal(JSON.stringify(res.data).includes(TEST_PASSWORD), false, "the password is never sent back");

    const doc = await env.db.collection("admins").findOne({ email });
    assert.equal(doc.role, "manager");
    assert.equal(doc.managerAccount, true);
    assert.equal(doc.restaurantId, restId);
    assert.ok(doc.passwordHash.startsWith("pbkdf2$") && !doc.passwordHash.includes(TEST_PASSWORD));
    assert.equal(doc.password, undefined);

    // A Manager never becomes the one who runs the restaurant.
    assert.equal((await json("GET", `${base}/api/admin/restaurants/${restId}`, { cookie: admin.cookie })).data.restaurant.ownerId, null);

    // The Employees list shows the Manager with their role and restaurant.
    const staff = (await json("GET", `${base}/api/admin/employees`, { cookie: admin.cookie })).data.staff;
    const listed = staff.find((m) => m.email === email);
    assert.equal(listed.role, "manager");
    assert.equal(listed.restaurantName, "Manager Kitchen");
  });

  test("validation: restaurant, Gmail address, password rules and duplicate email", async () => {
    const admin = await createFirstAdmin(base);
    const restId = await restaurant(admin.cookie, "Validation Kitchen");
    const noRestaurant = await addManager(admin.cookie, { name: "No Rest", email: randomGmail(), password: TEST_PASSWORD });
    assert.equal(noRestaurant.status, 400);
    assert.ok(noRestaurant.data.errors.restaurantId);
    const badEmail = await addManager(admin.cookie, { name: "Bad Email", email: "not-an-email", password: TEST_PASSWORD, restaurantId: restId });
    assert.equal(badEmail.status, 400);
    assert.ok(badEmail.data.errors.email);
    const weak = await addManager(admin.cookie, { name: "Weak Pass", email: randomGmail(), password: "short", restaurantId: restId });
    assert.equal(weak.status, 400);
    assert.ok(weak.data.errors.password);
    const email = randomGmail();
    assert.equal((await addManager(admin.cookie, { name: "First", email, password: TEST_PASSWORD, restaurantId: restId })).status, 201);
    const dup = await addManager(admin.cookie, { name: "Second", email, password: TEST_PASSWORD, restaurantId: restId });
    assert.equal(dup.status, 400);
    assert.ok(dup.data.errors.email);
    assert.equal(await env.db.collection("admins").countDocuments({ role: "manager" }), 1);
  });

  test("only the Admin can create Managers", async () => {
    const admin = await createFirstAdmin(base);
    const restId = await restaurant(admin.cookie, "Guarded Kitchen");
    const body = () => ({ name: "Sneaky", email: randomGmail(), password: TEST_PASSWORD, restaurantId: restId });
    assert.equal((await addManager(null, body())).status, 401, "signed out");
    const customer = await signUpCustomer(base);
    assert.equal((await addManager(customer.cookie, body())).status, 401, "customer");
    const managerEmail = randomGmail();
    assert.equal((await addManager(admin.cookie, { ...body(), email: managerEmail })).status, 201);
    const manager = await loginAtSlashLogin(managerEmail);
    assert.equal((await addManager(manager.cookie, body())).status, 403, "a Manager cannot create Managers");
    assert.equal(await env.db.collection("admins").countDocuments({ role: "manager" }), 1);
  });
});

describe("Manager login and access", () => {
  test("signs in at /login, lands in the restaurant dashboard, and sees only their restaurant", async () => {
    const admin = await createFirstAdmin(base);
    const restA = await restaurant(admin.cookie, "Alpha Diner");
    const restB = await restaurant(admin.cookie, "Bravo Diner");
    const emailA = randomGmail();
    const emailB = randomGmail();
    assert.equal((await addManager(admin.cookie, { name: "Manager Alpha", email: emailA, password: TEST_PASSWORD, restaurantId: restA })).status, 201);
    assert.equal((await addManager(admin.cookie, { name: "Manager Bravo", email: emailB, password: TEST_PASSWORD, restaurantId: restB })).status, 201);

    assert.equal((await loginAtSlashLogin(emailA, "WrongPass999")).status, 401);
    const a = await loginAtSlashLogin(emailA);
    assert.equal(a.status, 200);
    assert.equal(a.data.redirect, "/owner");
    assert.ok(a.cookie);
    // Not signed in as a customer.
    assert.equal((await json("GET", `${base}/api/customer/profile`, { cookie: a.cookie })).data.user, null);

    // The dashboard works for their own restaurant: session, tables, menu, orders, kitchen.
    const session = await json("GET", `${base}/api/owner/session`, { cookie: a.cookie });
    assert.equal(session.status, 200);
    assert.equal(session.data.restaurant.id, restA);
    for (const path of ["/api/owner/menu", "/api/owner/orders", "/api/kitchen/orders", "/api/owner/sales"]) {
      assert.equal((await json("GET", `${base}${path}`, { cookie: a.cookie })).status, 200, path);
    }
    const table = await json("POST", `${base}/api/owner/tables`, { cookie: a.cookie, body: { seats: 4 } });
    assert.equal(table.status, 201, table.text);
    const tableId = table.data.table.id;

    // Manager B cannot see or change restaurant A's table.
    const b = await loginAtSlashLogin(emailB);
    const bTables = (await json("GET", `${base}/api/owner/tables`, { cookie: b.cookie })).data.tables;
    assert.equal(bTables.some((t) => t.id === tableId), false);
    assert.equal((await json("PATCH", `${base}/api/owner/tables/${tableId}`, { cookie: b.cookie, body: { seats: 2 } })).status, 404);
    assert.equal((await json("DELETE", `${base}/api/owner/tables/${tableId}`, { cookie: b.cookie })).status, 404);
  });

  test("a Manager gets no Admin access, even when signing in at /admin/login", async () => {
    const admin = await createFirstAdmin(base);
    const restId = await restaurant(admin.cookie, "No Admin Diner");
    const email = randomGmail();
    assert.equal((await addManager(admin.cookie, { name: "Plain Manager", email, password: TEST_PASSWORD, restaurantId: restId })).status, 201);

    const viaAdminLogin = await json("POST", `${base}/api/admin/session`, { body: { email, password: TEST_PASSWORD } });
    assert.equal(viaAdminLogin.status, 200);
    assert.equal(viaAdminLogin.data.redirect, "/owner", "sent to the restaurant dashboard, not /admin");
    const cookie = cookieFrom(viaAdminLogin.res, ADMIN_COOKIE);
    assert.equal((await json("GET", `${base}/api/admin/session`, { cookie })).data.session.role, "manager");

    for (const [method, path] of [
      ["GET", "/api/admin/employees"],
      ["GET", "/api/admin/restaurants"],
      ["GET", `/api/admin/restaurants/${restId}`],
      ["GET", "/api/admin/orders"],
      ["GET", "/api/admin/customers"],
      ["POST", "/api/admin/restaurants"],
      ["POST", "/api/admin/accounts"],
      ["PATCH", "/api/admin/employees/admin-initial"],
    ]) {
      const res = await json(method, `${base}${path}`, { cookie, body: method === "GET" ? undefined : { name: "X", area: "Y" } });
      assert.equal(res.status, 403, `${method} ${path}`);
    }
  });

  test("switching a Manager off ends their access; moving them changes their restaurant", async () => {
    const admin = await createFirstAdmin(base);
    const restA = await restaurant(admin.cookie, "First Diner");
    const restB = await restaurant(admin.cookie, "Second Diner");
    const email = randomGmail();
    const created = await addManager(admin.cookie, { name: "Moving Manager", email, password: TEST_PASSWORD, restaurantId: restA });
    const id = created.data.account.id;
    const { cookie } = await loginAtSlashLogin(email);

    assert.equal((await json("PATCH", `${base}/api/admin/employees/${id}`, { cookie: admin.cookie, body: { restaurantId: restB } })).status, 200);
    assert.equal((await json("GET", `${base}/api/owner/session`, { cookie })).data.restaurant.id, restB);
    assert.equal((await json("GET", `${base}/api/admin/restaurants/${restB}`, { cookie: admin.cookie })).data.restaurant.ownerId, null, "a Manager does not start running the restaurant");

    assert.equal((await json("PATCH", `${base}/api/admin/employees/${id}`, { cookie: admin.cookie, body: { active: false } })).status, 200);
    assert.equal((await json("GET", `${base}/api/owner/session`, { cookie })).status, 401);
    assert.equal((await loginAtSlashLogin(email)).status, 401);
  });
});

describe("Manager workflow in the browser", () => {
  let browser;
  before(async () => {
    const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
    if (!chromePath) throw new Error("Chrome was not found. Set CHROME_PATH to the Chrome executable.");
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  test("Admin adds a Manager on /admin/employees; the Manager signs in at /login and cannot open /admin", async () => {
    const admin = await createFirstAdmin(base);
    await restaurant(admin.cookie, "Browser Diner", "Model Town");
    const problems = [];

    const adminContext = await browser.newContext();
    const [name, value] = admin.cookie.split("=");
    await adminContext.addCookies([{ name, value, url: base }]);
    const page = await adminContext.newPage();
    page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
    await page.goto(`${base}/admin/employees`);
    await page.getByRole("button", { name: "Add manager" }).click();
    await page.getByRole("heading", { name: "New manager" }).waitFor();
    assert.equal(await page.locator("#manager-confirm").count(), 0, "the Manager form has Full name, Email and Password only");
    const email = randomGmail();
    await page.fill("#manager-name", "Browser Manager");
    await page.fill("#manager-email", email);
    await page.fill("#manager-password", TEST_PASSWORD);
    await page.locator("#manager-restaurantId").selectOption({ label: "Browser Diner — Model Town" });
    await page.locator("form").getByRole("button", { name: "Add manager" }).click();
    await page.getByText("Browser Manager was added as a manager.").waitFor();
    await page.getByRole("link", { name: "Browser Manager" }).first().waitFor();
    await adminContext.close();

    const managerContext = await browser.newContext();
    const m = await managerContext.newPage();
    m.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
    await m.goto(`${base}/login`);
    await m.fill("#login-email", email);
    await m.fill("#login-password", TEST_PASSWORD);
    await m.getByRole("button", { name: "Log in", exact: true }).click();
    await m.waitForURL((url) => url.pathname.startsWith("/owner"));
    await m.getByText("Browser Diner").first().waitFor();
    // The Admin dashboard sends the Manager back to the restaurant dashboard.
    await m.goto(`${base}/admin/employees`);
    await m.waitForURL((url) => url.pathname.startsWith("/owner"));
    await managerContext.close();

    assert.deepEqual(problems, []);
  });
});
