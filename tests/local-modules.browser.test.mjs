// Browser tests for the whole app. They start `next start` against a throwaway in-memory MongoDB (see
// tests/harness.mjs) and drive the app with Chrome. Every account and record is stored on the server;
// the database is emptied before each test, so each one starts from a fresh install.
//
// Run: npm run build, then npm test. Set CHROME_PATH if Chrome is not in its default Windows or
// Linux location.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { TEST_SETUP_KEY, startTestEnvironment } from "./harness.mjs";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

const PAGES = ["/", "/login", "/signup", "/checkout", "/faq", "/privacy", "/admin/login", "/admin/signup"];
// Admin and account pages send signed-out visitors to a login page. They must still render without errors.
const GUARDED = ["/account", "/account/orders", "/account/addresses", "/account/wishlist", "/account/payments", "/account/support", "/admin", "/admin/orders", "/admin/products", "/admin/customers", "/admin/analytics", "/admin/employees", "/admin/restaurants", "/admin/restaurants/rest-unknown"];

let env;
let base;
let browser;

before(async () => {
  const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chromePath) throw new Error("Chrome was not found. Set CHROME_PATH to the Chrome executable.");
  env = await startTestEnvironment();
  base = env.base;
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (env) await env.stop();
});

beforeEach(async () => {
  await env.reset();
});

// The records in one collection, read straight from the test database.
const stored = (name, filter = {}) => env.db.collection(name).find(filter).toArray();
// Chrome logs every 4xx/5xx response as a console error ("Failed to load resource"). The tests send
// refused requests on purpose (wrong password, invalid form, an Owner calling an Admin API) and assert
// those status codes directly, so these lines are not counted as page errors. Server errors (5xx) are
// still caught by the response listener in openPage.
const isHttpStatusLog = (msg) => msg.text().startsWith("Failed to load resource: the server responded with a status of");

// Opens a page in a fresh context and records uncaught errors, console errors and server errors.
async function openPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !isHttpStatusLog(msg)) problems.push(`console: ${msg.text()}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) problems.push(`server error: ${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`);
  });
  return { context, page, problems };
}

async function settle(page) {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

test("public and guarded pages render without errors", async () => {
  const { context, page, problems } = await openPage();
  try {
    for (const route of [...PAGES, ...GUARDED]) {
      problems.length = 0;
      const response = await page.goto(`${base}${route}`, { waitUntil: "load" });
      await settle(page);
      assert.ok(response && response.status() < 500, `${route} returned ${response?.status()}`);
      assert.deepEqual(problems, [], `${route} reported errors`);
    }
  } finally {
    await context.close();
  }
});

test("signed-out visitors to guarded pages are sent to a login page", async () => {
  const { context, page } = await openPage();
  try {
    await page.goto(`${base}/account/orders`, { waitUntil: "load" });
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await page.goto(`${base}/admin/products`, { waitUntil: "load" });
    await page.waitForURL(/\/admin\/login/, { timeout: 15000 });
  } finally {
    await context.close();
  }
});

test("first admin account is created in MongoDB with the setup key and opens the dashboard", async () => {
  const { context, page, problems } = await openPage();
  try {
    await page.goto(`${base}/admin/signup`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-signup-name").fill("Test Owner");
    await page.locator("#admin-signup-email").fill("owner.test1@gmail.com");
    await page.locator("#admin-signup-password").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    await settle(page);

    const admins = await stored("admins");
    assert.equal(admins.length, 1);
    assert.equal(admins[0].email, "owner.test1@gmail.com");
    assert.match(admins[0].passwordHash, /^pbkdf2\$/);
    assert.ok(!JSON.stringify(admins).includes("Passw0rd!"), "plain-text password was saved");
    // The session is an httpOnly cookie backed by MongoDB; the browser's storage holds no account data.
    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) => c.name === "meg_admin_session");
    assert.ok(sessionCookie?.httpOnly, "admin session cookie is not httpOnly");
    assert.equal((await stored("sessions", { kind: "admin" })).length, 1);
    assert.deepEqual(await page.evaluate(() => Object.keys(window.localStorage).filter((k) => !/^meg-(cart|location)-v1$/.test(k))), []);
    assert.equal(await page.evaluate(() => window.sessionStorage.length), 0);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("customer account is created, kept after reload, and shown on the account page", async () => {
  const { context, page, problems } = await openPage();
  try {
    await page.goto(`${base}/signup`, { waitUntil: "load" });
    await settle(page);
    await page.getByLabel("Full name").fill("Test Customer");
    await page.getByLabel("Email", { exact: true }).fill("customer.test1@gmail.com");
    await page.getByLabel("Phone number").fill("03001234567");
    await page.getByLabel("Password", { exact: true }).fill("Passw0rd!");
    await page.getByLabel("Confirm password").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/account/, { timeout: 20000 });
    await settle(page);

    await page.reload({ waitUntil: "load" });
    await settle(page);
    assert.match(page.url(), /\/account/, "customer was signed out after reload");
    const customers = await stored("customers");
    assert.ok(customers.some((c) => c.email === "customer.test1@gmail.com"), "customer was not saved to MongoDB");
    const cookies = await context.cookies();
    assert.ok(cookies.find((c) => c.name === "meg_customer_session")?.httpOnly, "customer session cookie is not httpOnly");
    assert.deepEqual(await page.evaluate(() => Object.keys(window.localStorage).filter((k) => !/^meg-(cart|location)-v1$/.test(k))), []);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("a menu item can be added to the cart and the cart keeps it across reloads", async () => {
  const { context, page, problems } = await openPage();
  try {
    await page.goto(`${base}/`, { waitUntil: "load" });
    await settle(page);
    // The location picker opens on a first visit; dismiss it so the menu is clickable.
    const close = page.getByRole("button", { name: "Close", exact: true }).first();
    if (await close.isVisible().catch(() => false)) await close.click();
    const addButton = page.getByRole("button", { name: /^Add .* to cart$/ }).first();
    await addButton.waitFor({ timeout: 20000 });
    await addButton.click();
    // The card opens the product dialog; confirm the add there.
    await page.getByRole("dialog").getByRole("button", { name: /Add to Cart/ }).click();
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "load" });
    await settle(page);
    const stored = await page.evaluate(() => {
      const keys = Object.keys(window.localStorage);
      return keys.filter((k) => k.includes("cart")).map((k) => window.localStorage.getItem(k) ?? "").join("");
    });
    assert.ok(stored.length > 2, "cart was not saved to localStorage");
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("owner adds other owners to restaurants, manages a team, and every owner can open every team", async () => {
  const { context, page, problems } = await openPage();
  const api = (method, url, body) =>
    page.evaluate(
      async ({ method, url, body }) => {
        const res = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, data: await res.json().catch(() => null) };
      },
      { method, url, body },
    );
  // Fills the Add owner form on the Employees page and submits it.
  const addOwner = async (name, email, restaurantLabel) => {
    await page.goto(`${base}/admin/employees`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Add owner" }).click();
    await page.locator("#owner-name").fill(name);
    await page.locator("#owner-email").fill(email);
    await page.locator("#owner-password").fill("Passw0rd!");
    await page.locator("#owner-confirm").fill("Passw0rd!");
    await page.locator("#owner-restaurantId").selectOption({ label: restaurantLabel });
    await page.getByRole("button", { name: "Add owner" }).click();
    await page.getByRole("link", { name }).first().waitFor({ timeout: 15000 });
  };
  try {
    // Owner account (the first admin).
    await page.goto(`${base}/admin/signup`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-signup-name").fill("Test Owner");
    await page.locator("#admin-signup-email").fill("owner.test2@gmail.com");
    await page.locator("#admin-signup-password").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    await settle(page);

    // The Offices section is gone: no sidebar link, no page, no data route.
    const nav = page.getByRole("navigation", { name: "Admin" }).first();
    await nav.getByRole("link", { name: "Restaurants" }).waitFor({ state: "attached" });
    assert.equal(await nav.getByRole("link", { name: "Offices" }).count(), 0, "the sidebar still links to Offices");
    assert.equal((await page.goto(`${base}/admin/offices`, { waitUntil: "load" }))?.status(), 404);
    assert.equal((await api("GET", "/api/admin/offices")).status, 404);
    // Those 404s are expected; the browser logs them as console errors.
    problems.length = 0;

    // With no restaurants, an owner cannot be added.
    await page.goto(`${base}/admin/employees`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Add owner" }).click();
    assert.equal(await page.locator("#manager-role, #owner-role").count(), 0, "a role dropdown is still shown");
    await page.getByText("Create a restaurant first on the").waitFor({ timeout: 15000 });
    assert.ok(await page.getByRole("button", { name: "Add owner" }).isDisabled());

    // Two restaurants without an owner, created on the Restaurants page's data route.
    for (const [name, area] of [["Main Branch", "Mall Road"], ["Gulberg Branch", "Gulberg III"]]) {
      assert.equal((await api("POST", "/api/admin/restaurants", { name, area, logo: "", ownerId: null })).status, 201);
    }
    const restaurants = (await api("GET", "/api/admin/restaurants")).data.restaurants;
    const mainId = restaurants.find((r) => r.name === "Main Branch").id;
    const gulbergId = restaurants.find((r) => r.name === "Gulberg Branch").id;

    // The dropdown lists every restaurant, and a restaurant must be chosen.
    await page.reload({ waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Add owner" }).click();
    const options = await page.locator("#owner-restaurantId option").allTextContents();
    assert.deepEqual(options, ["Choose a restaurant", "Gulberg Branch — Gulberg III", "Main Branch — Mall Road"]);
    await page.locator("#owner-name").fill("No Restaurant");
    await page.locator("#owner-email").fill("owner.none@gmail.com");
    await page.locator("#owner-password").fill("Passw0rd!");
    await page.locator("#owner-confirm").fill("Passw0rd!");
    await page.getByRole("button", { name: "Add owner" }).click();
    await page.getByText("Choose the restaurant this owner belongs to.").waitFor({ timeout: 15000 });
    const noRestaurant = await api("POST", "/api/admin/accounts", { name: "No Restaurant", email: "owner.none@gmail.com", password: "Passw0rd!", confirm: "Passw0rd!" });
    assert.equal(noRestaurant.status, 400);
    assert.match(noRestaurant.data.errors.restaurantId, /Choose the restaurant/);
    const badRestaurant = await api("POST", "/api/admin/accounts", { name: "No Restaurant", email: "owner.none@gmail.com", password: "Passw0rd!", confirm: "Passw0rd!", restaurantId: "rest-missing" });
    assert.equal(badRestaurant.status, 400);

    // Another owner, created from the Employees page for Main Branch. There is no role choice.
    await addOwner("Asad Owner", "owner.test2b@gmail.com", "Main Branch — Mall Road");
    await page.getByText("Main Branch", { exact: true }).first().waitFor();

    // Owner details page shows the restaurant.
    await page.getByRole("link", { name: "Asad Owner" }).first().click();
    await page.waitForURL(/\/admin\/employees\/admin-/, { timeout: 20000 });
    await settle(page);
    const asadId = new URL(page.url()).pathname.split("/").pop();
    await page.getByRole("heading", { name: "Asad Owner" }).waitFor();
    const restaurantPanel = page.locator('section[aria-labelledby="restaurant-heading"]');
    await restaurantPanel.getByText("Main Branch", { exact: true }).waitFor({ timeout: 15000 });
    await restaurantPanel.getByText("Mall Road", { exact: true }).waitFor();
    await page.getByText("Restaurant: Main Branch.").waitFor();
    await page.getByText("Staff under this owner (0)").waitFor();

    // Saved with the account, and linked: Main Branch had no owner, so Asad now runs it.
    const [storedAsad] = await stored("admins", { _id: asadId });
    assert.equal(storedAsad.restaurantId, mainId);
    const mainAfter = (await api("GET", "/api/admin/restaurants")).data.restaurants.find((r) => r.id === mainId);
    assert.equal(mainAfter.ownerName, "Asad Owner");

    // Staff under this owner. There is no job title field.
    await page.getByRole("button", { name: "Add staff" }).click();
    assert.equal(await page.locator("#staff-job-role").count(), 0, "a job title field is still shown");
    await page.locator("#staff-name").fill("Ali Cashier");
    await page.getByRole("button", { name: "Add to team" }).click();
    // Staff names are looked up inside the team section; the activity history also shows the name.
    const team = () => page.locator('section[aria-labelledby="team-heading"]');
    await team().getByText("Ali Cashier", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText("Staff added", { exact: true }).waitFor();

    // Asad runs Main Branch, so he cannot be moved to another restaurant.
    await page.locator("#reassign-restaurant").selectOption({ label: "Gulberg Branch — Gulberg III" });
    await page.getByRole("button", { name: "Save restaurant" }).click();
    await page.getByText("Asad Owner runs Main Branch, so they belong to that restaurant.").waitFor({ timeout: 15000 });

    // Main Branch's page lists Asad and his staff.
    await page.goto(`${base}/admin/restaurants/${mainId}`, { waitUntil: "load" });
    await settle(page);
    await page.getByText("Owners of this restaurant:").waitFor({ timeout: 15000 });
    await page.getByRole("link", { name: "Asad Owner" }).waitFor();
    await page.getByRole("region", { name: "Staff list" }).getByText("Ali Cashier").waitFor();

    // A second added owner in Gulberg, and a third who joins Main Branch, which already has an owner.
    await addOwner("Bilal Owner", "owner.test3@gmail.com", "Gulberg Branch — Gulberg III");
    await addOwner("Cara Owner", "owner.test4@gmail.com", "Main Branch — Mall Road");
    const staffList = (await api("GET", "/api/admin/employees")).data.staff;
    const cara = staffList.find((m) => m.name === "Cara Owner");
    assert.equal(cara.restaurantId, mainId);
    assert.equal((await api("GET", "/api/admin/restaurants")).data.restaurants.find((r) => r.id === mainId).ownerName, "Asad Owner", "the restaurant's owner changed");

    // Cara does not run a restaurant, so she can move to Gulberg.
    await page.goto(`${base}/admin/employees/${cara.id}`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#reassign-restaurant").selectOption({ label: "Gulberg Branch — Gulberg III" });
    await page.getByRole("button", { name: "Save restaurant" }).click();
    await page.getByText("Restaurant was saved.").waitFor({ timeout: 15000 });
    await page.getByText("Restaurant changed", { exact: true }).waitFor();
    await page.getByText("Main Branch → Gulberg Branch").waitFor();
    const gulbergDetail = await api("GET", `/api/admin/restaurants/${gulbergId}`);
    assert.deepEqual(gulbergDetail.data.owners.map((o) => o.name).sort(), ["Bilal Owner", "Cara Owner"]);
    const mainDetail = await api("GET", `/api/admin/restaurants/${mainId}`);
    assert.deepEqual(mainDetail.data.owners.map((o) => o.name), ["Asad Owner"]);

    await page.goto(`${base}/admin/employees`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("link", { name: "Bilal Owner" }).first().click();
    await page.waitForURL(/\/admin\/employees\/admin-/, { timeout: 20000 });
    await settle(page);
    const bilalId = new URL(page.url()).pathname.split("/").pop();

    // Move Ali from Asad to Bilal.
    await page.goto(`${base}/admin/employees/${asadId}`, { waitUntil: "load" });
    await settle(page);
    await page.locator('select[id^="move-"]').first().selectOption({ label: "Bilal Owner" });
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await page.getByText("Ali Cashier was moved to Bilal Owner.").waitFor({ timeout: 15000 });
    await team().getByText("Ali Cashier", { exact: true }).waitFor({ state: "detached", timeout: 15000 });
    await page.goto(`${base}/admin/employees/${bilalId}`, { waitUntil: "load" });
    await settle(page);
    await team().getByText("Ali Cashier", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText("Staff moved in", { exact: true }).waitFor();

    // Sign in as Asad (same browser): an Owner is sent to the Owner dashboard and every Admin API refuses them.
    await page.evaluate(() => fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" }));
    await page.goto(`${base}/admin/login`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-login-email").fill("owner.test2b@gmail.com");
    await page.locator("#admin-login-password").fill("Passw0rd!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/owner/, { timeout: 20000 });
    const access = await page.evaluate(
      async ({ own, other }) => {
        const status = async (url) => (await fetch(url, { credentials: "same-origin" })).status;
        return {
          own: await status(`/api/admin/owners/${own}`),
          other: await status(`/api/admin/owners/${other}`),
          employees: await status("/api/admin/employees"),
          restaurants: await status("/api/admin/restaurants"),
          oldRoute: await status(`/api/admin/managers/${own}`),
        };
      },
      { own: asadId, other: bilalId },
    );
    assert.deepEqual(access, { own: 403, other: 403, employees: 403, restaurants: 403, oldRoute: 404 });
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("owner manages restaurants: cards, separate detail data, records and live rider tracking", async () => {
  const context = await browser.newContext({ permissions: ["geolocation"], geolocation: { latitude: 31.5204, longitude: 74.3587 } });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    // The OpenStreetMap embed is a third-party frame; its own console output is not the app's.
    if (msg.type() === "error" && !msg.location().url.includes("openstreetmap") && !isHttpStatusLog(msg)) problems.push(`console: ${msg.text()}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 500) problems.push(`server error: ${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`);
  });
  const api = (method, url, body) =>
    page.evaluate(
      async ({ method, url, body }) => {
        const res = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, data: await res.json().catch(() => null) };
      },
      { method, url, body },
    );

  try {
    await page.goto(`${base}/admin/signup`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-signup-name").fill("Test Owner");
    await page.locator("#admin-signup-email").fill("owner.rest@gmail.com");
    await page.locator("#admin-signup-password").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    await settle(page);

    // The sidebar links to Restaurants.
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Restaurants" }).first().waitFor({ state: "attached" });

    // Empty state.
    await page.goto(`${base}/admin/restaurants`, { waitUntil: "load" });
    await settle(page);
    await page.getByText("No restaurants yet").waitFor({ timeout: 15000 });

    // Restaurant B through the API. Creating a restaurant never assigns anyone: an ownerId sent anyway is ignored.
    const restB = await api("POST", "/api/admin/restaurants", { name: "DHA Diner", area: "DHA Phase 5", logo: "", ownerId: "admin-initial" });
    assert.equal(restB.status, 201);
    assert.equal(restB.data.restaurant.ownerId, null, "restaurant creation must not assign an owner");
    const restBId = restB.data.restaurant.id;

    // Two more owners, added for restaurant B, each with one staff member. The first one added to a
    // restaurant without an owner runs it; the second only belongs to it.
    const makeOwner = async (name, email) => {
      const r = await api("POST", "/api/admin/accounts", { name, email, password: "Passw0rd!", confirm: "Passw0rd!", restaurantId: restBId });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      assert.equal(r.data.account.role, "owner");
      assert.equal(r.data.account.restaurantId, restBId);
      assert.equal(r.data.account.restaurantName, "DHA Diner");
      return r.data.account.id;
    };
    const ownerB = await makeOwner("Bilal Owner", "owner.restb@gmail.com");
    const ownerA = await makeOwner("Ayesha Owner", "owner.resta@gmail.com");
    assert.equal((await api("POST", `/api/admin/owners/${ownerA}/staff`, { name: "Kamran Cook", phone: "03001112233" })).status, 201);
    assert.equal((await api("POST", `/api/admin/owners/${ownerB}/staff`, { name: "Zara Cashier" })).status, 201);
    assert.equal((await api("GET", `/api/admin/restaurants/${restBId}`)).data.restaurant.ownerId, ownerB);

    // Create restaurant A from the form. The form has no owner field, and the new restaurant has no owner.
    await page.reload({ waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Add restaurant" }).click();
    await page.locator("#restaurant-name").fill("Gulberg Grill");
    assert.equal(await page.locator("#restaurant-owner").count(), 0, "the form must not have an owner field");
    assert.equal(await page.getByText("Restaurant owner").count(), 0);
    await page.locator("#restaurant-area").fill("Gulberg, Lahore");
    await page.getByRole("button", { name: "Add restaurant" }).click();
    await page.getByText("Gulberg Grill was added.").waitFor({ timeout: 15000 });
    const created = (await api("GET", "/api/admin/restaurants")).data.restaurants.find((r) => r.name === "Gulberg Grill");
    assert.equal(created.ownerId, null, "restaurant creation must not assign an owner");

    // Owners are assigned on the Employees side: moving Ayesha to restaurant A makes her run it.
    assert.equal((await api("PATCH", `/api/admin/employees/${ownerA}`, { restaurantId: created.id })).status, 200);
    assert.equal((await api("GET", `/api/admin/restaurants/${created.id}`)).data.restaurant.ownerId, ownerA);
    const owners = (await api("GET", "/api/admin/employees")).data.staff;
    assert.equal(owners.find((m) => m.id === ownerA).restaurantName, "Gulberg Grill");
    assert.equal(owners.find((m) => m.id === ownerB).restaurantName, "DHA Diner");

    await page.reload({ waitUntil: "load" });
    await settle(page);
    const cards = page.locator('a[href^="/admin/restaurants/rest-"]');
    await cards.first().waitFor({ timeout: 15000 });
    assert.equal(await cards.count(), 2);
    const cardA = cards.filter({ hasText: "Gulberg Grill" });
    await cardA.getByText("Gulberg, Lahore").waitFor();
    // The cards show the restaurant only; owners are not shown on this page.
    assert.equal(await cardA.getByText("Ayesha Owner").count(), 0);

    const list = await api("GET", "/api/admin/restaurants");
    const restA = list.data.restaurants.find((r) => r.name === "Gulberg Grill");

    // One delivery order per restaurant, placed through the real order endpoint.
    const catalog = await api("GET", "/api/catalog");
    const placeOrder = async (restaurantId, name) => {
      for (const item of catalog.data.products ?? catalog.data.items ?? []) {
        const r = await api("POST", "/api/orders", {
          clientOrderId: `test${Math.random().toString(36).slice(2)}${Date.now()}`,
          fulfilment: "delivery",
          restaurantId,
          customer: { name, phone: "03001234567", address: "House 12, Street 4, Model Town", notes: "" },
          lines: [{ id: `line-${item.id}`, itemId: item.id, name: item.name, unitPrice: item.price, qty: 1, options: [], instructions: "" }],
        });
        if (r.status === 201) return r.data.order;
      }
      throw new Error("Could not place a test order with any catalog item.");
    };
    const orderA = await placeOrder(restA.id, "Customer Alpha");
    const orderB = await placeOrder(restBId, "Customer Bravo");
    assert.equal((await api("POST", `/api/orders/${orderA.id}/confirm`)).status, 200);

    // Detail page for A shows only A's data.
    await cardA.click();
    await page.waitForURL(new RegExp(`/admin/restaurants/${restA.id}$`), { timeout: 20000 });
    await settle(page);
    await page.getByRole("heading", { name: "Gulberg Grill" }).waitFor({ timeout: 15000 });
    const orders = page.getByRole("region", { name: "Orders" });
    await orders.getByText(orderA.id).waitFor();
    await orders.getByText("Confirmed", { exact: true }).waitFor();
    assert.equal(await orders.getByText(orderB.id).count(), 0, "restaurant A shows restaurant B's order");
    const staff = page.getByRole("region", { name: "Staff list" });
    await staff.getByText("Kamran Cook").waitFor();
    assert.equal(await staff.getByText("Zara Cashier").count(), 0, "restaurant A shows restaurant B's staff");

    // Grocery.
    await page.locator("#grocery-name").fill("Basmati Rice");
    await page.locator("#grocery-unit").fill("kg");
    await page.locator("#grocery-quantity").fill("50");
    await page.locator("#grocery-available").fill("60");
    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByText("Enter the available stock, between 0 and the quantity.").waitFor({ timeout: 15000 });
    await page.locator("#grocery-available").fill("40");
    await page.getByRole("button", { name: "Add item" }).click();
    await page.getByText("Grocery item added.").waitFor({ timeout: 15000 });
    await page.getByLabel("Available stock of Basmati Rice").fill("35");
    await page.getByRole("region", { name: "Grocery list" }).getByRole("button", { name: "Save" }).click();
    await page.getByText("Basmati Rice updated.").waitFor({ timeout: 15000 });

    // Purchase.
    await page.locator("#purchase-supplier").fill("Metro Wholesale");
    await page.locator("#purchase-description").fill("Rice and oil");
    await page.locator("#purchase-amount").fill("18500");
    await page.getByRole("button", { name: "Record purchase" }).click();
    await page.getByText("Purchase recorded.").waitFor({ timeout: 15000 });
    await page.getByRole("region", { name: "Purchase list" }).getByText("PKR 18,500").waitFor();

    // Attendance.
    await page.getByLabel("Status of Kamran Cook").selectOption("present");
    await page.getByLabel("Check-in of Kamran Cook").fill("09:00");
    await page.getByLabel("Check-out of Kamran Cook").fill("17:30");
    await page.getByRole("region", { name: "Attendance" }).getByRole("button", { name: "Save" }).click();
    await page.getByText("Kamran Cook's attendance saved.").waitFor({ timeout: 15000 });
    await page.getByText("Saved: present").waitFor();
    // Restaurant B's staff cannot be marked on A.
    const zaraId = (await api("GET", `/api/admin/owners/${ownerB}`)).data.staff[0].id;
    const crossAttendance = await api("PUT", `/api/admin/restaurants/${restA.id}/attendance`, { staffId: zaraId, date: "2026-11-10", status: "present", checkIn: "", checkOut: "" });
    assert.equal(crossAttendance.status, 400);

    // Rider: add, assign to the order, go online and share a live location.
    await page.locator("#rider-name").fill("Rashid Rider");
    await page.locator("#rider-phone").fill("03214567890");
    await page.getByRole("button", { name: "Add rider" }).click();
    await page.getByText("Rider added.").waitFor({ timeout: 15000 });
    await page.getByLabel(`Rider for order ${orderA.id}`).selectOption({ label: "Rashid Rider" });
    await page.getByText("Rider updated.").waitFor({ timeout: 15000 });
    await page.getByLabel("Status of Rashid Rider").selectOption("online");
    await page.getByText("Rashid Rider is now online.").waitFor({ timeout: 15000 });
    const riders = page.getByRole("region", { name: "Rider tracking" });
    await riders.getByText(orderA.id).waitFor();
    await riders.getByRole("button", { name: "Share this device's location" }).click();
    await riders.getByText("31.52040, 74.35870").waitFor({ timeout: 20000 });
    await page.locator('iframe[title="Map of Rashid Rider"]').waitFor();

    // The location moves; the page picks it up without a reload.
    await context.setGeolocation({ latitude: 31.53, longitude: 74.36 });
    await riders.getByText("31.53000, 74.36000").waitFor({ timeout: 20000 });
    await riders.getByRole("button", { name: "Stop sharing" }).click();

    // A's rider cannot be put on B's order.
    const riderId = (await api("GET", `/api/admin/restaurants/${restA.id}`)).data.riders[0].id;
    assert.equal((await api("PATCH", `/api/admin/orders/${orderB.id}/rider`, { riderId })).status, 400);

    // Restaurant B sees none of A's records.
    await page.goto(`${base}/admin/restaurants/${restBId}`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("heading", { name: "DHA Diner" }).waitFor({ timeout: 15000 });
    await page.getByRole("region", { name: "Orders" }).getByText(orderB.id).waitFor();
    for (const leaked of [orderA.id, "Kamran Cook", "Basmati Rice", "Metro Wholesale", "Rashid Rider"]) {
      assert.equal(await page.getByText(leaked).count(), 0, `restaurant B shows ${leaked}`);
    }
    await page.getByRole("region", { name: "Staff list" }).getByText("Zara Cashier").waitFor();

    // An unknown restaurant shows an error, not another restaurant's data.
    await page.goto(`${base}/admin/restaurants/rest-missing`, { waitUntil: "load" });
    await page.getByText("Restaurant not found.").waitFor({ timeout: 15000 });

    // An Owner cannot open the Admin restaurant pages or data; they are sent to the Owner dashboard.
    await api("DELETE", "/api/admin/session");
    await page.goto(`${base}/admin/login`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-login-email").fill("owner.resta@gmail.com");
    await page.locator("#admin-login-password").fill("Passw0rd!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/owner/, { timeout: 20000 });
    assert.equal((await api("GET", `/api/admin/restaurants/${restA.id}`)).status, 403);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("accounts saved with the old manager role are read as owners and keep their data", async () => {
  const { context, page, problems } = await openPage();
  const api = (method, url, body) =>
    page.evaluate(
      async ({ method, url, body }) => {
        const res = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, data: await res.json().catch(() => null) };
      },
      { method, url, body },
    );
  try {
    await page.goto(`${base}/admin/signup`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-signup-name").fill("Test Owner");
    await page.locator("#admin-signup-email").fill("owner.migrate@gmail.com");
    await page.locator("#admin-signup-password").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    await settle(page);

    // An account that runs a restaurant and has a team member, then stored the way the old manager role
    // was saved: with an office and without the restaurant on the account record.
    const restaurant = await api("POST", "/api/admin/restaurants", { name: "Legacy Kitchen", area: "Model Town", logo: "", ownerId: null });
    assert.equal(restaurant.status, 201);
    const created = await api("POST", "/api/admin/accounts", { name: "Legacy Person", email: "legacy.person@gmail.com", password: "Passw0rd!", confirm: "Passw0rd!", restaurantId: restaurant.data.restaurant.id });
    assert.equal(created.status, 201);
    const legacyId = created.data.account.id;
    assert.equal((await api("POST", `/api/admin/owners/${legacyId}/staff`, { name: "Kept Staff" })).status, 201);
    await env.db.collection("admins").updateOne(
      { _id: legacyId },
      { $set: { role: "manager", responsibilities: ["orders"], officeId: "office-legacy", officeName: "Legacy Office" }, $unset: { restaurantId: "" } },
    );

    // The stored record keeps its name, email, password, old office fields and team; it is read as an owner.
    await page.reload({ waitUntil: "load" });
    await settle(page);
    const [legacyDoc] = await stored("admins", { _id: legacyId });
    assert.equal(legacyDoc.name, "Legacy Person");
    assert.equal(legacyDoc.email, "legacy.person@gmail.com");
    assert.equal(legacyDoc.officeName, "Legacy Office");
    assert.equal((await api("GET", "/api/admin/employees")).data.staff.find((m) => m.id === legacyId).role, "owner");
    // The owner is shown with the restaurant they run.
    const legacyOwner = (await api("GET", "/api/admin/employees")).data.staff.find((m) => m.id === legacyId);
    assert.equal(legacyOwner.restaurantName, "Legacy Kitchen");
    // The Admin (the setup account) never chose a restaurant.
    const setupAccount = (await api("GET", "/api/admin/employees")).data.staff.find((m) => m.id === "admin-initial");
    assert.equal(setupAccount.restaurantId, null);
    assert.equal(setupAccount.role, "admin");
    // The migrated owner keeps their team (checked by the Admin).
    const details = await api("GET", `/api/admin/owners/${legacyId}`);
    assert.equal(details.status, 200);
    assert.equal(details.data.owner.role, "owner");
    assert.deepEqual(details.data.staff.map((s) => s.name), ["Kept Staff"]);

    // The migrated account signs in as an Owner: it is sent to /owner and has no Admin access.
    await api("DELETE", "/api/admin/session");
    await page.goto(`${base}/admin/login`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-login-email").fill("legacy.person@gmail.com");
    await page.locator("#admin-login-password").fill("Passw0rd!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/owner/, { timeout: 20000 });
    assert.equal((await api("GET", `/api/admin/owners/${legacyId}`)).status, 403);
    assert.equal((await api("GET", "/api/admin/employees")).status, 403, "a migrated account must not have Admin access");
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("an owner created by another owner can log in at /login with their saved credentials", async () => {
  const { context, page, problems } = await openPage();
  const api = (method, url, body) =>
    page.evaluate(
      async ({ method, url, body }) => {
        const res = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, data: await res.json().catch(() => null) };
      },
      { method, url, body },
    );
  try {
    // First owner signs up, then adds a second owner from the Employees page.
    await page.goto(`${base}/admin/signup`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-signup-name").fill("Test Owner");
    await page.locator("#admin-signup-email").fill("owner.login1@gmail.com");
    await page.locator("#admin-signup-password").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    await settle(page);
    assert.equal((await api("POST", "/api/admin/restaurants", { name: "Login Kitchen", area: "Johar Town", logo: "", ownerId: null })).status, 201);

    await page.goto(`${base}/admin/employees`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Add owner" }).click();
    await page.locator("#owner-name").fill("Sana Owner");
    await page.locator("#owner-email").fill("sana.owner@gmail.com");
    await page.locator("#owner-password").fill("SanaPass123");
    await page.locator("#owner-confirm").fill("SanaPass123");
    await page.locator("#owner-restaurantId").selectOption({ label: "Login Kitchen — Johar Town" });
    await page.getByRole("button", { name: "Add owner" }).click();
    await page.getByRole("link", { name: "Sana Owner" }).first().waitFor({ timeout: 15000 });

    // Sign out, then use the main /login page.
    await api("DELETE", "/api/admin/session");
    await page.goto(`${base}/login`, { waitUntil: "load" });
    await settle(page);

    // A wrong password is still refused.
    await page.locator("#login-email").fill("sana.owner@gmail.com");
    await page.locator("#login-password").fill("WrongPass999");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.getByText("Email or password is incorrect.").waitFor({ timeout: 15000 });
    assert.match(page.url(), /\/login$/);

    // The saved credentials open the Owner dashboard (not the Admin dashboard).
    await page.locator("#login-password").fill("SanaPass123");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL(/\/owner/, { timeout: 20000 });
    await settle(page);
    assert.equal((await api("GET", "/api/owner/session")).status, 200, "the owner was not signed in to the Owner dashboard");
    assert.equal((await api("GET", "/api/admin/employees")).status, 403, "an Owner must not reach Admin APIs");
    // Not signed in as a customer.
    assert.equal((await api("GET", "/api/customer/profile")).data.user, null);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("an owner account is deleted permanently, cannot log in again, and business records are kept", async () => {
  const { context, page, problems } = await openPage();
  const api = (method, url, body) =>
    page.evaluate(
      async ({ method, url, body }) => {
        const res = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: res.status, data: await res.json().catch(() => null) };
      },
      { method, url, body },
    );
  const store = (name) => stored(name);
  const BUSINESS = ["orders", "payments", "grocery_items", "purchases", "attendance_records", "riders", "customers", "products", "categories"];
  try {
    // Signed-out callers cannot delete anything.
    await page.goto(`${base}/`, { waitUntil: "load" });
    assert.equal((await api("DELETE", "/api/admin/employees/admin-initial")).status, 401);

    await page.goto(`${base}/admin/signup`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-signup-name").fill("Main Admin");
    await page.locator("#admin-signup-email").fill("main.admin1@gmail.com");
    await page.locator("#admin-signup-password").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    await settle(page);
    const adminId = "admin-initial";

    // A restaurant run by a second owner, with business records of its own.
    const rest = await api("POST", "/api/admin/restaurants", { name: "Delete Test Diner", area: "Gulberg", logo: "", ownerId: null });
    assert.equal(rest.status, 201);
    const restId = rest.data.restaurant.id;
    const created = await api("POST", "/api/admin/accounts", { name: "Doomed Owner", email: "doomed.owner@gmail.com", password: "DoomPass123", confirm: "DoomPass123", restaurantId: restId });
    assert.equal(created.status, 201);
    const doomedId = created.data.account.id;
    assert.equal((await api("GET", `/api/admin/restaurants/${restId}`)).data.restaurant.ownerId, doomedId);
    // The doomed owner signs in elsewhere; that session must stop working when the account is deleted.
    const doomedLogin = await fetch(`${base}/api/admin/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "doomed.owner@gmail.com", password: "DoomPass123" }),
    });
    assert.equal(doomedLogin.status, 200);
    const doomedCookie = doomedLogin.headers.getSetCookie().find((c) => c.startsWith("meg_admin_session=")).split(";")[0];

    assert.equal((await api("POST", `/api/admin/restaurants/${restId}/grocery`, { name: "Flour", unit: "kg", quantity: 20, available: 15 })).status, 201);
    assert.equal((await api("POST", `/api/admin/restaurants/${restId}/purchases`, { supplier: "Metro", description: "Flour", amount: 5000, date: "2026-11-10" })).status, 201);
    assert.equal((await api("POST", `/api/admin/restaurants/${restId}/riders`, { name: "Rider One", phone: "03001234567" })).status, 201);
    const catalog = await api("GET", "/api/catalog");
    let order = null;
    for (const item of catalog.data.products ?? []) {
      const r = await api("POST", "/api/orders", {
        clientOrderId: `del${Date.now()}${Math.random().toString(36).slice(2)}`,
        fulfilment: "delivery",
        restaurantId: restId,
        customer: { name: "Order Keeper", phone: "03001234567", address: "House 1, Street 2, Gulberg", notes: "" },
        lines: [{ id: `line-${item.id}`, itemId: item.id, name: item.name, unitPrice: item.price, qty: 1, options: [], instructions: "" }],
      });
      if (r.status === 201) {
        order = r.data.order;
        break;
      }
    }
    assert.ok(order, "could not place a test order");

    // Owners with staff under them cannot be deleted until the staff are moved.
    const staff = await api("POST", `/api/admin/owners/${doomedId}/staff`, { name: "Team Member" });
    assert.equal(staff.status, 201);
    const blocked = await api("DELETE", `/api/admin/employees/${doomedId}`);
    assert.equal(blocked.status, 409);
    assert.match(blocked.data.error, /Move them to another owner/);

    // On the Employees list every other account has a Delete button; your own account has none.
    await page.goto(`${base}/admin/employees`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Delete Doomed Owner" }).waitFor({ timeout: 15000 });
    assert.equal(await page.getByRole("button", { name: "Delete Main Admin" }).count(), 0, "own account can be deleted");
    // The dialog explains why an owner with staff cannot be deleted yet, and does not offer the delete.
    await page.getByRole("button", { name: "Delete Doomed Owner" }).click();
    const listDialog = page.getByRole("alertdialog", { name: "Delete Doomed Owner permanently?" });
    await listDialog.getByText("1 staff member works under this owner. Move them to another owner first.").waitFor({ timeout: 15000 });
    assert.ok(await listDialog.getByRole("button", { name: "Delete permanently" }).isDisabled());
    await page.keyboard.press("Escape");
    await listDialog.waitFor({ state: "detached" });
    assert.equal((await api("PATCH", `/api/admin/staff/${staff.data.staff.id}`, { ownerId: adminId })).status, 200);

    // Nobody can delete their own account, and unknown accounts are 404.
    assert.equal((await api("DELETE", `/api/admin/employees/${adminId}`)).status, 400);
    assert.equal((await api("DELETE", "/api/admin/employees/admin-missing")).status, 404);

    const before = {};
    for (const name of BUSINESS) before[name] = await store(name);
    assert.equal(before.orders.length, 1);

    // Delete from the details page, through the confirmation dialog.
    await page.goto(`${base}/admin/employees/${doomedId}`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("heading", { name: "Doomed Owner" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete Doomed Owner permanently?" });
    await dialog.waitFor();
    // Cancel keeps the account.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await dialog.waitFor({ state: "detached" });
    assert.ok((await store("admins")).some((a) => a._id === doomedId));
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.getByRole("button", { name: "Delete permanently" }).click();
    await page.waitForURL(/\/admin\/employees$/, { timeout: 20000 });
    await page.getByRole("link", { name: "Main Admin" }).first().waitFor({ timeout: 15000 });
    assert.equal(await page.getByRole("link", { name: "Doomed Owner" }).count(), 0, "deleted owner still listed");

    // The account and its credentials are gone; the restaurant is kept with no owner.
    const admins = await store("admins");
    assert.ok(!admins.some((a) => a._id === doomedId || a.email === "doomed.owner@gmail.com"), "account was not deleted");
    const restaurants = await store("restaurants");
    const kept = restaurants.find((r) => r._id === restId);
    assert.ok(kept, "restaurant was deleted");
    assert.equal(kept.managerId, null);
    for (const name of BUSINESS) assert.deepEqual(await store(name), before[name], `${name} changed`);
    assert.ok((await store("staff_members")).some((s) => s._id === staff.data.staff.id), "staff record was removed");
    assert.equal((await api("GET", `/api/admin/owners/${doomedId}`)).status, 404);
    assert.equal((await api("GET", `/api/admin/employees`)).data.staff.length, 1);

    // The restaurant can be given a new owner.
    const replacement = await api("POST", "/api/admin/accounts", { name: "New Owner", email: "new.owner1@gmail.com", password: "NewPass1234", confirm: "NewPass1234", restaurantId: restId });
    assert.equal(replacement.status, 201);
    assert.equal((await api("GET", `/api/admin/restaurants/${restId}`)).data.restaurant.ownerId, replacement.data.account.id);

    // Delete from the Employees list: the list updates at once, without a reload.
    await page.goto(`${base}/admin/employees`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Delete New Owner" }).click();
    const newOwnerDialog = page.getByRole("alertdialog", { name: "Delete New Owner permanently?" });
    await newOwnerDialog.getByText("Delete Test Diner is kept. If this owner runs it, you can add a new owner for it.").waitFor({ timeout: 15000 });
    await newOwnerDialog.getByRole("button", { name: "Delete permanently" }).click();
    await page.getByText("New Owner was deleted. Delete Test Diner now has no owner; add a new owner for it.").waitFor({ timeout: 15000 });
    await page.getByRole("link", { name: "New Owner" }).waitFor({ state: "detached", timeout: 15000 });
    assert.match(page.url(), /\/admin\/employees$/);
    assert.ok(!(await store("admins")).some((a) => a._id === replacement.data.account.id));
    assert.equal((await store("restaurants")).find((r) => r._id === restId).managerId, null);
    for (const name of BUSINESS) assert.deepEqual(await store(name), before[name], `${name} changed after the list delete`);

    // The deleted owners' own activity history is gone; the "Owner deleted" entries on the acting owner's history stay.
    const activity = await store("manager_activity");
    assert.ok(!activity.some((a) => a.managerId === doomedId || a.managerId === replacement.data.account.id), "a deleted owner's activity was kept");
    assert.equal(activity.filter((a) => a.managerId === adminId && a.action === "Owner deleted").length, 2);

    // The deleted owner's open session no longer works, and its server record is gone.
    const afterDelete = await fetch(`${base}/api/admin/employees`, { headers: { cookie: doomedCookie } });
    assert.equal(afterDelete.status, 401);
    assert.equal((await stored("sessions", { accountId: doomedId })).length, 0);

    // The old credentials are refused at both login endpoints and on the /login page.
    assert.equal((await api("POST", "/api/admin/session", { email: "doomed.owner@gmail.com", password: "DoomPass123" })).status, 401);
    assert.equal((await api("POST", "/api/customer/session", { email: "doomed.owner@gmail.com", password: "DoomPass123" })).status, 401);
    await page.goto(`${base}/login`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#login-email").fill("doomed.owner@gmail.com");
    await page.locator("#login-password").fill("DoomPass123");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.getByText("Email or password is incorrect.").waitFor({ timeout: 15000 });
    assert.match(page.url(), /\/login$/);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("customers still log in at /login", async () => {
  const { context, page, problems } = await openPage();
  try {
    await page.goto(`${base}/signup`, { waitUntil: "load" });
    await settle(page);
    await page.getByLabel("Full name").fill("Login Customer");
    await page.getByLabel("Email", { exact: true }).fill("customer.login2@gmail.com");
    await page.getByLabel("Phone number").fill("03001234567");
    await page.getByLabel("Password", { exact: true }).fill("Passw0rd!");
    await page.getByLabel("Confirm password").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/account/, { timeout: 20000 });
    await page.evaluate(() => fetch("/api/customer/session", { method: "DELETE", credentials: "same-origin" }));

    await page.goto(`${base}/login`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#login-email").fill("customer.login2@gmail.com");
    await page.locator("#login-password").fill("Passw0rd!");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await page.waitForURL(/\/account/, { timeout: 20000 });
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("every password field has a show/hide password button", async () => {
  const { context, page, problems } = await openPage();
  // Checks each password field on the page: hidden by default, shown after one click, hidden again after another.
  const checkToggles = async (where, expectedCount) => {
    const fields = page.locator('input[type="password"]');
    await fields.first().waitFor({ timeout: 15000 });
    const ids = await fields.evaluateAll((els) => els.map((el) => el.id));
    assert.equal(ids.length, expectedCount, `${where}: expected ${expectedCount} password fields`);
    for (const id of ids) {
      const input = page.locator(`#${id}`);
      const toggle = page.locator(`button[aria-controls="${id}"]`);
      assert.equal(await toggle.getAttribute("aria-label"), "Show password", `${where} #${id}: no show button`);
      await toggle.click();
      assert.equal(await input.getAttribute("type"), "text", `${where} #${id}: password not shown`);
      assert.equal(await toggle.getAttribute("aria-label"), "Hide password");
      await toggle.click();
      assert.equal(await input.getAttribute("type"), "password", `${where} #${id}: password not hidden again`);
    }
  };
  try {
    // /admin/login opens on Login (one password field); /admin/signup opens on Sign Up (one password field).
    for (const [route, count] of [["/login", 1], ["/signup", 2], ["/admin/login", 1], ["/admin/signup", 1]]) {
      await page.goto(`${base}${route}`, { waitUntil: "load" });
      await settle(page);
      await checkToggles(route, count);
    }

    // Owner's "Add owner" form.
    await page.locator("#admin-signup-name").fill("Test Owner");
    await page.locator("#admin-signup-email").fill("owner.eye@gmail.com");
    await page.locator("#admin-signup-password").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    await page.goto(`${base}/admin/employees`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Add owner" }).click();
    await checkToggles("/admin/employees", 2);

    // Customer "Change password" form.
    await page.goto(`${base}/signup`, { waitUntil: "load" });
    await settle(page);
    await page.getByLabel("Full name").fill("Eye Customer");
    await page.getByLabel("Email", { exact: true }).fill("customer.eye@gmail.com");
    await page.getByLabel("Phone number").fill("03001234567");
    await page.getByLabel("Password", { exact: true }).fill("Passw0rd!");
    await page.getByLabel("Confirm password").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/account/, { timeout: 20000 });
    await page.goto(`${base}/account/profile`, { waitUntil: "load" });
    await settle(page);
    await checkToggles("/account/profile", 3);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("old browser data is removed on load and cannot sign anyone in", async () => {
  const { context, page, problems } = await openPage();
  try {
    // A browser that used the old localStorage build: accounts, sessions, business records and caches,
    // plus the two personal preferences that stay (cart and location).
    await page.goto(`${base}/faq`, { waitUntil: "load" });
    await page.evaluate(() => {
      const admin = { _id: "admin-initial", name: "Old Admin", email: "old.admin1@gmail.com", passwordHash: "pbkdf2$00$00", role: "owner", active: true };
      localStorage.setItem("meg-local:admins", JSON.stringify([admin]));
      localStorage.setItem("meg-local:customers", JSON.stringify([{ _id: "user-old", email: "old@example.com" }]));
      localStorage.setItem("meg-local:orders", JSON.stringify([{ _id: "MEG-1" }]));
      localStorage.setItem("meg-local:restaurants", JSON.stringify([{ _id: "rest-old", name: "Old Diner" }]));
      localStorage.setItem("meg.session.admin", JSON.stringify({ id: "admin-initial", exp: Date.now() + 3600000 }));
      localStorage.setItem("meg.session.customer", JSON.stringify({ id: "user-old", exp: Date.now() + 3600000 }));
      localStorage.setItem("meg-orders-v1", "[]");
      localStorage.setItem("meg-products-v1", "[]");
      localStorage.setItem("meg-categories-v1", "[]");
      localStorage.setItem("meg-cart-v1", "[]");
      localStorage.setItem("meg-location-v1", JSON.stringify({ orderType: "pickup", city: "Lahore", area: "Gulberg" }));
    });

    // The old session does not open the admin area: the server has no such session.
    await page.goto(`${base}/admin`, { waitUntil: "load" });
    await page.waitForURL(/\/admin\/login/, { timeout: 15000 });
    await settle(page);
    const keys = await page.evaluate(() => Object.keys(window.localStorage).sort());
    assert.deepEqual(keys, ["meg-cart-v1", "meg-location-v1"], "legacy keys were not removed");
    assert.equal((await stored("admins")).length, 0, "old browser accounts reached the database");
    // The page opens on the Login view.
    await page.getByRole("heading", { name: "Admin Login" }).waitFor({ timeout: 15000 });
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("first-Admin sign-up validates input and closes once an Admin exists", async () => {
  const { context, page, problems } = await openPage();
  try {
    await page.goto(`${base}/admin/signup`, { waitUntil: "load" });
    await settle(page);
    // Invalid details are refused and nothing is created.
    await page.locator("#admin-signup-name").fill("Real Admin");
    await page.locator("#admin-signup-email").fill("not-a-gmail@example.com");
    await page.locator("#admin-signup-password").fill("short");
    await page.getByRole("button", { name: "Create Admin Account" }).click();
    await page.getByText("Use a valid Gmail address ending in @gmail.com.").waitFor({ timeout: 15000 });
    assert.equal((await stored("admins")).length, 0, "an Admin was created from invalid input");

    await page.locator("#admin-signup-email").fill("real.admin1@gmail.com");
    await page.locator("#admin-signup-password").fill("Passw0rd!");
    await page.getByRole("button", { name: "Create Admin Account" }).click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    assert.equal((await stored("admins")).length, 1);

    // Setup is closed now, even with the right key.
    const second = await page.evaluate(async (setupKey) => {
      const res = await fetch("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupKey, name: "Second", email: "second.admin@gmail.com", password: "Passw0rd!", confirm: "Passw0rd!" }),
        credentials: "omit",
      });
      return res.status;
    }, TEST_SETUP_KEY);
    assert.equal(second, 403);
    assert.equal((await stored("admins")).length, 1);
    await context.clearCookies();
    await page.goto(`${base}/admin/signup`, { waitUntil: "load" });
    await page.getByRole("heading", { name: "Admin Sign Up Closed" }).waitFor({ timeout: 15000 });
    assert.equal(await page.locator("#admin-signup-name").count(), 0);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});