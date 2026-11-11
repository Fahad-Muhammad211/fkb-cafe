// API tests for first-Admin setup and server-side sessions, against `next start` and a throwaway
// in-memory MongoDB (see tests/harness.mjs).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { TEST_PASSWORD, cookieFrom, createFirstAdmin, json, setCookieHeader, signUpCustomer, startTestEnvironment } from "./harness.mjs";

describe("Admin sign-up without any setup key on the server", () => {
  let env;
  before(async () => {
    env = await startTestEnvironment();
  });
  after(async () => {
    await env?.stop();
  });

  test("is open and creates an Admin with a hashed password", async () => {
    assert.deepEqual((await json("GET", `${env.base}/api/admin/setup`)).data, { adminExists: false, open: true });
    const attempt = await createFirstAdmin(env.base);
    assert.equal(attempt.status, 201, JSON.stringify(attempt.body));
    assert.ok(attempt.cookie, "the new Admin is signed in");
    const doc = await env.db.collection("admins").findOne({ email: attempt.email });
    assert.equal(doc.role, "admin");
    assert.ok(doc.passwordHash.startsWith("pbkdf2$") && !doc.passwordHash.includes(TEST_PASSWORD));
  });
});

describe("Admin sign-up stays open", () => {
  let env;
  before(async () => {
    env = await startTestEnvironment();
  });
  after(async () => {
    await env?.stop();
  });

  test("any number of Admins can sign up, including at the same time", async () => {
    // Racing sign-ups: each one creates its own Admin.
    const results = await Promise.all([0, 1, 2, 3].map(() => createFirstAdmin(env.base)));
    assert.deepEqual(results.map((r) => r.status), [201, 201, 201, 201], results.map((r) => JSON.stringify(r.body)).join("\n"));
    assert.equal(await env.db.collection("admins").countDocuments({ role: "admin" }), 4);
    assert.equal(await env.db.collection("admins").countDocuments({ _id: "admin-initial" }), 1, "the first one keeps the initial id");
    assert.deepEqual((await json("GET", `${env.base}/api/admin/setup`)).data, { adminExists: true, open: true });
    assert.equal((await createFirstAdmin(env.base)).status, 201);
    assert.equal(await env.db.collection("admins").countDocuments({ role: "admin" }), 5);
  });

  test("session cookies are httpOnly, random and stored only as a hash", async () => {
    const login = await json("POST", `${env.base}/api/admin/session`, { body: { email: (await env.db.collection("admins").findOne()).email, password: TEST_PASSWORD } });
    assert.equal(login.status, 200);
    const header = setCookieHeader(login.res, "meg_admin_session");
    assert.match(header, /HttpOnly/i);
    assert.match(header, /SameSite=lax/i);
    assert.match(header, /Path=\//);
    const cookie = cookieFrom(login.res, "meg_admin_session");
    const token = cookie.split("=")[1];
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const sessions = await env.db.collection("sessions").find({}).toArray();
    assert.ok(sessions.length >= 1);
    assert.ok(!JSON.stringify(sessions).includes(token), "the raw token is stored in the database");

    const me = await json("GET", `${env.base}/api/admin/session`, { cookie });
    assert.equal(me.data.session.role, "admin");

    // Logging out ends the session on the server: the same cookie no longer works.
    await json("DELETE", `${env.base}/api/admin/session`, { cookie });
    assert.equal((await json("GET", `${env.base}/api/admin/employees`, { cookie })).status, 401);
    assert.equal((await json("GET", `${env.base}/api/admin/session`, { cookie })).data.session, null);
  });

  test("forged, unknown and customer cookies cannot reach admin routes", async () => {
    for (const cookie of [
      "meg_admin_session=eyJzdWIiOiJhZG1pbi1pbml0aWFsIn0.forgedsignature",
      `meg_admin_session=${"A".repeat(43)}`,
      "meg_admin_session=admin-initial",
    ]) {
      assert.equal((await json("GET", `${env.base}/api/admin/employees`, { cookie })).status, 401, cookie);
      assert.equal((await json("GET", `${env.base}/api/admin/orders`, { cookie })).status, 401, cookie);
    }
    const customer = await signUpCustomer(env.base);
    assert.equal(customer.status, 201);
    assert.equal((await json("GET", `${env.base}/api/admin/customers`, { cookie: customer.cookie })).status, 401);
    // A customer session cookie sent under the admin cookie name is not an admin session either.
    const asAdmin = customer.cookie.replace("meg_customer_session=", "meg_admin_session=");
    assert.equal((await json("GET", `${env.base}/api/admin/customers`, { cookie: asAdmin })).status, 401);
  });

  test("API responses are not cached", async () => {
    const res = await json("GET", `${env.base}/api/catalog`);
    assert.equal(res.status, 200);
    assert.match(res.res.headers.get("cache-control") ?? "", /no-store/);
  });
});
