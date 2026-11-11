// First-Admin setup, Admin login/logout and Admin-only access, end to end against the production build
// and a throwaway in-memory MongoDB (tests/harness.mjs). Never touches the database in .env.local.
//
// Run: npm run build, then node --test tests/admin-setup.test.mjs

import { after, before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { TEST_PASSWORD, cookieFrom, createFirstAdmin, json, randomGmail, setCookieHeader, signUpCustomer, startTestEnvironment } from "./harness.mjs";

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

const login = (email, password = TEST_PASSWORD) => json("POST", `${base}/api/admin/session`, { body: { email, password } });

// Admin creates a restaurant, then an Owner for it. Returns the Owner's email.
async function addOwner(adminCookie) {
  const restaurant = await json("POST", `${base}/api/admin/restaurants`, { cookie: adminCookie, body: { name: "Test Kitchen", area: "Lake City" } });
  assert.equal(restaurant.status, 201, restaurant.text);
  const email = randomGmail();
  const owner = await json("POST", `${base}/api/admin/accounts`, {
    cookie: adminCookie,
    body: { name: "Test Owner", email, password: TEST_PASSWORD, confirm: TEST_PASSWORD, restaurantId: restaurant.data.restaurant.id },
  });
  assert.equal(owner.status, 201, owner.text);
  assert.equal(owner.data.account.role, "owner");
  return email;
}

describe("Admin sign-up", () => {
  test("is open on a fresh install", async () => {
    const status = await json("GET", `${base}/api/admin/setup`);
    assert.deepEqual(status.data, { adminExists: false, open: true });
  });

  test("works from any machine, with no setup key", async () => {
    const remote = { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.5" };
    const res = await fetch(`${base}/api/admin/accounts`, {
      method: "POST",
      headers: remote,
      body: JSON.stringify({ name: "Remote Visitor", email: randomGmail(), password: TEST_PASSWORD }),
    });
    assert.equal(res.status, 201);
    assert.ok(cookieFrom(res, ADMIN_COOKIE));
    assert.equal(await env.db.collection("admins").countDocuments({ role: "admin" }), 1);
  });

  test("rejects invalid sign-up details without creating anything", async () => {
    const bad = await json("POST", `${base}/api/admin/accounts`, { body: { name: "", email: "not-an-email", password: "short" } });
    assert.equal(bad.status, 400);
    assert.ok(bad.data.errors.name && bad.data.errors.email && bad.data.errors.password);
    assert.equal(cookieFrom(bad.res, ADMIN_COOKIE), null);
    assert.equal(await env.db.collection("admins").countDocuments(), 0);
  });

  test("creates the Admin with a hashed password and signs them in", async () => {
    const created = await createFirstAdmin(base, { name: "Site Admin" });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.account.role, "admin");
    assert.equal(created.body.redirect, "/admin");
    assert.equal(JSON.stringify(created.body).includes(TEST_PASSWORD), false, "the password is never sent back");

    const cookie = setCookieHeader(created.res, ADMIN_COOKIE);
    assert.ok(cookie, "a session cookie is set");
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=lax/i);

    const [doc] = await env.db.collection("admins").find().toArray();
    assert.equal(doc.role, "admin");
    assert.equal(doc.email, created.email);
    assert.ok(doc.passwordHash && !doc.passwordHash.includes(TEST_PASSWORD), "password stored as a hash");
    assert.equal(doc.password, undefined);
    assert.equal(await env.db.collection("sessions").countDocuments({ kind: "admin", accountId: doc._id }), 1);

    const session = await json("GET", `${base}/api/admin/session`, { cookie: created.cookie });
    assert.equal(session.data.session.role, "admin");
    assert.equal(session.data.session.email, created.email);
  });

  test("stays open once an Admin exists: multiple Admins, each hashed, each able to log in; duplicates refused", async () => {
    const first = await createFirstAdmin(base);
    const second = await createFirstAdmin(base);
    const third = await createFirstAdmin(base);
    assert.deepEqual([first.status, second.status, third.status], [201, 201, 201]);
    assert.deepEqual((await json("GET", `${base}/api/admin/setup`)).data, { adminExists: true, open: true });

    const docs = await env.db.collection("admins").find({ role: "admin" }).toArray();
    assert.equal(docs.length, 3);
    assert.equal(new Set(docs.map((d) => d._id)).size, 3, "every Admin has its own id");
    for (const doc of docs) {
      assert.ok(doc.passwordHash.startsWith("pbkdf2$") && !doc.passwordHash.includes(TEST_PASSWORD));
      assert.equal(doc.password, undefined);
    }
    for (const account of [first, second, third]) {
      const res = await login(account.email);
      assert.equal(res.status, 200);
      assert.equal(res.data.redirect, "/admin");
    }
    // The same email cannot sign up twice.
    const dup = await createFirstAdmin(base, { email: second.email });
    assert.equal(dup.status, 400);
    assert.ok(dup.body.errors.email);
    assert.equal(await env.db.collection("admins").countDocuments({ role: "admin" }), 3);
  });

  test("ignores a role sent by the browser", async () => {
    const res = await json("POST", `${base}/api/admin/accounts`, {
      body: { name: "Sneaky Admin", email: randomGmail(), password: TEST_PASSWORD, role: "owner", restaurantId: "x" },
    });
    assert.equal(res.status, 201);
    const [doc] = await env.db.collection("admins").find().toArray();
    assert.equal(doc.role, "admin");
    assert.equal(doc.restaurantId, undefined);
  });
});

describe("Admin login and logout", () => {
  test("login checks the password, logout ends the session on the server", async () => {
    const { email } = await createFirstAdmin(base);

    const bad = await login(email, "WrongPass999");
    assert.equal(bad.status, 401);
    assert.equal(cookieFrom(bad.res, ADMIN_COOKIE), null);

    const good = await login(email);
    assert.equal(good.status, 200);
    assert.equal(good.data.redirect, "/admin");
    assert.equal(good.data.account.role, "admin");
    const cookie = cookieFrom(good.res, ADMIN_COOKIE);
    assert.ok(cookie);
    assert.equal((await json("GET", `${base}/api/admin/employees`, { cookie })).status, 200);

    const out = await json("DELETE", `${base}/api/admin/session`, { cookie });
    assert.equal(out.status, 200);
    assert.match(setCookieHeader(out.res, ADMIN_COOKIE) ?? "", /Max-Age=0|Expires=Thu, 01 Jan 1970/i, "the cookie is cleared");
    // Replaying the old cookie no longer works: the session was deleted from MongoDB.
    assert.equal((await json("GET", `${base}/api/admin/session`, { cookie })).data.session, null);
    assert.equal((await json("GET", `${base}/api/admin/employees`, { cookie })).status, 401);
  });
});

describe("Admin-only access", () => {
  const ADMIN_APIS = [
    ["GET", "/api/admin/employees"],
    ["GET", "/api/admin/restaurants"],
    ["GET", "/api/admin/orders"],
    ["GET", "/api/admin/customers"],
    ["POST", "/api/admin/restaurants"],
  ];

  test("signed-out visitors and customers are refused", async () => {
    await createFirstAdmin(base);
    const customer = await signUpCustomer(base);
    for (const [method, path] of ADMIN_APIS) {
      assert.equal((await json(method, `${base}${path}`, { body: method === "POST" ? {} : undefined })).status, 401, `${method} ${path} signed out`);
      assert.equal((await json(method, `${base}${path}`, { cookie: customer.cookie, body: method === "POST" ? {} : undefined })).status, 401, `${method} ${path} as customer`);
    }
  });

  test("an Owner is refused by every Admin API and sent to /owner", async () => {
    const admin = await createFirstAdmin(base);
    const ownerEmail = await addOwner(admin.cookie);

    const ownerLogin = await login(ownerEmail);
    assert.equal(ownerLogin.status, 200);
    assert.equal(ownerLogin.data.redirect, "/owner");
    assert.equal(ownerLogin.data.account.role, "owner");
    const ownerCookie = cookieFrom(ownerLogin.res, ADMIN_COOKIE);

    for (const [method, path] of ADMIN_APIS) {
      const res = await json(method, `${base}${path}`, { cookie: ownerCookie, body: method === "POST" ? { name: "X", area: "Y" } : undefined });
      assert.equal(res.status, 403, `${method} ${path} as owner`);
    }
    // An Owner cannot add accounts either (no self-service Owner/staff registration).
    const add = await json("POST", `${base}/api/admin/accounts`, {
      cookie: ownerCookie,
      body: { name: "Another Owner", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD },
    });
    assert.equal(add.status, 403);
    assert.equal(await env.db.collection("admins").countDocuments(), 2);

    // The Owner area still works for the Owner, and the customer login page sends them there too.
    assert.equal((await json("GET", `${base}/api/owner/session`, { cookie: ownerCookie })).status, 200);
    const viaCustomerLogin = await json("POST", `${base}/api/customer/session`, { body: { email: ownerEmail, password: TEST_PASSWORD } });
    assert.equal(viaCustomerLogin.data.redirect, "/owner");
  });
});

// A login request with an optional X-Forwarded-For header. path is /api/admin/session or /api/customer/session.
async function loginVia(baseUrl, path, email, password, forwardedFor) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(forwardedFor ? { "x-forwarded-for": forwardedFor } : {}) },
    body: JSON.stringify({ email, password }),
  });
  return res.status;
}

describe("login rate limiting (no trusted proxy)", () => {
  test("a client-sent X-Forwarded-For header cannot reset the limit", async () => {
    const { email } = await createFirstAdmin(base);
    for (let i = 0; i < 10; i += 1) {
      assert.equal(await loginVia(base, "/api/admin/session", email, "WrongPass999", `198.51.100.${i + 1}`), 401, `attempt ${i + 1}`);
    }
    // Even the right password is refused now, whatever address the client claims.
    assert.equal(await loginVia(base, "/api/admin/session", email, TEST_PASSWORD, "198.51.100.200"), 429);
    assert.equal(await loginVia(base, "/api/admin/session", email, TEST_PASSWORD), 429);
  });

  test("/login and /admin/login share one count per account, and other accounts are not blocked", async () => {
    const admin = await createFirstAdmin(base);
    const ownerEmail = await addOwner(admin.cookie);
    for (let i = 0; i < 5; i += 1) assert.equal(await loginVia(base, "/api/admin/session", ownerEmail, "WrongPass999"), 401);
    for (let i = 0; i < 5; i += 1) assert.equal(await loginVia(base, "/api/customer/session", ownerEmail, "WrongPass999"), 401);
    assert.equal(await loginVia(base, "/api/admin/session", ownerEmail, TEST_PASSWORD), 429, "10 failures across both pages lock the account");
    assert.equal(await loginVia(base, "/api/customer/session", ownerEmail, TEST_PASSWORD), 429);
    // Without a trusted proxy there is no shared IP bucket, so the Admin can still sign in.
    assert.equal(await loginVia(base, "/api/admin/session", admin.email, TEST_PASSWORD), 200);
  });
});

describe("login rate limiting behind a trusted proxy (TRUSTED_PROXY_HOPS=1)", () => {
  let proxied;
  before(async () => {
    proxied = await startTestEnvironment({ env: { TRUSTED_PROXY_HOPS: "1" } });
  });
  after(async () => {
    if (proxied) await proxied.stop();
  });

  test("failures from one IP across many accounts are limited; other IPs are not; prepended addresses are ignored", async () => {
    const { email } = await createFirstAdmin(proxied.base);
    const attackerIp = "203.0.113.7";
    // 50 failures from one visitor IP, each against a different (unknown) account.
    for (let i = 0; i < 50; i += 1) {
      assert.equal(await loginVia(proxied.base, "/api/admin/session", randomGmail(), "WrongPass999", attackerIp), 401, `attempt ${i + 1}`);
    }
    assert.equal(await loginVia(proxied.base, "/api/admin/session", email, TEST_PASSWORD, attackerIp), 429, "the IP is blocked");
    // The proxy appends the real address last; whatever the client put before it is ignored.
    assert.equal(await loginVia(proxied.base, "/api/admin/session", email, TEST_PASSWORD, `10.0.0.1, ${attackerIp}`), 429);
    // A different visitor is not affected, and the account itself is not locked.
    assert.equal(await loginVia(proxied.base, "/api/admin/session", email, TEST_PASSWORD, "203.0.113.8"), 200);
  });
});

describe("additional Admin accounts", () => {
  const addAdmin = (cookie, body) => json("POST", `${base}/api/admin/admins`, { cookie, body });
  const newAdmin = () => ({ name: "Second Admin", email: randomGmail(), password: TEST_PASSWORD });

  test("the signed-in route /api/admin/admins refuses everyone but an Admin (public sign-up is separate)", async () => {
    const admin = await createFirstAdmin(base);
    const ownerEmail = await addOwner(admin.cookie);
    const ownerCookie = cookieFrom((await login(ownerEmail)).res, ADMIN_COOKIE);
    const customer = await signUpCustomer(base);
    const before = await env.db.collection("admins").countDocuments();

    assert.equal((await addAdmin(undefined, newAdmin())).status, 401, "signed out");
    assert.equal((await addAdmin(customer.cookie, newAdmin())).status, 401, "customer");
    assert.equal((await addAdmin(ownerCookie, newAdmin())).status, 403, "owner");
    assert.equal((await addAdmin("meg_admin_session=forged.value", newAdmin())).status, 401, "forged cookie");
    assert.equal(await env.db.collection("admins").countDocuments(), before);
  });

  test("a signed-in Admin creates another Admin, stays signed in, and the new Admin can log in", async () => {
    const admin = await createFirstAdmin(base);
    const input = newAdmin();
    const created = await addAdmin(admin.cookie, { ...input, role: "owner", restaurantId: "x" });
    assert.equal(created.status, 201, created.text);
    assert.equal(created.data.account.role, "admin", "the role is set by the server");
    assert.equal(cookieFrom(created.res, ADMIN_COOKIE), null, "the creator's session is not replaced");
    assert.equal(JSON.stringify(created.data).includes(TEST_PASSWORD), false);

    const doc = await env.db.collection("admins").findOne({ email: input.email });
    assert.equal(doc.role, "admin");
    assert.equal(doc.restaurantId, undefined);
    assert.ok(doc.passwordHash.startsWith("pbkdf2$") && !doc.passwordHash.includes(TEST_PASSWORD));

    assert.equal((await json("GET", `${base}/api/admin/session`, { cookie: admin.cookie })).data.session.email, admin.email);
    const second = await login(input.email);
    assert.equal(second.status, 200);
    assert.equal(second.data.redirect, "/admin");
    assert.equal((await json("GET", `${base}/api/admin/employees`, { cookie: cookieFrom(second.res, ADMIN_COOKIE) })).status, 200);
  });

  test("validation and duplicate emails are rejected", async () => {
    const admin = await createFirstAdmin(base);
    const bad = await addAdmin(admin.cookie, { name: "", email: "nope@example.com", password: "short" });
    assert.equal(bad.status, 400);
    assert.ok(bad.data.errors.name && bad.data.errors.email && bad.data.errors.password);
    const dup = await addAdmin(admin.cookie, { name: "Dup Admin", email: admin.email, password: TEST_PASSWORD });
    assert.equal(dup.status, 400);
    assert.ok(dup.data.errors.email);
  });

  test("one Admin cannot switch off, move or delete another Admin from Employees", async () => {
    const admin = await createFirstAdmin(base);
    const input = newAdmin();
    const created = await addAdmin(admin.cookie, input);
    const otherId = created.data.account.id;
    const secondCookie = cookieFrom((await login(input.email)).res, ADMIN_COOKIE);
    const firstId = (await env.db.collection("admins").findOne({ email: admin.email }))._id;

    for (const [cookie, target] of [[admin.cookie, otherId], [secondCookie, firstId]]) {
      assert.equal((await json("PATCH", `${base}/api/admin/employees/${target}`, { cookie, body: { active: false } })).status, 403);
      assert.equal((await json("DELETE", `${base}/api/admin/employees/${target}`, { cookie })).status, 403);
    }
    assert.equal(await env.db.collection("admins").countDocuments({ role: "admin", active: true }), 2);
    // Owners are still managed as before.
    const ownerEmail = await addOwner(admin.cookie);
    const ownerId = (await env.db.collection("admins").findOne({ email: ownerEmail }))._id;
    assert.equal((await json("PATCH", `${base}/api/admin/employees/${ownerId}`, { cookie: secondCookie, body: { active: false } })).status, 200);
  });
});

describe("/admin/login page", () => {
  let browser;
  before(async () => {
    const chromePath = CHROME_CANDIDATES.find((p) => existsSync(p));
    if (!chromePath) throw new Error("Chrome was not found. Set CHROME_PATH to the Chrome executable.");
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
  });
  after(async () => {
    if (browser) await browser.close();
  });

  async function openPage() {
    const context = await browser.newContext();
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
    return { context, page, problems };
  }

  test("Login is the default view; Sign Up shows only Full Name, Email, Password; signup, logout, login, then more Admins sign up", async () => {
    const { context, page, problems } = await openPage();
    await page.goto(`${base}/admin/login`);

    // Default view: Admin Login with Email, Password, Login, and a Sign Up switch below.
    await page.getByRole("heading", { name: "Admin Login" }).waitFor();
    assert.equal(await page.getByLabel("Email", { exact: true }).count(), 1);
    assert.equal(await page.locator("#admin-login-password").count(), 1);
    assert.equal(await page.getByRole("button", { name: "Login", exact: true }).count(), 1);
    assert.match(await page.locator("main").innerText(), /Don't have an account\?\s*Sign Up/);

    // Sign Up view: exactly three fields, no setup key anywhere in the page.
    await page.getByRole("button", { name: "Sign Up", exact: true }).click();
    await page.getByRole("heading", { name: "Create Admin Account" }).waitFor();
    const fieldIds = await page.locator("main form input").evaluateAll((els) => els.map((el) => el.id));
    assert.deepEqual(fieldIds, ["admin-signup-name", "admin-signup-email", "admin-signup-password"]);
    assert.equal(await page.getByLabel("Full Name").count(), 1);
    assert.equal(await page.getByLabel("Email", { exact: true }).count(), 1);
    assert.equal(await page.getByLabel("Password", { exact: true }).count(), 1);
    const html = await page.content();
    assert.doesNotMatch(html, /setup.?key|ADMIN_SETUP_KEY/i);
    assert.match(await page.locator("main").innerText(), /Already have an account\?\s*Login/);

    // "Login" returns to the Login view, and Sign Up opens again.
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await page.getByRole("heading", { name: "Admin Login" }).waitFor();
    await page.getByRole("button", { name: "Sign Up", exact: true }).click();

    // Create the first Admin: lands on the existing Admin dashboard, signed in.
    const email = randomGmail();
    await page.fill("#admin-signup-name", "Browser Admin");
    await page.fill("#admin-signup-email", email);
    await page.fill("#admin-signup-password", TEST_PASSWORD);
    await page.getByRole("button", { name: "Create Admin Account" }).click();
    await page.waitForURL(`${base}/admin`);
    await page.getByText("Browser Admin").first().waitFor();

    // No account or session data is kept in browser storage.
    const storage = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].join(","));
    assert.doesNotMatch(storage, /admin|session|account|password/i);

    // Logout ends the session: the dashboard sends the visitor back to /admin/login.
    const out = await page.evaluate(() => fetch("/api/admin/session", { method: "DELETE" }).then((r) => r.status));
    assert.equal(out, 200);
    await page.goto(`${base}/admin/employees`);
    await page.waitForURL(`${base}/admin/login`);
    await context.close();

    // A new visitor: Login works and redirects to the Admin dashboard.
    const second = await openPage();
    await second.page.goto(`${base}/admin/login`);
    await second.page.getByRole("heading", { name: "Admin Login" }).waitFor();
    await second.page.fill("#admin-login-email", email);
    await second.page.fill("#admin-login-password", "WrongPass999");
    await second.page.getByRole("button", { name: "Login", exact: true }).click();
    await second.page.getByText("Email or password is incorrect.").waitFor();
    await second.page.fill("#admin-login-password", TEST_PASSWORD);
    await second.page.getByRole("button", { name: "Login", exact: true }).click();
    await second.page.waitForURL(`${base}/admin`);
    await second.context.close();

    // Sign Up stays open now that an Admin exists: more Admins sign up on both routes, then log in.
    const others = [];
    // Names allow only letters, spaces and . ' - (see isValidName), so each route gets a plain name.
    for (const [route, name] of [["/admin/login", "Login Page Admin"], ["/admin/signup", "Signup Page Admin"]]) {
      const visitor = await openPage();
      others.push(visitor);
      await visitor.page.goto(`${base}${route}`);
      if (route === "/admin/login") await visitor.page.getByRole("button", { name: "Sign Up", exact: true }).click();
      await visitor.page.getByRole("heading", { name: "Create Admin Account" }).waitFor();
      const otherEmail = randomGmail();
      await visitor.page.fill("#admin-signup-name", name);
      await visitor.page.fill("#admin-signup-email", otherEmail);
      await visitor.page.fill("#admin-signup-password", TEST_PASSWORD);
      await visitor.page.getByRole("button", { name: "Create Admin Account" }).click();
      await visitor.page.waitForURL(`${base}/admin`);
      await visitor.page.getByText(name).first().waitFor();
      // Log out, then log back in with the new account.
      await visitor.page.evaluate(() => fetch("/api/admin/session", { method: "DELETE" }));
      await visitor.page.goto(`${base}/admin/login`);
      await visitor.page.fill("#admin-login-email", otherEmail);
      await visitor.page.fill("#admin-login-password", TEST_PASSWORD);
      await visitor.page.getByRole("button", { name: "Login", exact: true }).click();
      await visitor.page.waitForURL(`${base}/admin`);
      await visitor.context.close();
    }
    assert.equal(await env.db.collection("admins").countDocuments({ role: "admin" }), 3);

    assert.deepEqual([...problems, ...second.problems, ...others.flatMap((o) => o.problems)], []);
  });

  test("a signed-in Admin uses the Sign Up page to create another Admin; an Owner cannot", async () => {
    const admin = await createFirstAdmin(base);
    const ownerEmail = await addOwner(admin.cookie);

    const a = await openPage();
    await a.page.goto(`${base}/admin/login`);
    await a.page.fill("#admin-login-email", admin.email);
    await a.page.fill("#admin-login-password", TEST_PASSWORD);
    await a.page.getByRole("button", { name: "Login", exact: true }).click();
    await a.page.waitForURL(`${base}/admin`);

    // A signed-in Admin on /admin/login still goes to the dashboard; /admin/signup shows the form.
    await a.page.goto(`${base}/admin/login`);
    await a.page.waitForURL(`${base}/admin`);
    await a.page.goto(`${base}/admin/signup`);
    await a.page.getByRole("heading", { name: "Create Admin Account" }).waitFor();
    assert.equal(await a.page.getByRole("link", { name: "Back to dashboard" }).count(), 1);
    const fieldIds = await a.page.locator("main form input").evaluateAll((els) => els.map((el) => el.id));
    assert.deepEqual(fieldIds, ["admin-signup-name", "admin-signup-email", "admin-signup-password"]);

    const email = randomGmail();
    await a.page.fill("#admin-signup-name", "Browser Second Admin");
    await a.page.fill("#admin-signup-email", email);
    await a.page.fill("#admin-signup-password", TEST_PASSWORD);
    await a.page.getByRole("button", { name: "Create Admin Account" }).click();
    await a.page.getByText(`Admin account created for Browser Second Admin (${email}).`, { exact: false }).waitFor();
    assert.equal(await a.page.inputValue("#admin-signup-email"), "", "the form is cleared for the next one");
    // Still signed in as the first Admin.
    await a.page.goto(`${base}/admin`);
    await a.page.getByText("Setup Admin").first().waitFor();
    await a.context.close();

    // The new Admin logs in through the Login view.
    const b = await openPage();
    await b.page.goto(`${base}/admin/login`);
    await b.page.fill("#admin-login-email", email);
    await b.page.fill("#admin-login-password", TEST_PASSWORD);
    await b.page.getByRole("button", { name: "Login", exact: true }).click();
    await b.page.waitForURL(`${base}/admin`);
    await b.context.close();

    // A signed-in Owner who opens /admin/signup is sent to /owner.
    const o = await openPage();
    await o.page.goto(`${base}/admin/login`);
    await o.page.fill("#admin-login-email", ownerEmail);
    await o.page.fill("#admin-login-password", TEST_PASSWORD);
    await o.page.getByRole("button", { name: "Login", exact: true }).click();
    await o.page.waitForURL((url) => url.pathname.startsWith("/owner"));
    await o.page.goto(`${base}/admin/signup`);
    await o.page.waitForURL((url) => url.pathname.startsWith("/owner"));
    await o.context.close();

    assert.equal(await env.db.collection("admins").countDocuments({ role: "admin" }), 2);
    assert.deepEqual([...a.problems, ...b.problems, ...o.problems], []);
  });

  test("signed-out visitors are sent from /admin to /admin/login; an Owner is sent to /owner", async () => {
    const admin = await createFirstAdmin(base);
    const ownerEmail = await addOwner(admin.cookie);

    const visitor = await openPage();
    await visitor.page.goto(`${base}/admin/employees`);
    await visitor.page.waitForURL(`${base}/admin/login`);
    await visitor.context.close();

    const owner = await openPage();
    await owner.page.goto(`${base}/admin/login`);
    await owner.page.getByRole("heading", { name: "Admin Login" }).waitFor();
    await owner.page.fill("#admin-login-email", ownerEmail);
    await owner.page.fill("#admin-login-password", TEST_PASSWORD);
    await owner.page.getByRole("button", { name: "Login", exact: true }).click();
    await owner.page.waitForURL((url) => url.pathname.startsWith("/owner"));
    // Going to the Admin dashboard directly sends the Owner back to /owner.
    await owner.page.goto(`${base}/admin/employees`);
    await owner.page.waitForURL((url) => url.pathname.startsWith("/owner"));
    await owner.context.close();
  });
});
