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

test("owner creates offices and managers, manages a team, and a manager cannot see another manager's team", async () => {
  const { context, page, problems } = await openPage();
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

    // Offices: create two, and refuse a duplicate name that differs only in case and spacing.
    await page.goto(`${base}/admin/offices`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#office-name").fill("Main Branch");
    await page.locator("#office-address").fill("1 Main Road");
    await page.getByRole("button", { name: "Add office" }).click();
    await page.getByText("Main Branch", { exact: true }).waitFor({ timeout: 15000 });
    await page.locator("#office-name").fill("  main   branch ");
    await page.getByRole("button", { name: "Add office" }).click();
    await page.getByText("An office with this name already exists.").waitFor({ timeout: 15000 });
    await page.locator("#office-name").fill("Gulberg Branch");
    await page.getByRole("button", { name: "Add office" }).click();
    await page.getByText("Gulberg Branch", { exact: true }).waitFor({ timeout: 15000 });

    // Manager, created only from the Employees page with an office from the dropdown.
    await page.goto(`${base}/admin/employees`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Add manager" }).click();
    await page.locator("#manager-name").fill("Asad Manager");
    await page.locator("#manager-email").fill("manager.test2@gmail.com");
    await page.locator("#manager-password").fill("Passw0rd!");
    await page.locator("#manager-confirm").fill("Passw0rd!");
    await page.locator("#manager-officeId").selectOption({ label: "Main Branch" });
    await page.getByRole("button", { name: "Add manager" }).click();
    await page.getByRole("link", { name: "Asad Manager" }).waitFor({ timeout: 15000 });
    await page.getByText("Main Branch", { exact: true }).first().waitFor();

    // Manager details page.
    await page.getByRole("link", { name: "Asad Manager" }).click();
    await page.waitForURL(/\/admin\/employees\/admin-/, { timeout: 20000 });
    await settle(page);
    const asadId = new URL(page.url()).pathname.split("/").pop();
    await page.getByRole("heading", { name: "Asad Manager" }).waitFor();
    await page.getByText("Staff under this manager (0)").waitFor();

    // Staff under this manager.
    await page.getByRole("button", { name: "Add staff" }).click();
    await page.locator("#staff-name").fill("Ali Cashier");
    await page.locator("#staff-job-role").selectOption("Cashier");
    await page.getByRole("button", { name: "Add to team" }).click();
    await page.getByText("Ali Cashier", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText("Staff added", { exact: true }).waitFor();

    // Reassign the manager's office.
    await page.locator("#reassign-office").selectOption({ label: "Gulberg Branch" });
    await page.getByRole("button", { name: "Save office" }).click();
    await page.getByText("Office was saved.").waitFor({ timeout: 15000 });
    await page.getByText("Office changed", { exact: true }).waitFor();

    // A second manager in Gulberg.
    await page.goto(`${base}/admin/employees`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Add manager" }).click();
    await page.locator("#manager-name").fill("Bilal Manager");
    await page.locator("#manager-email").fill("manager.test3@gmail.com");
    await page.locator("#manager-password").fill("Passw0rd!");
    await page.locator("#manager-confirm").fill("Passw0rd!");
    await page.locator("#manager-officeId").selectOption({ label: "Gulberg Branch" });
    await page.getByRole("button", { name: "Add manager" }).click();
    await page.getByRole("link", { name: "Bilal Manager" }).waitFor({ timeout: 15000 });
    await page.getByRole("link", { name: "Bilal Manager" }).click();
    await page.waitForURL(/\/admin\/employees\/admin-/, { timeout: 20000 });
    await settle(page);
    const bilalId = new URL(page.url()).pathname.split("/").pop();

    // Move Ali from Asad to Bilal.
    await page.goto(`${base}/admin/employees/${asadId}`, { waitUntil: "load" });
    await settle(page);
    await page.locator('select[id^="move-"]').first().selectOption({ label: "Bilal Manager" });
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await page.getByText("Ali Cashier was moved to Bilal Manager.").waitFor({ timeout: 15000 });
    await page.getByText("Ali Cashier", { exact: true }).waitFor({ state: "detached", timeout: 15000 });
    await page.goto(`${base}/admin/employees/${bilalId}`, { waitUntil: "load" });
    await settle(page);
    await page.getByText("Ali Cashier", { exact: true }).waitFor({ timeout: 15000 });
    await page.getByText("Staff moved in", { exact: true }).waitFor();

    // Sign in as Asad (same browser): own team is readable, Bilal's team is refused.
    await page.evaluate(() => fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" }));
    await page.goto(`${base}/admin/login`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-login-email").fill("manager.test2@gmail.com");
    await page.locator("#admin-login-password").fill("Passw0rd!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    const access = await page.evaluate(
      async ({ own, other }) => {
        const a = await fetch(`/api/admin/managers/${own}`, { credentials: "same-origin" });
        const b = await fetch(`/api/admin/managers/${other}`, { credentials: "same-origin" });
        return { own: a.status, other: b.status };
      },
      { own: asadId, other: bilalId },
    );
    assert.equal(access.own, 200, "a manager could not open their own team");
    assert.equal(access.other, 403, "a manager could open another manager's team");
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

    // Two managers, each with one staff member, set up through the existing APIs.
    const office = await api("POST", "/api/admin/offices", { name: "Head Office", address: "1 Mall Road Lahore" });
    assert.equal(office.status, 201);
    const makeManager = async (name, email) => {
      const r = await api("POST", "/api/admin/accounts", { name, email, password: "Passw0rd!", confirm: "Passw0rd!", role: "manager", officeId: office.data.office.id });
      assert.equal(r.status, 201, JSON.stringify(r.data));
      return r.data.account.id;
    };
    const managerA = await makeManager("Ayesha Manager", "manager.resta@gmail.com");
    const managerB = await makeManager("Bilal Manager", "manager.restb@gmail.com");
    assert.equal((await api("POST", `/api/admin/managers/${managerA}/staff`, { name: "Kamran Cook", jobRole: "Cook", phone: "03001112233" })).status, 201);
    assert.equal((await api("POST", `/api/admin/managers/${managerB}/staff`, { name: "Zara Cashier", jobRole: "Cashier" })).status, 201);

    // Empty state, then create restaurant A from the form.
    await page.goto(`${base}/admin/restaurants`, { waitUntil: "load" });
    await settle(page);
    await page.getByText("No restaurants yet").waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Add restaurant" }).click();
    await page.locator("#restaurant-name").fill("Gulberg Grill");
    await page.locator("#restaurant-area").fill("Gulberg, Lahore");
    await page.locator("#restaurant-manager").selectOption({ label: "Ayesha Manager" });
    await page.getByRole("button", { name: "Add restaurant" }).click();
    await page.getByText("Gulberg Grill was added.").waitFor({ timeout: 15000 });

    // Restaurant B through the API; a manager cannot run two restaurants.
    const restB = await api("POST", "/api/admin/restaurants", { name: "DHA Diner", area: "DHA Phase 5", logo: "", managerId: managerB });
    assert.equal(restB.status, 201);
    const dup = await api("POST", "/api/admin/restaurants", { name: "Other", area: "Johar Town", logo: "", managerId: managerA });
    assert.equal(dup.status, 400);
    assert.match(dup.data.errors.managerId, /already runs/);

    await page.reload({ waitUntil: "load" });
    await settle(page);
    const cards = page.locator('a[href^="/admin/restaurants/rest-"]');
    await cards.first().waitFor({ timeout: 15000 });
    assert.equal(await cards.count(), 2);
    const cardA = cards.filter({ hasText: "Gulberg Grill" });
    await cardA.getByText("Ayesha Manager").waitFor();
    await cardA.getByText("Gulberg, Lahore").waitFor();

    const list = await api("GET", "/api/admin/restaurants");
    const restA = list.data.restaurants.find((r) => r.name === "Gulberg Grill");
    const restBId = restB.data.restaurant.id;

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
    const zaraId = (await api("GET", `/api/admin/managers/${managerB}`)).data.staff[0].id;
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

    // Managers cannot open the restaurant pages or data.
    await api("DELETE", "/api/admin/session");
    await page.goto(`${base}/admin/login`, { waitUntil: "load" });
    await settle(page);
    await page.locator("#admin-login-email").fill("manager.resta@gmail.com");
    await page.locator("#admin-login-password").fill("Passw0rd!");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/admin(\/)?$/, { timeout: 20000 });
    assert.equal((await api("GET", `/api/admin/restaurants/${restA.id}`)).status, 403);
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});
