// Customer dashboard API tests. They run against a real `next start` server and a throwaway MongoDB database
// (see tests/harness.mjs). Each test checks that a customer only ever sees and changes their own data.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { TEST_PASSWORD, cookieFrom, json, randomGmail, signUpCustomer, startTestEnvironment } from "./harness.mjs";

const DASHBOARD_PAGES = [
  "/account",
  "/account/orders",
  "/account/profile",
  "/account/addresses",
  "/account/wishlist",
  "/account/payments",
  "/account/offers",
  "/account/notifications",
  "/account/support",
];

let env;
let base;
let adminCookie;
let candidates = [];
let alice;
let bob;

// Creates an order for one customer, using the first menu item the server accepts at its listed price.
async function placeOrder(customer, qty = 1) {
  for (const product of candidates) {
    const res = await json("POST", `${base}/api/orders`, {
      cookie: customer.cookie,
      body: {
        clientOrderId: randomBytes(12).toString("base64url"),
        customer: { name: "Test Customer", phone: "03001234567", address: "House 1, Street 2, Lahore", notes: "" },
        fulfilment: "delivery",
        lines: [{ id: `line-${randomBytes(4).toString("hex")}`, itemId: product.id, name: product.name, unitPrice: product.price, qty, options: [], instructions: "" }],
      },
    });
    if (res.status === 201) return res.data.order;
  }
  throw new Error("No menu item could be ordered at its listed price");
}

before(async () => {
  env = await startTestEnvironment();
  base = env.base;

  // The first admin on an empty database is created by the initial-setup route.
  const admin = await json("POST", `${base}/api/admin/accounts`, {
    body: { name: "Test Admin", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD },
  });
  assert.equal(admin.status, 201, "initial admin setup");
  adminCookie = cookieFrom(admin.res, "meg_admin_session");

  const catalog = await json("GET", `${base}/api/catalog`);
  candidates = catalog.data.products.filter((p) => p.available !== false && p.stock !== "out" && !p.sizes?.length && !p.flavors?.length);
  assert.ok(candidates.length > 0, "the menu has orderable items");

  alice = await signUpCustomer(base, { name: "Alice Shopper" });
  bob = await signUpCustomer(base, { name: "Bob Shopper" });
  assert.equal(alice.status, 201);
  assert.equal(bob.status, 201);
});

after(async () => {
  await env?.stop();
});

describe("routes and sessions", () => {
  test("signed-out visitors are redirected to login from every dashboard page", async () => {
    for (const path of [...DASHBOARD_PAGES, "/account/orders/MEG-000001"]) {
      const res = await fetch(`${base}${path}`, { redirect: "manual" });
      assert.equal(res.status, 307, `${path} should redirect`);
      assert.match(res.headers.get("location") ?? "", /\/login$/, `${path} should go to login`);
    }
  });

  test("signed-in customers can open every dashboard page", async () => {
    for (const path of DASHBOARD_PAGES) {
      const res = await fetch(`${base}${path}`, { headers: { cookie: alice.cookie }, redirect: "manual" });
      assert.equal(res.status, 200, `${path} should render for a customer`);
      const html = await res.text();
      assert.match(html, /Customer dashboard|My orders|My profile|My addresses|My wishlist|My payments|Offers|Notifications|Customer support/i, `${path} shows its heading`);
    }
  });

  test("customer APIs reject signed-out requests", async () => {
    const checks = [
      ["GET", "/api/customer/addresses"],
      ["GET", "/api/customer/wishlist"],
      ["GET", "/api/customer/support"],
      ["GET", "/api/customer/notifications"],
      ["GET", "/api/customer/payments"],
      ["GET", "/api/customer/offers"],
      ["GET", "/api/orders"],
      ["PATCH", "/api/customer/password"],
    ];
    for (const [method, path] of checks) {
      const res = await json(method, `${base}${path}`, { body: method === "GET" ? undefined : {} });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });

  test("customers cannot reach admin pages or admin APIs", async () => {
    const page = await fetch(`${base}/admin`, { headers: { cookie: alice.cookie }, redirect: "manual" });
    assert.equal(page.status, 307);
    assert.match(page.headers.get("location") ?? "", /\/admin\/login$/);

    const api = await json("GET", `${base}/api/admin/orders`, { cookie: alice.cookie });
    assert.equal(api.status, 401);
  });

  test("admin sessions cannot read customer data", async () => {
    const res = await json("GET", `${base}/api/orders`, { cookie: adminCookie });
    assert.equal(res.status, 401);
  });

  test("logout clears the session cookie", async () => {
    const session = await signUpCustomer(base, { name: "Logout Tester" });
    const res = await json("DELETE", `${base}/api/customer/session`, { cookie: session.cookie });
    assert.equal(res.status, 200);
    const setCookie = res.res.headers.getSetCookie().find((c) => c.startsWith("meg_customer_session="));
    assert.ok(setCookie, "logout sends a cookie update");
    assert.match(setCookie, /Max-Age=0|Expires=Thu, 01 Jan 1970/i, "the cookie is expired");
  });
});

describe("orders", () => {
  test("a new customer's dashboard data starts empty", async () => {
    const fresh = await signUpCustomer(base, { name: "Fresh Customer" });
    assert.deepEqual((await json("GET", `${base}/api/orders`, { cookie: fresh.cookie })).data.orders, []);
    assert.deepEqual((await json("GET", `${base}/api/customer/payments`, { cookie: fresh.cookie })).data.payments, []);
    const notifications = (await json("GET", `${base}/api/customer/notifications`, { cookie: fresh.cookie })).data;
    assert.deepEqual(notifications.items, []);
    assert.equal(notifications.unreadCount, 0);
    assert.deepEqual((await json("GET", `${base}/api/customer/addresses`, { cookie: fresh.cookie })).data.addresses, []);
    assert.deepEqual((await json("GET", `${base}/api/customer/support`, { cookie: fresh.cookie })).data.tickets, []);
  });

  let orderA;
  let orderB;

  test("an order is saved to the customer's account and listed only for them", async () => {
    orderA = await placeOrder(alice);
    assert.match(orderA.id, /^MEG-\d{6}$/);
    assert.equal(orderA.userId, alice.body.user.id);

    const aliceList = (await json("GET", `${base}/api/orders`, { cookie: alice.cookie })).data.orders;
    assert.equal(aliceList.length, 1);
    assert.equal(aliceList[0].id, orderA.id);
    assert.deepEqual((await json("GET", `${base}/api/orders`, { cookie: bob.cookie })).data.orders, []);
  });

  test("another customer cannot open an order they do not own", async () => {
    const res = await json("GET", `${base}/api/orders/${orderA.id}`, { cookie: bob.cookie });
    assert.equal(res.status, 404);
  });

  test("the owner can open the order with its history", async () => {
    const res = await json("GET", `${base}/api/orders/${orderA.id}`, { cookie: alice.cookie });
    assert.equal(res.status, 200);
    assert.equal(res.data.order.history[0].event, "placed");
  });

  test("a customer can cancel only their own pending order", async () => {
    assert.equal((await json("POST", `${base}/api/orders/${orderA.id}/cancel`, { cookie: bob.cookie })).status, 404);
    const cancelled = await json("POST", `${base}/api/orders/${orderA.id}/cancel`, { cookie: alice.cookie });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.order.status, "cancelled");
    const again = await json("POST", `${base}/api/orders/${orderA.id}/cancel`, { cookie: alice.cookie });
    assert.equal(again.status, 409);
  });

  test("admin confirmation and progress show up in the customer's tracking and notifications", async () => {
    orderB = await placeOrder(alice);

    const confirmed = await json("POST", `${base}/api/orders/${orderB.id}/confirm`, { cookie: adminCookie });
    assert.equal(confirmed.status, 200);
    const afterConfirm = (await json("GET", `${base}/api/orders/${orderB.id}`, { cookie: alice.cookie })).data.order;
    assert.equal(afterConfirm.status, "confirmed");
    assert.equal(afterConfirm.statusOverride, 1);

    const progressed = await json("PATCH", `${base}/api/orders/${orderB.id}`, { cookie: adminCookie, body: { statusOverride: 2 } });
    assert.equal(progressed.status, 200);

    const notifications = (await json("GET", `${base}/api/customer/notifications`, { cookie: alice.cookie })).data;
    const titles = notifications.items.map((n) => n.title);
    assert.ok(titles.includes("Order confirmed"));
    assert.ok(titles.includes("Order: Preparing"));
    assert.ok(notifications.items.every((n) => n.orderId === orderA.id || n.orderId === orderB.id));
    assert.ok(notifications.unreadCount >= 3);

    const marked = await json("POST", `${base}/api/customer/notifications`, { cookie: alice.cookie });
    assert.equal(marked.status, 200);
    assert.equal((await json("GET", `${base}/api/customer/notifications`, { cookie: alice.cookie })).data.unreadCount, 0);

    // Once the order is being prepared, the customer can no longer cancel it.
    assert.equal((await json("POST", `${base}/api/orders/${orderB.id}/cancel`, { cookie: alice.cookie })).status, 409);
  });

  test("payments list one record per order with its current status", async () => {
    const payments = (await json("GET", `${base}/api/customer/payments`, { cookie: alice.cookie })).data.payments;
    assert.equal(payments.length, 2);
    const byOrder = Object.fromEntries(payments.map((p) => [p.orderId, p]));
    assert.equal(byOrder[orderA.id].status, "cancelled");
    assert.equal(byOrder[orderB.id].status, "pending");
    assert.equal(byOrder[orderB.id].method, "cod");
    assert.deepEqual((await json("GET", `${base}/api/customer/payments`, { cookie: bob.cookie })).data.payments, []);
  });

  test("the order detail page loads for its owner (its data comes from the owner-only API)", async () => {
    // The order itself is fetched in the browser, so the server HTML only proves the route exists.
    // Browser tests check the rendered tracking page.
    const owner = await fetch(`${base}/account/orders/${orderB.id}`, { headers: { cookie: alice.cookie } });
    assert.equal(owner.status, 200);
    assert.match(await owner.text(), /Loading order/, "the tracking page renders its loading state");
    const other = await fetch(`${base}/account/orders/${orderB.id}`, { headers: { cookie: bob.cookie } });
    assert.equal(other.status, 200, "the page shell renders; the data call returns not found");
    assert.equal((await json("GET", `${base}/api/orders/${orderB.id}`, { cookie: bob.cookie })).status, 404);
  });
});

describe("addresses", () => {
  let addressId;

  test("invalid addresses are rejected with field errors", async () => {
    const res = await json("POST", `${base}/api/customer/addresses`, { cookie: alice.cookie, body: { label: "", address: "x", area: "" } });
    assert.equal(res.status, 400);
    assert.ok(res.data.errors.label);
    assert.ok(res.data.errors.address);
  });

  test("an address is created, listed and edited", async () => {
    const created = await json("POST", `${base}/api/customer/addresses`, {
      cookie: alice.cookie,
      body: { label: "Home", address: "House 12, Street 4, DHA Phase 5, Lahore", area: "DHA" },
    });
    assert.equal(created.status, 201);
    addressId = created.data.address.id;

    const listed = (await json("GET", `${base}/api/customer/addresses`, { cookie: alice.cookie })).data.addresses;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].label, "Home");

    const edited = await json("PATCH", `${base}/api/customer/addresses/${addressId}`, {
      cookie: alice.cookie,
      body: { label: "Office", address: "Office 3, Main Boulevard, Gulberg, Lahore", area: "Gulberg" },
    });
    assert.equal(edited.status, 200);
    assert.equal(edited.data.address.label, "Office");
  });

  test("another customer cannot see, edit or delete these addresses", async () => {
    assert.deepEqual((await json("GET", `${base}/api/customer/addresses`, { cookie: bob.cookie })).data.addresses, []);
    assert.equal((await json("PATCH", `${base}/api/customer/addresses/${addressId}`, { cookie: bob.cookie, body: { label: "Hacked", address: "Somewhere 1" } })).status, 404);
    assert.equal((await json("DELETE", `${base}/api/customer/addresses/${addressId}`, { cookie: bob.cookie })).status, 404);
  });

  test("a customer can save at most ten addresses", async () => {
    for (let i = 1; i < 10; i += 1) {
      const res = await json("POST", `${base}/api/customer/addresses`, { cookie: alice.cookie, body: { label: `Place ${i}`, address: `Street ${i}, Lahore` } });
      assert.equal(res.status, 201);
    }
    const eleventh = await json("POST", `${base}/api/customer/addresses`, { cookie: alice.cookie, body: { label: "Too many", address: "Street 11, Lahore" } });
    assert.equal(eleventh.status, 409);
  });

  test("an address can be deleted, and deleting it again reports not found", async () => {
    assert.equal((await json("DELETE", `${base}/api/customer/addresses/${addressId}`, { cookie: alice.cookie })).status, 200);
    assert.equal((await json("DELETE", `${base}/api/customer/addresses/${addressId}`, { cookie: alice.cookie })).status, 404);
    const listed = (await json("GET", `${base}/api/customer/addresses`, { cookie: alice.cookie })).data.addresses;
    assert.equal(listed.length, 9);
  });
});

describe("wishlist", () => {
  test("a menu item can be saved, listed and removed", async () => {
    const product = candidates[0];
    assert.equal((await json("POST", `${base}/api/customer/wishlist`, { cookie: bob.cookie, body: { itemId: product.id } })).status, 200);
    const listed = (await json("GET", `${base}/api/customer/wishlist`, { cookie: bob.cookie })).data;
    assert.deepEqual(listed.products.map((p) => p.id), [product.id]);
    assert.deepEqual(listed.unavailableIds, []);

    assert.equal((await json("DELETE", `${base}/api/customer/wishlist/${encodeURIComponent(product.id)}`, { cookie: bob.cookie })).status, 200);
    assert.deepEqual((await json("GET", `${base}/api/customer/wishlist`, { cookie: bob.cookie })).data.products, []);
  });

  test("items that are not on the menu cannot be saved", async () => {
    const res = await json("POST", `${base}/api/customer/wishlist`, { cookie: bob.cookie, body: { itemId: "not-a-real-item" } });
    assert.equal(res.status, 404);
  });

  test("saved items that left the menu are reported as unavailable", async () => {
    const bobDoc = bob.body.user.id;
    await env.db.collection("wishlists").updateOne({ _id: bobDoc }, { $addToSet: { itemIds: "retired-item" } }, { upsert: true });
    const listed = (await json("GET", `${base}/api/customer/wishlist`, { cookie: bob.cookie })).data;
    assert.deepEqual(listed.unavailableIds, ["retired-item"]);
    assert.equal((await json("DELETE", `${base}/api/customer/wishlist/retired-item`, { cookie: bob.cookie })).status, 200);
    assert.deepEqual((await json("GET", `${base}/api/customer/wishlist`, { cookie: bob.cookie })).data.unavailableIds, []);
  });
});

describe("support", () => {
  test("complaints are validated and only linked to the customer's own orders", async () => {
    const short = await json("POST", `${base}/api/customer/support`, { cookie: alice.cookie, body: { topic: "order", message: "too short" } });
    assert.equal(short.status, 400);
    assert.ok(short.data.errors.message);

    const badTopic = await json("POST", `${base}/api/customer/support`, { cookie: alice.cookie, body: { topic: "unknown", message: "The burger was cold on arrival." } });
    assert.equal(badTopic.status, 400);
    assert.ok(badTopic.data.errors.topic);

    const bobOrder = await placeOrder(bob);
    const foreign = await json("POST", `${base}/api/customer/support`, {
      cookie: alice.cookie,
      body: { topic: "order", orderId: bobOrder.id, message: "This is about someone else's order." },
    });
    assert.equal(foreign.status, 400);
    assert.ok(foreign.data.errors.orderId);
  });

  test("a valid complaint is saved and listed only for its author", async () => {
    const orderB = (await json("GET", `${base}/api/orders`, { cookie: alice.cookie })).data.orders.find((o) => o.status === "confirmed");
    const linked = await json("POST", `${base}/api/customer/support`, {
      cookie: alice.cookie,
      body: { topic: "delivery", orderId: orderB.id, message: "The delivery was 30 minutes late." },
    });
    assert.equal(linked.status, 201);
    assert.equal(linked.data.ticket.orderId, orderB.id);

    const plain = await json("POST", `${base}/api/customer/support`, { cookie: alice.cookie, body: { topic: "other", message: "Please add more sauces." } });
    assert.equal(plain.status, 201);
    assert.equal(plain.data.ticket.orderId, null);

    assert.equal((await json("GET", `${base}/api/customer/support`, { cookie: alice.cookie })).data.tickets.length, 2);
    assert.deepEqual((await json("GET", `${base}/api/customer/support`, { cookie: bob.cookie })).data.tickets, []);
  });
});

describe("offers", () => {
  test("only active coupons that have not expired are listed", async () => {
    const coupons = env.db.collection("coupons");
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    await coupons.insertMany([
      { _id: "c1", code: "WELCOME10", title: "Welcome offer", description: "10% off", percentOff: 10, amountOff: null, expiresAt: future, active: true, createdAt: "2026-01-01T00:00:00.000Z" },
      { _id: "c2", code: "OLDDEAL", title: "Old deal", description: "expired", percentOff: 20, amountOff: null, expiresAt: past, active: true, createdAt: "2026-01-02T00:00:00.000Z" },
      { _id: "c3", code: "HIDDEN", title: "Switched off", description: "inactive", percentOff: null, amountOff: 100, expiresAt: null, active: false, createdAt: "2026-01-03T00:00:00.000Z" },
    ]);
    const { coupons: listed } = (await json("GET", `${base}/api/customer/offers`, { cookie: alice.cookie })).data;
    assert.deepEqual(listed.map((c) => c.code), ["WELCOME10"]);
    assert.equal(listed[0].percentOff, 10);
  });
});

describe("profile and password", () => {
  test("name and phone can be updated", async () => {
    const res = await json("PATCH", `${base}/api/customer/profile`, { cookie: alice.cookie, body: { name: "Alice Updated", phone: "03009876543" } });
    assert.equal(res.status, 200);
    const profile = (await json("GET", `${base}/api/customer/profile`, { cookie: alice.cookie })).data.user;
    assert.equal(profile.name, "Alice Updated");
    assert.equal(profile.phone, "03009876543");
  });

  test("the current password must be correct, and the new ones must match", async () => {
    const wrong = await json("PATCH", `${base}/api/customer/password`, { cookie: bob.cookie, body: { current: "WrongPass999", next: "NewPass456", confirm: "NewPass456" } });
    assert.equal(wrong.status, 400);
    assert.match(wrong.data.errors.current, /incorrect/);

    const mismatch = await json("PATCH", `${base}/api/customer/password`, { cookie: bob.cookie, body: { current: TEST_PASSWORD, next: "NewPass456", confirm: "NewPass789" } });
    assert.equal(mismatch.status, 400);
    assert.ok(mismatch.data.errors.confirm);

    const weak = await json("PATCH", `${base}/api/customer/password`, { cookie: bob.cookie, body: { current: TEST_PASSWORD, next: "short", confirm: "short" } });
    assert.equal(weak.status, 400);
    assert.ok(weak.data.errors.next);
  });

  test("a valid change replaces the password", async () => {
    const changed = await json("PATCH", `${base}/api/customer/password`, { cookie: bob.cookie, body: { current: TEST_PASSWORD, next: "NewPass456", confirm: "NewPass456" } });
    assert.equal(changed.status, 200);

    const oldLogin = await json("POST", `${base}/api/customer/session`, { body: { email: bob.email, password: TEST_PASSWORD } });
    assert.equal(oldLogin.status, 401);
    const newLogin = await json("POST", `${base}/api/customer/session`, { body: { email: bob.email, password: "NewPass456" } });
    assert.equal(newLogin.status, 200);
  });
});
