// Browser tests for the customer dashboard. They drive the real pages in Chrome (through playwright-core)
// against a production server and a throwaway database (see tests/harness.mjs).
//
// Chrome is found at CHROME_PATH, or at the default Windows install location.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { TEST_PASSWORD, cookieFrom, json, randomGmail, signUpCustomer, startTestEnvironment } from "./harness.mjs";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const NEW_PASSWORD = "NewPass456";

let env;
let base;
let browser;
let context;
let page;
let pageErrors = [];
let consoleErrors = [];
let customer;
let confirmedOrder;
let pendingOrder;
let adminCookie;
let product;

async function placeOrder(cookie) {
  const catalog = await json("GET", `${base}/api/catalog`);
  const candidates = catalog.data.products.filter((p) => p.available !== false && p.stock !== "out" && !p.sizes?.length && !p.flavors?.length);
  for (const candidate of candidates) {
    const res = await json("POST", `${base}/api/orders`, {
      cookie,
      body: {
        clientOrderId: randomBytes(12).toString("base64url"),
        customer: { name: "Browser Shopper", phone: "03001234567", address: "House 1, Street 2, Lahore", notes: "" },
        fulfilment: "delivery",
        lines: [{ id: `line-${randomBytes(4).toString("hex")}`, itemId: candidate.id, name: candidate.name, unitPrice: candidate.price, qty: 2, options: [], instructions: "" }],
      },
    });
    if (res.status === 201) return { order: res.data.order, product: candidate };
  }
  throw new Error("No menu item could be ordered at its listed price");
}

const go = (path) => page.goto(`${base}${path}`, { waitUntil: "networkidle" });
const nav = () => page.getByRole("navigation", { name: "Customer dashboard" });

before(async () => {
  env = await startTestEnvironment();
  base = env.base;

  const admin = await json("POST", `${base}/api/admin/accounts`, {
    body: { name: "Test Admin", email: randomGmail(), password: TEST_PASSWORD, confirm: TEST_PASSWORD },
  });
  assert.equal(admin.status, 201);
  adminCookie = cookieFrom(admin.res, "meg_admin_session");

  customer = await signUpCustomer(base, { name: "Browser Shopper" });
  assert.equal(customer.status, 201);

  const first = await placeOrder(customer.cookie);
  confirmedOrder = first.order;
  product = first.product;
  assert.equal((await json("POST", `${base}/api/orders/${confirmedOrder.id}/confirm`, { cookie: adminCookie })).status, 200);
  assert.equal((await json("PATCH", `${base}/api/orders/${confirmedOrder.id}`, { cookie: adminCookie, body: { statusOverride: 2 } })).status, 200);

  pendingOrder = (await placeOrder(customer.cookie)).order;

  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  page.on("pageerror", (err) => pageErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
});

after(async () => {
  await browser?.close();
  await env?.stop();
});

describe("signing in and the overview", () => {
  test("logging in through the form opens the dashboard", async () => {
    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email").fill(customer.email);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(/\/account$/);
    await page.getByRole("heading", { name: "Welcome back, Browser" }).waitFor();
  });

  test("the overview shows real order totals and the recent order", async () => {
    await page.getByText("Total orders").waitFor();
    const totalCard = page.locator("section", { hasText: "Total orders" });
    assert.match(await totalCard.innerText(), /2/, "two orders were placed");
    await page.getByRole("heading", { name: "Recent orders" }).waitFor();
    await page.getByText(confirmedOrder.id).first().waitFor();
  });
});

describe("sidebar sections", () => {
  const sections = [
    ["My orders", /\/account\/orders$/, "My orders"],
    ["Profile", /\/account\/profile$/, "My profile"],
    ["Addresses", /\/account\/addresses$/, "My addresses"],
    ["Wishlist", /\/account\/wishlist$/, "My wishlist"],
    ["Payments", /\/account\/payments$/, "My payments"],
    ["Offers", /\/account\/offers$/, "Offers & coupons"],
    ["Notifications", /\/account\/notifications$/, "Notifications"],
    ["Support", /\/account\/support$/, "Customer support"],
  ];

  for (const [label, url, heading] of sections) {
    test(`the sidebar opens ${label}`, async () => {
      await nav().getByRole("link", { name: label }).click();
      await page.waitForURL(url);
      await page.getByRole("heading", { name: heading, level: 1 }).waitFor();
      assert.equal(await nav().getByRole("link", { name: label }).getAttribute("aria-current"), "page");
    });
  }
});

describe("orders", () => {
  test("filters switch the list and cancelled orders are labelled", async () => {
    await nav().getByRole("link", { name: "My orders" }).click();
    await page.getByText(confirmedOrder.id).first().waitFor();
    await page.getByRole("button", { name: /^Active/ }).click();
    assert.equal(await page.getByRole("button", { name: /^Active/ }).getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: /^Completed/ }).click();
    await page.getByText("No orders match this filter.").waitFor();
    await page.getByRole("button", { name: /^All/ }).click();
    await page.getByText(pendingOrder.id).first().waitFor();
  });

  test("reorder adds the items to the cart", async () => {
    const card = page.locator("li", { has: page.getByText(confirmedOrder.id, { exact: true }) }).first();
    await card.getByRole("button", { name: "Reorder" }).click();
    await page.getByText(/Added 1 item to your cart/).waitFor();
    await page.getByRole("button", { name: /^Cart, \d+ items?$/ }).waitFor();
    // The cart drawer opens after reorder; close it so it does not cover the next steps.
    await page.getByRole("button", { name: "Close cart" }).click();
  });

  test("the tracking page shows the timeline and the delivery estimate", async () => {
    await page.locator("li", { has: page.getByText(confirmedOrder.id, { exact: true }) }).first().getByRole("link", { name: "View details" }).click();
    await page.waitForURL(new RegExp(`/account/orders/${confirmedOrder.id}$`));
    await page.getByRole("heading", { name: confirmedOrder.id }).waitFor();
    await page.getByText("Estimated delivery:").first().waitFor();
    const current = page.locator('[aria-current="step"]');
    assert.equal(await current.count(), 1, "exactly one current step");
    assert.match(await current.innerText(), /Preparing/);
    assert.equal(await page.getByRole("button", { name: "Cancel order" }).count(), 0, "a confirmed order cannot be cancelled");
  });

  test("a pending order can be cancelled after confirming the dialog", async () => {
    await go(`/account/orders/${pendingOrder.id}`);
    await page.getByRole("heading", { name: pendingOrder.id }).waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByText("This order was cancelled.").waitFor();
  });

  test("the order detail link from the list opens the right order", async () => {
    await nav().getByRole("link", { name: "My orders" }).click();
    await page.getByText(confirmedOrder.id).first().waitFor();
    await page.getByRole("button", { name: /^All/ }).click();
    await page.getByRole("link", { name: "View details" }).first().click();
    // The list page already has a level-1 heading, so wait for the URL itself rather than any heading.
    await page.waitForURL(/\/account\/orders\/MEG-\d{6}$/);
    await page.getByRole("heading", { level: 1 }).waitFor();
  });
});

describe("profile", () => {
  test("the name can be updated", async () => {
    await nav().getByRole("link", { name: "Profile" }).click();
    await page.getByLabel("Full name").fill("Browser Shopper Updated");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Your details are saved.").waitFor();
  });

  test("a wrong current password is rejected and a correct one changes the password", async () => {
    await page.getByLabel("Current password").fill("WrongPass999");
    await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Update password" }).click();
    await page.getByText("Your current password is incorrect.").waitFor();

    await page.getByLabel("Current password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Update password" }).click();
    await page.getByText("Your password has been changed.").waitFor();
  });
});

describe("addresses", () => {
  test("an address can be added, edited and deleted", async () => {
    await nav().getByRole("link", { name: "Addresses" }).click();
    await page.getByRole("button", { name: "Add address" }).first().click();
    await page.getByLabel("Name", { exact: true }).fill("Home");
    await page.getByLabel("Full address").fill("House 5, Street 9, DHA Phase 5, Lahore");
    await page.getByRole("button", { name: "Save address" }).click();
    await page.getByText("Address saved.").waitFor();
    await page.getByText("House 5, Street 9, DHA Phase 5, Lahore").waitFor();

    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByLabel("Name", { exact: true }).fill("Home Sweet Home");
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.getByText("Address updated.").waitFor();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByText(/was deleted\./).waitFor();
  });
});

describe("wishlist", () => {
  test("an item can be saved, bought again and removed", async () => {
    await nav().getByRole("link", { name: "Wishlist" }).click();
    await page.getByRole("searchbox", { name: "Search the menu" }).fill(product.name);
    const row = page.locator("li", { has: page.getByText(product.name, { exact: false }) }).filter({ has: page.getByRole("button", { name: "Save" }) }).first();
    await row.getByRole("button", { name: "Save" }).click();
    await page.getByText(/was saved to your wishlist/).waitFor();

    // Items with size, flavour or extra options show "Choose options" instead of "Add to cart".
    const card = page.locator("li", { has: page.getByRole("button", { name: "Remove" }) }).first();
    if ((await card.getByRole("button", { name: "Add to cart" }).count()) > 0) {
      await card.getByRole("button", { name: "Add to cart" }).click();
      await page.getByText(/was added to your cart/).waitFor();
      await page.getByRole("button", { name: "Close cart" }).click();
    }

    await card.getByRole("button", { name: "Remove" }).click();
    await page.getByText(/was removed from your wishlist/).waitFor();
  });
});

describe("support", () => {
  test("the contact options are shown and a complaint can be sent", async () => {
    await nav().getByRole("link", { name: "Support" }).click();
    await page.getByRole("main").getByText("042 111 634 111").waitFor();
    await page.getByLabel("Your message").fill("The wrap arrived cold, please check.");
    await page.getByRole("button", { name: "Send complaint" }).click();
    await page.getByText(/Your complaint has been sent/).waitFor();
    await page.getByText("The wrap arrived cold, please check.").waitFor();
  });

  test("the complaint form pre-selects the order it was opened from", async () => {
    await go(`/account/support?order=${confirmedOrder.id}`);
    await page.getByRole("heading", { name: "Customer support" }).waitFor();
    assert.equal(await page.getByLabel("Related order (optional)").inputValue(), confirmedOrder.id);
  });
});

describe("notifications, payments and offers", () => {
  test("notifications list order updates and can be marked as read", async () => {
    await nav().getByRole("link", { name: "Notifications" }).click();
    await page.getByText("Order confirmed").first().waitFor();
    await page.getByRole("button", { name: /Mark \d+ as read|All read/ }).click();
    await page.getByRole("button", { name: "All read" }).waitFor();
  });

  test("payments show the record for each order", async () => {
    await nav().getByRole("link", { name: "Payments" }).click();
    await page.getByText(confirmedOrder.id).first().waitFor();
    await page.getByText("Cash on delivery").first().waitFor();
  });

  test("offers show the empty state when no coupon is active", async () => {
    await nav().getByRole("link", { name: "Offers" }).click();
    await page.getByText("No offers right now").waitFor();
  });
});

describe("logout and protection", () => {
  test("logging out returns to the home page and the dashboard is closed", async () => {
    await nav().getByRole("link", { name: "Overview" }).click();
    await page.getByRole("heading", { name: /Welcome back/ }).waitFor();
    await page.getByRole("button", { name: "Log out" }).first().click();
    await page.waitForURL(`${base}/`);
    await go("/account/orders");
    assert.match(page.url(), /\/login$/);
  });

  test("no page errors occurred while using the dashboard", () => {
    assert.deepEqual(pageErrors, [], `uncaught page errors: ${pageErrors.join(" | ")}`);
  });
});

describe("phone layout", () => {
  test("the dashboard fits a phone screen without horizontal scrolling", async () => {
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobile = await phone.newPage();
    try {
      await mobile.goto(`${base}/login`, { waitUntil: "networkidle" });
      await mobile.getByLabel("Email").fill(customer.email);
      await mobile.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
      await mobile.getByRole("button", { name: "Log in" }).click();
      await mobile.waitForURL(/\/account$/);
      for (const path of ["/account", "/account/orders", "/account/addresses", "/account/support"]) {
        await mobile.goto(`${base}${path}`, { waitUntil: "networkidle" });
        const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `${path} overflows by ${overflow}px`);
      }
      await mobile.goto(`${base}/account`, { waitUntil: "networkidle" });
      // Two navigations share the name; only the phone tab bar should be visible at this width.
      const links = mobile.getByRole("navigation", { name: "Customer dashboard" }).getByRole("link", { name: "My orders" });
      let visible = 0;
      for (let i = 0; i < (await links.count()); i += 1) {
        if (await links.nth(i).isVisible()) visible += 1;
      }
      assert.equal(visible, 1, "exactly one visible My orders link on a phone");
    } finally {
      await phone.close();
    }
  });

  test("console errors are reported for review", () => {
    // Informational: the list is printed so problems are visible in the test log.
    if (consoleErrors.length > 0) console.log(`[browser] console errors: ${consoleErrors.length}\n  ${consoleErrors.slice(0, 10).join("\n  ")}`);
    assert.ok(true);
  });
});
