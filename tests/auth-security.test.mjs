// API tests for first-Admin setup and server-side sessions, against `next start` and a throwaway
// in-memory MongoDB (see tests/harness.mjs).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { TEST_PASSWORD, TEST_SETUP_KEY, cookieFrom, createFirstAdmin, json, setCookieHeader, signUpCustomer, startTestEnvironment } from "./harness.mjs";

describe("server without ADMIN_SETUP_KEY", () => {
  let env;
  before(async () => {
    env = await startTestEnvironment({ setupKey: null });
  });
  after(async () => {
    await env?.stop();
  });

  test("first-Admin setup stays closed and creates nothing", async () => {
    const status = await json("GET", `${env.base}/api/admin/setup`);
    assert.deepEqual(status.data, { adminExists: false, open: false, keyConfigured: false });
    const attempt = await createFirstAdmin(env.base);
    assert.equal(attempt.status, 403);
    assert.equal(attempt.cookie, null);
    // The browser is never told the name of the server secret.
    assert.doesNotMatch(attempt.body.error, /ADMIN_SETUP_KEY|setup key/i);
    // Guessing a key from the browser does not open it either.
    const guessed = await createFirstAdmin(env.base, { extra: { setupKey: "some-guessed-key-1234567" } });
    assert.equal(guessed.status, 403);
    assert.equal(await env.db.collection("admins").countDocuments(), 0);
  });
});

describe("server with ADMIN_SETUP_KEY", () => {
  let env;
  before(async () => {
    env = await startTestEnvironment();
  });
  after(async () => {
    await env?.stop();
  });

  test("setup is open only before the first Admin", async () => {
    assert.deepEqual((await json("GET", `${env.base}/api/admin/setup`)).data, { adminExists: false, open: true, keyConfigured: true });
    // The setup key itself never reaches the browser.
    assert.equal((await json("GET", `${env.base}/api/admin/setup`)).text.includes(TEST_SETUP_KEY), false);

    // Racing setup requests: exactly one wins.
    const results = await Promise.all([0, 1, 2, 3].map(() => createFirstAdmin(env.base)));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(await env.db.collection("admins").countDocuments(), 1);
    assert.deepEqual((await json("GET", `${env.base}/api/admin/setup`)).data, { adminExists: true, open: false, keyConfigured: true });
    assert.equal((await createFirstAdmin(env.base)).status, 403);
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
