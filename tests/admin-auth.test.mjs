// Admin and customer auth tests, against `next start` and a throwaway in-memory MongoDB (see
// tests/harness.mjs). They never connect to the database in .env.local.
//
// This file was first written for the original version of the app, which used the real database with a
// temporary meg_test_<random> database. It now uses the shared harness, and the expectations follow the
// current design: first-Admin setup needs ADMIN_SETUP_KEY, passwords are PBKDF2 hashes, the Admin adds
// Owners (each tied to a restaurant), and pages are guarded in the browser while every API checks the
// session on the server.
//
// Run: npm run build, then npm test.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { TEST_PASSWORD, TEST_SETUP_KEY, cookieFrom, json, randomCustomerEmail, randomGmail, startTestEnvironment } from "./harness.mjs";

const PASSWORD = TEST_PASSWORD;

let env;
let base;

before(async () => {
  env = await startTestEnvironment();
  base = env.base;
});

after(async () => {
  await env?.stop();
});

const postJson = (urlPath, body, cookie) =>
  fetch(base + urlPath, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    redirect: "manual",
  });

const get = (urlPath, cookie) => fetch(base + urlPath, { headers: cookie ? { cookie } : {}, redirect: "manual" });

const admins = () => env.db.collection("admins");

describe("initial admin setup", () => {
  test("setup is open before any admin exists", async () => {
    // The pages render in the browser, so the open/closed state is read from the setup API.
    const status = await json("GET", `${base}/api/admin/setup`);
    assert.deepEqual(status.data, { adminExists: false, open: true, keyConfigured: true });
    assert.equal((await get("/admin/signup")).status, 200);
    assert.equal((await get("/admin/login")).status, 200);
  });

  let winnerCookie;

  test("concurrent setup requests create exactly one initial admin", async () => {
    const attempts = Array.from({ length: 8 }, () =>
      postJson("/api/admin/accounts", { setupKey: TEST_SETUP_KEY, name: "Setup Admin", email: randomGmail(), password: PASSWORD, confirm: PASSWORD }),
    );
    const results = await Promise.all(attempts);
    const statuses = results.map((r) => r.status).sort();
    assert.equal(statuses.filter((s) => s === 201).length, 1, `expected exactly one 201, got ${statuses.join(",")}`);
    assert.equal(statuses.filter((s) => s === 403).length, 7, `expected seven 403s, got ${statuses.join(",")}`);

    const winner = results.find((r) => r.status === 201);
    winnerCookie = cookieFrom(winner, "meg_admin_session");
    assert.ok(winnerCookie, "the initial admin must be signed in");

    const docs = await admins().find({}).toArray();
    assert.equal(docs.length, 1, "exactly one admin document in the test database");
    assert.equal(docs[0]._id, "admin-initial");
    assert.equal(docs[0].role, "admin");
  });

  test("setup stays closed after the initial admin exists", async () => {
    const res = await postJson("/api/admin/accounts", { setupKey: TEST_SETUP_KEY, name: "Late Admin", email: randomGmail(), password: PASSWORD, confirm: PASSWORD });
    assert.equal(res.status, 403);
    assert.equal(await admins().countDocuments(), 1);
  });

  test("the setup API reports setup as closed", async () => {
    const status = await json("GET", `${base}/api/admin/setup`);
    assert.deepEqual(status.data, { adminExists: true, open: false, keyConfigured: true });
  });

  describe("unauthorized admin creation", () => {
    test("no session cannot create an admin", async () => {
      const res = await postJson("/api/admin/accounts", { setupKey: TEST_SETUP_KEY, name: "Intruder", email: randomGmail(), password: PASSWORD, confirm: PASSWORD });
      assert.equal(res.status, 403);
      assert.equal(await admins().countDocuments(), 1);
    });

    test("a forged or malformed admin cookie cannot create an admin", async () => {
      const res = await postJson(
        "/api/admin/accounts",
        { setupKey: TEST_SETUP_KEY, name: "Intruder", email: randomGmail(), password: PASSWORD, confirm: PASSWORD },
        "meg_admin_session=eyJzdWIiOiJhZG1pbi1pbml0aWFsIn0.forgedsignature",
      );
      assert.equal(res.status, 403);
      assert.equal(await admins().countDocuments(), 1);
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
      assert.equal(await admins().countDocuments(), 1);
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

  // The Admin adds further accounts as Owners, each tied to a restaurant created on the Restaurants page.
  describe("authorized account creation", () => {
    let newOwnerEmail;
    let restaurantId;

    test("the signed-in admin can create an owner without changing their own session", async () => {
      const restaurant = await json("POST", `${base}/api/admin/restaurants`, { cookie: winnerCookie, body: { name: "Auth Test Kitchen", area: "Gulberg" } });
      assert.equal(restaurant.status, 201, restaurant.text);
      restaurantId = restaurant.data.restaurant.id;

      newOwnerEmail = randomGmail();
      const res = await postJson("/api/admin/accounts", { name: "Second Account", email: newOwnerEmail, password: PASSWORD, confirm: PASSWORD, restaurantId }, winnerCookie);
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.account.email, newOwnerEmail);
      assert.equal(body.account.role, "owner");
      assert.equal(cookieFrom(res, "meg_admin_session"), null, "the caller's session must not be replaced");

      const docs = await admins().find({}).toArray();
      assert.equal(docs.length, 2);
      const created = docs.find((a) => a.email === newOwnerEmail);
      assert.ok(created, "the new account is saved in the database");
      assert.notEqual(created._id, "admin-initial");
      assert.equal(created.role, "owner");
      assert.equal(created.restaurantId, restaurantId);
      assert.ok(created.passwordHash.startsWith("pbkdf2$"), "the password is stored as a PBKDF2 hash");
      assert.ok(!created.passwordHash.includes(PASSWORD));
    });

    test("the creator's admin access still works after creating an account", async () => {
      assert.equal((await get("/admin", winnerCookie)).status, 200);
      const session = await json("GET", `${base}/api/admin/session`, { cookie: winnerCookie });
      assert.equal(session.data.session.role, "admin");
      assert.equal((await get("/api/admin/employees", winnerCookie)).status, 200);
    });

    test("a duplicate Gmail address is rejected", async () => {
      const res = await postJson("/api/admin/accounts", { name: "Dup", email: newOwnerEmail, password: PASSWORD, confirm: PASSWORD, restaurantId }, winnerCookie);
      assert.equal(res.status, 400);
      assert.ok((await res.json()).errors.email);
    });

    test("the new owner can log in with their own credentials and is sent to /owner", async () => {
      const res = await postJson("/api/admin/session", { email: newOwnerEmail, password: PASSWORD });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).redirect, "/owner");
      const ownerCookie = cookieFrom(res, "meg_admin_session");
      assert.ok(ownerCookie);
      assert.equal((await get("/api/admin/employees", ownerCookie)).status, 403, "an Owner has no Admin access");
    });

    test("signed-out visitors get no admin data", async () => {
      // The /admin page itself redirects in the browser (covered by the browser tests); the data is
      // protected on the server.
      assert.equal((await json("GET", `${base}/api/admin/session`)).data.session, null);
      assert.equal((await get("/api/admin/employees")).status, 401);
      assert.equal((await get("/api/admin/orders")).status, 401);
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
    const saved = await env.db.collection("customers").findOne({ email });
    assert.ok(saved, "the customer is saved in the database");
    assert.ok(saved.passwordHash.startsWith("pbkdf2$"));
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
