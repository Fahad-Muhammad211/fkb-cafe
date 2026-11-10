// Browser tests for the LocalStorage build. They start `next start` on a free port and drive the app
// with Chrome. Every account and record is written to this browser's localStorage, so each test uses
// a fresh browser context and nothing is sent to a database.
//
// Run: npm run build, then npm test. Set CHROME_PATH if Chrome is not in its default Windows or
// Linux location.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const ROOT = path.resolve(import.meta.dirname, "..");
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

let server;
let base;
let browser;

function freePort() {
  return 3900 + Math.floor(Math.random() * 500);
}

async function waitForServer(url, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 600) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server did not start at ${url}`);
}

before(async () => {
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("No production build found. Run npm run build first.");
  const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chromePath) throw new Error("Chrome was not found. Set CHROME_PATH to the Chrome executable.");

  const port = freePort();
  base = `http://localhost:${port}`;
  server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port)], {
    cwd: ROOT,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stderr.on("data", () => {});
  await waitForServer(base);
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server?.pid) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
});

// Opens a page in a fresh context and records uncaught errors and console errors.
async function openPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
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

test("first admin account is created in localStorage and opens the dashboard", async () => {
  const { context, page, problems } = await openPage();
  try {
    await page.goto(`${base}/admin/signup`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-signup-name").fill("Test Owner");
    await page.locator("#admin-signup-email").fill("owner.test1@gmail.com");
    await page.locator("#admin-signup-password").fill("Passw0rd!");
    await page.locator("#admin-signup-confirm").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    await settle(page);

    const stored = await page.evaluate(() => window.localStorage.getItem("meg-local:admins"));
    assert.ok(stored && stored.includes("owner.test1@gmail.com"), "admin account was not saved to localStorage");
    assert.ok(!stored.includes("Passw0rd!"), "plain-text password was saved");
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
    const stored = await page.evaluate(() => window.localStorage.getItem("meg-local:customers"));
    assert.ok(stored && stored.includes("customer.test1@gmail.com"), "customer was not saved to localStorage");
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
    await page.locator("#admin-signup-confirm").fill("Passw0rd!");
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
    const storedAsad = await page.evaluate((id) => JSON.parse(localStorage.getItem("meg-local:admins")).find((d) => d._id === id), asadId);
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

    // Sign in as Asad (same browser): as an owner, Asad can open every team and the owner-wide pages.
    await page.evaluate(() => fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" }));
    await page.goto(`${base}/admin/login`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-login-email").fill("owner.test2b@gmail.com");
    await page.locator("#admin-login-password").fill("Passw0rd!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
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
    assert.deepEqual(access, { own: 200, other: 200, employees: 200, restaurants: 200, oldRoute: 404 });
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
    if (msg.type() === "error" && !msg.location().url.includes("openstreetmap")) problems.push(`console: ${msg.text()}`);
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
    await page.locator("#admin-signup-confirm").fill("Passw0rd!");
    await page.getByRole("button", { name: /create|sign up|submit/i }).first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    await settle(page);

    // The sidebar links to Restaurants.
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Restaurants" }).first().waitFor({ state: "attached" });

    // Empty state.
    await page.goto(`${base}/admin/restaurants`, { waitUntil: "load" });
    await settle(page);
    await page.getByText("No restaurants yet").waitFor({ timeout: 15000 });

    // Restaurant B through the API, with no owner yet.
    const restB = await api("POST", "/api/admin/restaurants", { name: "DHA Diner", area: "DHA Phase 5", logo: "", ownerId: null });
    assert.equal(restB.status, 201);
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

    // Create restaurant A from the form, run by Ayesha. She now belongs to restaurant A.
    await page.reload({ waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Add restaurant" }).click();
    await page.locator("#restaurant-name").fill("Gulberg Grill");
    await page.locator("#restaurant-area").fill("Gulberg, Lahore");
    await page.locator("#restaurant-owner").selectOption({ label: "Ayesha Owner" });
    await page.getByRole("button", { name: "Add restaurant" }).click();
    await page.getByText("Gulberg Grill was added.").waitFor({ timeout: 15000 });
    const owners = (await api("GET", "/api/admin/employees")).data.staff;
    assert.equal(owners.find((m) => m.id === ownerA).restaurantName, "Gulberg Grill");
    assert.equal(owners.find((m) => m.id === ownerB).restaurantName, "DHA Diner");

    // An owner cannot run two restaurants.
    const dup = await api("POST", "/api/admin/restaurants", { name: "Other", area: "Johar Town", logo: "", ownerId: ownerA });
    assert.equal(dup.status, 400);
    assert.match(dup.data.errors.ownerId, /already runs/);

    await page.reload({ waitUntil: "load" });
    await settle(page);
    const cards = page.locator('a[href^="/admin/restaurants/rest-"]');
    await cards.first().waitFor({ timeout: 15000 });
    assert.equal(await cards.count(), 2);
    const cardA = cards.filter({ hasText: "Gulberg Grill" });
    await cardA.getByText("Ayesha Owner").waitFor();
    await cardA.getByText("Gulberg, Lahore").waitFor();

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

    // Every owner can open the restaurant pages and data.
    await api("DELETE", "/api/admin/session");
    await page.goto(`${base}/admin/login`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-login-email").fill("owner.resta@gmail.com");
    await page.locator("#admin-login-password").fill("Passw0rd!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    assert.equal((await api("GET", `/api/admin/restaurants/${restA.id}`)).status, 200);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test("accounts saved with the old manager role are migrated to owner and keep their data", async () => {
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
    await page.locator("#admin-signup-confirm").fill("Passw0rd!");
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
    await page.evaluate((id) => {
      const docs = JSON.parse(localStorage.getItem("meg-local:admins"));
      const doc = docs.find((d) => d._id === id);
      doc.role = "manager";
      doc.responsibilities = ["orders"];
      delete doc.restaurantId;
      doc.officeId = "office-legacy";
      doc.officeName = "Legacy Office";
      localStorage.setItem("meg-local:admins", JSON.stringify(docs));
    }, legacyId);

    // Loading the app migrates the stored role. Name, email, password, old office fields and team are kept.
    await page.reload({ waitUntil: "load" });
    await settle(page);
    const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem("meg-local:admins")).find((d) => d._id === id), legacyId);
    assert.equal(stored.role, "owner");
    assert.equal(stored.name, "Legacy Person");
    assert.equal(stored.email, "legacy.person@gmail.com");
    assert.equal(stored.officeName, "Legacy Office");
    // The owner is shown with the restaurant they run.
    const legacyOwner = (await api("GET", "/api/admin/employees")).data.staff.find((m) => m.id === legacyId);
    assert.equal(legacyOwner.restaurantName, "Legacy Kitchen");
    // The first owner never chose a restaurant.
    assert.equal((await api("GET", "/api/admin/employees")).data.staff.find((m) => m.id === "admin-initial").restaurantId, null);

    await api("DELETE", "/api/admin/session");
    await page.goto(`${base}/admin/login`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-login-email").fill("legacy.person@gmail.com");
    await page.locator("#admin-login-password").fill("Passw0rd!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    const details = await api("GET", `/api/admin/owners/${legacyId}`);
    assert.equal(details.status, 200);
    assert.equal(details.data.owner.role, "owner");
    assert.deepEqual(details.data.staff.map((s) => s.name), ["Kept Staff"]);
    assert.equal((await api("GET", "/api/admin/employees")).status, 200, "a migrated account does not have full access");
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
  const store = (name) => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "[]"), `meg-local:${name}`);
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
    await page.locator("#admin-signup-confirm").fill("Passw0rd!");
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

    // A session saved for the deleted account no longer works and is cleared.
    await page.evaluate((id) => window.localStorage.setItem("meg.session.admin", JSON.stringify({ id, exp: Date.now() + 60000 })), doomedId);
    assert.equal((await api("GET", "/api/admin/employees")).status, 401);
    assert.equal(await page.evaluate(() => window.localStorage.getItem("meg.session.admin")), null);

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
