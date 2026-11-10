// Role-based access tests for the staff dashboard. They run against a real `next start` server and a
// throwaway database (see tests/harness.mjs). Every restricted route is checked on the server, so a
// manager gets 403 for areas they were not given, whatever the browser shows.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { TEST_PASSWORD, cookieFrom, json, randomCustomerEmail, randomGmail, signUpCustomer, startTestEnvironment } from "./harness.mjs";

let env;
let base;
let owner;
let managerOrders; // responsibilities: orders
let managerMenu; // responsibilities: menu
let managerCustomers; // responsibilities: customers, changed by the owner during the tests
let customer;
let customerOrder;

const scrypt = (password, salt) =>
  new Promise((resolve, reject) => scryptCallback(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))));

async function hashFor(password) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await scrypt(password, salt)).toString("hex")}`;
}

// The Add Employee form sends a role and an office, and every new manager gets all areas. The owner then
// narrows the areas through the employees API, as the tests need one area per manager.
async function createManager(ownerCookie, areas, name = "Staff Member") {
  const email = randomGmail();
  const res = await json("POST", `${base}/api/admin/accounts`, {
    cookie: ownerCookie,
    body: { name, email, password: TEST_PASSWORD, confirm: TEST_PASSWORD, role: "manager", officeId: await officeId(ownerCookie) },
  });
  assert.equal(res.status, 201, `create manager: ${res.text}`);
  assert.equal(cookieFrom(res.res, "meg_admin_session"), null, "creating a manager must not switch the owner's session");
  const narrowed = await json("PATCH", `${base}/api/admin/employees/${res.data.account.id}`, { cookie: ownerCookie, body: { responsibilities: areas } });
  assert.equal(narrowed.status, 200, `set areas: ${narrowed.text}`);
  return { email, id: res.data.account.id, cookie: await login(email) };
}

// One office shared by the test managers, created through the Offices API the way the owner would.
let sharedOfficeId = null;
async function officeId(ownerCookie) {
  if (!sharedOfficeId) {
    const res = await json("POST", `${base}/api/admin/offices`, { cookie: ownerCookie, body: { name: "Test Office", address: "1 Test Street" } });
    assert.equal(res.status, 201, `create office: ${res.text}`);
    sharedOfficeId = res.data.office.id;
  }
  return sharedOfficeId;
}

async function login(email) {
  const res = await json("POST", `${base}/api/admin/session`, { body: { email, password: TEST_PASSWORD } });
  return res.status === 200 ? cookieFrom(res.res, "meg_admin_session") : null;
}

// A restricted page either answers 307 to the target, or (when the redirect is sent from inside the
// streamed page) answers 200 with a refresh to the target and none of the restricted page.
async function pageRedirectsTo(path, cookie, target, forbiddenText = "Revenue") {
  const res = await fetch(`${base}${path}`, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  if (res.status === 307) return (res.headers.get("location") ?? "").endsWith(target);
  if (res.status !== 200) return false;
  const html = await res.text();
  return html.includes(`url=${target}"`) && !html.includes(forbiddenText);
}

async function placeCustomerOrder() {
  const catalog = await json("GET", `${base}/api/catalog`);
  const candidates = catalog.data.products.filter((p) => p.available !== false && p.stock !== "out" && !p.sizes?.length && !p.flavors?.length);
  for (const product of candidates) {
    const res = await json("POST", `${base}/api/orders`, {
      cookie: customer.cookie,
      body: {
        clientOrderId: randomBytes(12).toString("base64url"),
        customer: { name: "Role Tester", phone: "03001234567", address: "House 1, Street 2, Lahore", notes: "" },
        fulfilment: "delivery",
        lines: [{ id: `line-${randomBytes(4).toString("hex")}`, itemId: product.id, name: product.name, unitPrice: product.price, qty: 1, options: [], instructions: "" }],
      },
    });
    if (res.status === 201) return res.data.order;
  }
  throw new Error("No menu item could be ordered at its listed price");
}

before(async () => {
  env = await startTestEnvironment();
  base = env.base;

  const setup = await json("POST", `${base}/api/admin/accounts`, {
    body: { name: "Olivia Owner", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD },
  });
  assert.equal(setup.status, 201, "initial owner setup");
  owner = { id: setup.data.account.id, cookie: cookieFrom(setup.res, "meg_admin_session"), role: setup.data.account.role };
  assert.equal(owner.role, "owner");

  customer = await signUpCustomer(base, { name: "Role Customer", email: randomCustomerEmail() });
  customerOrder = await placeCustomerOrder();

  managerOrders = await createManager(owner.cookie, ["orders"], "Orders Manager");
  managerMenu = await createManager(owner.cookie, ["menu"], "Menu Manager");
  managerCustomers = await createManager(owner.cookie, ["customers"], "Customers Manager");
  assert.ok(managerOrders.cookie && managerMenu.cookie && managerCustomers.cookie, "managers can sign in");
});

after(async () => {
  await env?.stop();
});

describe("owner access", () => {
  test("the owner sees the employees list, with the owner first", async () => {
    const res = await json("GET", `${base}/api/admin/employees`, { cookie: owner.cookie });
    assert.equal(res.status, 200);
    assert.equal(res.data.staff[0].role, "owner");
    assert.ok(res.data.staff.some((s) => s.name === "Orders Manager" && s.role === "manager" && s.responsibilities.join() === "orders"));
  });

  test("the owner reaches orders, customers and the finance dashboard", async () => {
    assert.equal((await json("GET", `${base}/api/admin/orders`, { cookie: owner.cookie })).status, 200);
    assert.equal((await json("GET", `${base}/api/admin/customers`, { cookie: owner.cookie })).status, 200);
    assert.equal((await fetch(`${base}/admin/analytics`, { headers: { cookie: owner.cookie }, redirect: "manual" })).status, 200);
    assert.equal((await fetch(`${base}/admin/employees`, { headers: { cookie: owner.cookie }, redirect: "manual" })).status, 200);
  });

  test("a manager is created with the role and office chosen in the form", async () => {
    const office = await officeId(owner.cookie);
    const res = await json("POST", `${base}/api/admin/accounts`, {
      cookie: owner.cookie,
      body: { name: "Office Manager", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD, role: "manager", officeId: office },
    });
    assert.equal(res.status, 201, res.text);
    assert.equal(res.data.account.role, "manager");
    assert.equal(res.data.account.officeId, office);
    assert.equal(res.data.account.officeName, "Test Office");
    assert.equal(res.data.account.responsibilities.join(), "orders,menu,customers", "a new manager gets every area");

    const listed = (await json("GET", `${base}/api/admin/employees`, { cookie: owner.cookie })).data.staff.find((s) => s.id === res.data.account.id);
    assert.equal(listed.role, "manager", "the saved role is shown in the employees list");
    assert.equal(listed.officeName, "Test Office", "the saved office is shown in the employees list");
  });

  test("a role the owner cannot assign is refused, and so is a missing role", async () => {
    const missing = await json("POST", `${base}/api/admin/accounts`, {
      cookie: owner.cookie,
      body: { name: "Nobody", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD, officeId: await officeId(owner.cookie) },
    });
    assert.equal(missing.status, 400);
    assert.ok(missing.data.errors.role);

    const ownerRole = await json("POST", `${base}/api/admin/accounts`, {
      cookie: owner.cookie,
      body: { name: "Nobody", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD, role: "owner", officeId: await officeId(owner.cookie) },
    });
    assert.equal(ownerRole.status, 400, "a second owner cannot be created from the form");
    assert.ok(ownerRole.data.errors.role);
  });

  test("a manager needs an office that exists", async () => {
    const noOffice = await json("POST", `${base}/api/admin/accounts`, {
      cookie: owner.cookie,
      body: { name: "Nobody", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD, role: "manager" },
    });
    assert.equal(noOffice.status, 400);
    assert.ok(noOffice.data.errors.officeId);

    const unknown = await json("POST", `${base}/api/admin/accounts`, {
      cookie: owner.cookie,
      body: { name: "Nobody", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD, role: "manager", officeId: "office-does-not-exist" },
    });
    assert.equal(unknown.status, 400);
    assert.ok(unknown.data.errors.officeId);
  });

  test("the owner can move a manager to another office", async () => {
    const created = await json("POST", `${base}/api/admin/accounts`, {
      cookie: owner.cookie,
      body: { name: "Mover", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD, role: "manager", officeId: await officeId(owner.cookie) },
    });
    assert.equal(created.status, 201, created.text);
    const second = await json("POST", `${base}/api/admin/offices`, { cookie: owner.cookie, body: { name: "Second Office", address: "" } });
    assert.equal(second.status, 201, second.text);
    const moved = await json("PATCH", `${base}/api/admin/employees/${created.data.account.id}`, { cookie: owner.cookie, body: { officeId: second.data.office.id } });
    assert.equal(moved.status, 200, moved.text);
    assert.equal(moved.data.member.officeName, "Second Office");
  });

  test("owner accounts cannot be edited through the employees API", async () => {
    const res = await json("PATCH", `${base}/api/admin/employees/${owner.id}`, { cookie: owner.cookie, body: { active: false } });
    assert.equal(res.status, 403);
  });
});

describe("manager with the orders area", () => {
  test("can sign in and reach orders", async () => {
    assert.equal((await json("GET", `${base}/api/admin/orders`, { cookie: managerOrders.cookie })).status, 200);
  });

  test("is refused every other area on the server", async () => {
    const c = managerOrders.cookie;
    assert.equal((await json("GET", `${base}/api/admin/customers`, { cookie: c })).status, 403);
    assert.equal((await json("PUT", `${base}/api/admin/products`, { cookie: c, body: { products: [] } })).status, 403);
    assert.equal((await json("PUT", `${base}/api/admin/categories`, { cookie: c, body: { categories: [] } })).status, 403);
    assert.equal((await json("GET", `${base}/api/admin/employees`, { cookie: c })).status, 403);
    assert.equal((await json("PATCH", `${base}/api/admin/employees/${managerMenu.id}`, { cookie: c, body: { active: false } })).status, 403);
    assert.equal((await json("POST", `${base}/api/admin/accounts`, { cookie: c, body: { name: "Sneaky", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD, responsibilities: ["orders"] } })).status, 403);
  });

  test("can confirm and progress an order for a customer", async () => {
    const c = managerOrders.cookie;
    assert.equal((await json("POST", `${base}/api/orders/${customerOrder.id}/confirm`, { cookie: c })).status, 200);
    assert.equal((await json("PATCH", `${base}/api/orders/${customerOrder.id}`, { cookie: c, body: { statusOverride: 2 } })).status, 200);
  });

  test("a manager with no orders area cannot read or change an order", async () => {
    assert.equal((await json("GET", `${base}/api/orders/${customerOrder.id}`, { cookie: managerMenu.cookie })).status, 403);
    assert.equal((await json("POST", `${base}/api/orders/${customerOrder.id}/cancel`, { cookie: managerMenu.cookie })).status, 403);
    assert.equal((await json("POST", `${base}/api/orders/${customerOrder.id}/confirm`, { cookie: managerMenu.cookie })).status, 403);
  });

  test("the dashboard home is open, but finance and other areas redirect back to it", async () => {
    const c = managerOrders.cookie;
    const home = await fetch(`${base}/admin`, { headers: { cookie: c }, redirect: "manual" });
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /Welcome, (<!-- -->)?Orders Manager/);
    assert.doesNotMatch(html, /Revenue/, "the finance figures are not on the manager home");

    for (const path of ["/admin/analytics", "/admin/employees", "/admin/customers", "/admin/products"]) {
      assert.ok(await pageRedirectsTo(path, c, "/admin"), `${path} goes back to the home page without its content`);
    }
    assert.equal((await fetch(`${base}/admin/orders`, { headers: { cookie: c }, redirect: "manual" })).status, 200);
  });
});

describe("manager with the menu area", () => {
  test("can save the menu, and is refused orders and customers", async () => {
    const catalog = await json("GET", `${base}/api/catalog`);
    const save = await json("PUT", `${base}/api/admin/products`, { cookie: managerMenu.cookie, body: { products: catalog.data.products } });
    assert.equal(save.status, 200, save.text);
    assert.equal((await json("GET", `${base}/api/admin/orders`, { cookie: managerMenu.cookie })).status, 403);
    assert.equal((await json("GET", `${base}/api/admin/customers`, { cookie: managerMenu.cookie })).status, 403);
    assert.ok(await pageRedirectsTo("/admin/orders", managerMenu.cookie, "/admin"));
  });
});

describe("owner changes a manager", () => {
  test("changing areas takes effect immediately", async () => {
    const changed = await json("PATCH", `${base}/api/admin/employees/${managerMenu.id}`, { cookie: owner.cookie, body: { responsibilities: ["customers"] } });
    assert.equal(changed.status, 200);
    assert.equal((await json("GET", `${base}/api/admin/customers`, { cookie: managerMenu.cookie })).status, 200);
    assert.equal((await json("PUT", `${base}/api/admin/products`, { cookie: managerMenu.cookie, body: { products: [] } })).status, 403);
  });

  test("an empty list of areas is refused", async () => {
    const res = await json("PATCH", `${base}/api/admin/employees/${managerMenu.id}`, { cookie: owner.cookie, body: { responsibilities: [] } });
    assert.equal(res.status, 400);
  });

  test("switching a manager off signs them out straight away, and they cannot sign back in until switched on", async () => {
    const off = await json("PATCH", `${base}/api/admin/employees/${managerCustomers.id}`, { cookie: owner.cookie, body: { active: false } });
    assert.equal(off.status, 200);
    assert.equal(off.data.member.active, false);

    assert.equal((await json("GET", `${base}/api/admin/customers`, { cookie: managerCustomers.cookie })).status, 401);
    assert.equal(await login(managerCustomers.email), null, "a switched-off manager cannot log in");
    assert.ok(await pageRedirectsTo("/admin", managerCustomers.cookie, "/admin/login", "Welcome"));

    const on = await json("PATCH", `${base}/api/admin/employees/${managerCustomers.id}`, { cookie: owner.cookie, body: { active: true } });
    assert.equal(on.status, 200);
    assert.equal((await json("GET", `${base}/api/admin/customers`, { cookie: managerCustomers.cookie })).status, 200);
  });

  test("a manager cannot change the employees list", async () => {
    const res = await json("PATCH", `${base}/api/admin/employees/${managerMenu.id}`, { cookie: managerMenu.cookie, body: { active: false } });
    assert.equal(res.status, 403);
  });
});

describe("legacy admin accounts", () => {
  test("an admin saved before roles existed is treated as an owner", async () => {
    const email = randomGmail();
    await env.db.collection("admins").insertOne({
      _id: "admin-legacy",
      name: "Legacy Admin",
      email,
      passwordHash: await hashFor(TEST_PASSWORD),
      createdAt: new Date().toISOString(),
    });
    const cookie = await login(email);
    assert.ok(cookie, "the legacy account can log in");
    assert.equal((await json("GET", `${base}/api/admin/employees`, { cookie })).status, 200);
    assert.equal((await json("GET", `${base}/api/admin/orders`, { cookie })).status, 200);
  });
});

describe("customers stay separate from staff", () => {
  test("a customer session cannot use staff areas or pages", async () => {
    assert.equal((await json("GET", `${base}/api/admin/employees`, { cookie: customer.cookie })).status, 401);
    assert.equal((await json("GET", `${base}/api/admin/orders`, { cookie: customer.cookie })).status, 401);
    const page = await fetch(`${base}/admin/employees`, { headers: { cookie: customer.cookie }, redirect: "manual" });
    assert.equal(page.status, 307);
  });

  test("a staff session cannot use the customer dashboard API", async () => {
    assert.equal((await json("GET", `${base}/api/orders`, { cookie: managerOrders.cookie })).status, 401);
    assert.equal((await json("GET", `${base}/api/customer/addresses`, { cookie: owner.cookie })).status, 401);
  });
});
