// The app's data endpoints. src/app/api/[...path]/route.ts sends every /api/... request here, on the
// server. Each handler checks the caller's session (an httpOnly cookie backed by MongoDB) before it
// reads or changes anything; nothing here trusts the browser's own idea of who is signed in.

import "server-only";
import { MongoError } from "mongodb";
import { readBody, apiError, json, text, trustedClientIp } from "@/lib/server/http";
import { DatabaseConfigError, DatabaseUnavailableError, databaseErrorResponse, getDatabaseStatus } from "@/lib/server/collections";
import { createCustomer, verifyCustomer, changeCustomerPassword, listCustomers, updateCustomerProfile } from "@/lib/server/customers";
import { createAdditionalAdminAccount, createAdminSignupAccount, createManagerAccount, createOwnerAccount, deleteOwnerAccount, hasAdminAccounts, listStaff, updateStaff, verifyAdminCredentials } from "@/lib/server/adminAccounts";
import { endAdminSession, getAdminSession, cleanDemoName, demoAccount, startAdminSession, startDemoSession } from "@/lib/server/adminSession";
import { endSessionsFor } from "@/lib/server/session";
import { addPayEntry, changeAttendance, readAttendanceDay, readPayroll, readStaffProfile, removePayEntry, setPayrollPaid } from "@/lib/server/staffHr";
import { endCustomerSession, getCustomerSession, startCustomerSession } from "@/lib/server/customerSession";
import { checkStaff } from "@/lib/server/staff";
import { readCatalog, replaceCategories, replaceProducts } from "@/lib/server/catalog";
import { getSavedCart, saveCart, sanitizeCartLine, MAX_CART_LINES } from "@/lib/server/carts";
import { listAddresses, createAddress, updateAddress, deleteAddress } from "@/lib/server/addresses";
import { getWishlist, addToWishlist, removeFromWishlist } from "@/lib/server/wishlist";
import { listNotifications, markNotificationsRead } from "@/lib/server/notifications";
import { listPaymentsForUser } from "@/lib/server/payments";
import { listActiveCoupons } from "@/lib/server/coupons";
import { createTicket, listTickets } from "@/lib/server/support";
import { assignRider, cancelOrder, confirmOrder, createOrder, getOrderForActor, listAllOrders, listOrdersForUser, setOrderProgress } from "@/lib/server/orders";
import { currentActor } from "@/lib/server/actor";
import { createTeamMember, getOwnerDetails, updateTeamMember } from "@/lib/server/staffMembers";
import { createRestaurant, findRestaurant, listRestaurants, listRestaurantsForCustomers } from "@/lib/server/restaurants";
import { addGroceryItem, updateGroceryItem, addPurchase, saveAttendance, addRider, updateRiderStatus, setRiderLocation } from "@/lib/server/restaurantRecords";
import { getRestaurantDetail } from "@/lib/server/restaurantDetail";
import { isBlocked, recordFailure, clearFailures, DEFAULT_MAX_FAILURES, type Bucket } from "@/lib/server/rateLimit";
import { addTable, addWaiter, assignTables, completeOrder, createTakeaway, markCleaned, markReady, orderForTable, readCafe, readHistory, readWaiterOrders, readWaiterPerformance, removeWaiter, saveSettings, setTableCount } from "@/lib/server/cafe";
import { addItem, readStock, recordPurchase, recordUsage, removeItem, saveRecipe, updateItem } from "@/lib/server/stock";
import { addStaff, listStaffDirectory, removeStaffRecord, updateStaffRecord } from "@/lib/server/cafeStaff";
import { readDashboard } from "@/lib/server/dashboard";
import { isValidEmail } from "@/lib/validation";
import { homeForRole, type Permission } from "@/lib/permissions";
import type { CartLine } from "@/types";

type Handler = (request: Request, params: string[]) => Promise<Response>;
type Route = { method: string; pattern: RegExp; handler: Handler };

const LOGIN_BLOCKED = "Too many failed attempts. Please wait 15 minutes and try again.";
// POST /api/admin/admins is for a signed-in Admin; anyone else can use the public sign-up instead.
const ADDITIONAL_ADMIN_REFUSED = "Only a signed-in Admin can use this. To create an Admin account, use Sign Up on /admin/login.";
const LOG_IN = "Please log in first.";

// Failed attempts allowed per visitor IP (all accounts together) when a trusted proxy reports the IP.
// Higher than the per-account limit, because several people can share one address (an office or a phone
// network).
const MAX_FAILURES_PER_IP = 50;

// Rate-limit buckets for a login attempt. The account bucket is keyed by the normalised email and is
// shared by /login and /admin/login, so the two pages do not give separate allowances for one account.
// The IP bucket is added only when the IP comes from a trusted proxy (see trustedClientIp); client-sent
// forwarding headers are never used, so changing them does not reset the count.
function loginBuckets(request: Request, email: string): { account: Bucket; all: Bucket[] } {
  const account: Bucket = { key: `login:account:${email.trim().toLowerCase()}`, max: DEFAULT_MAX_FAILURES };
  const ip = trustedClientIp(request);
  return { account, all: ip ? [account, { key: `login:ip:${ip}`, max: MAX_FAILURES_PER_IP }] : [account] };
}

const routes: Route[] = [
  // Public menu
  {
    method: "GET",
    pattern: /^\/api\/catalog$/,
    handler: async () => json(await readCatalog()),
  },

  // Customer accounts
  {
    method: "POST",
    pattern: /^\/api\/customers$/,
    handler: async (request) => {
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await createCustomer({
        name: text(body.name),
        email: text(body.email),
        phone: text(body.phone),
        password: text(body.password),
        confirm: text(body.confirm),
      });
      if (!result.ok) return apiError(400, "Please correct the highlighted fields.", result.errors);
      await startCustomerSession(result.user.id);
      return json({ ok: true, user: result.user }, 201);
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/customer\/session$/,
    handler: async (request) => {
      const body = await readBody(request);
      const email = text(body?.email);
      const password = text(body?.password);
      const emailError = isValidEmail(email);
      if (emailError || !password) {
        return apiError(400, "Please correct the highlighted fields.", {
          ...(emailError ? { email: emailError } : {}),
          ...(password ? {} : { password: "Please enter your password." }),
        });
      }
      const buckets = loginBuckets(request, email);
      const key = buckets.account.key;
      if (isBlocked(buckets.all)) return apiError(429, LOGIN_BLOCKED);
      const user = await verifyCustomer(email, password);
      if (!user) {
        // Owners are stored as admin accounts, not customers. The /login page accepts their saved
        // credentials too: a match signs them in to the Owner dashboard (or, for the Admin, the Admin
        // dashboard) instead of a customer account.
        const owner = await verifyAdminCredentials(email, password);
        if (owner) {
          clearFailures(key);
          await startAdminSession(owner.id);
          return json({ ok: true, owner: { id: owner.id, name: owner.name, email: owner.email }, redirect: homeForRole(owner.role) });
        }
        recordFailure(buckets.all);
        return apiError(401, "Email or password is incorrect.");
      }
      clearFailures(key);
      await startCustomerSession(user.id);
      return json({ ok: true, user });
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/customer\/session$/,
    handler: async () => {
      await endCustomerSession();
      return json({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/customer\/profile$/,
    handler: async () => json({ user: await getCustomerSession() }),
  },
  {
    method: "PATCH",
    pattern: /^\/api\/customer\/profile$/,
    handler: async (request) => {
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      const result = await updateCustomerProfile(session.id, { name: text(body.name), phone: text(body.phone) });
      if (!result.ok) return apiError(400, "Please correct the highlighted fields.", result.errors);
      return json({ ok: true, user: result.user });
    },
  },
  {
    method: "PATCH",
    pattern: /^\/api\/customer\/password$/,
    handler: async (request) => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      const key = `password:${session.id}`;
      if (isBlocked(key)) return apiError(429, LOGIN_BLOCKED);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await changeCustomerPassword(session.id, {
        current: text(body.current),
        next: text(body.next),
        confirm: text(body.confirm),
      });
      if (!result.ok) {
        if (result.wrongCurrent) recordFailure(key);
        return apiError(400, "Please correct the highlighted fields.", result.errors);
      }
      clearFailures(key);
      return json({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/customer\/addresses$/,
    handler: async () => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      return json({ addresses: await listAddresses(session.id) });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/customer\/addresses$/,
    handler: async (request) => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await createAddress(session.id, { label: text(body.label), address: text(body.address), area: text(body.area) });
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, address: result.address }, 201);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/api\/customer\/addresses\/([^/]+)$/,
    handler: async (request, [id]) => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await updateAddress(session.id, id, { label: text(body.label), address: text(body.address), area: text(body.area) });
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, address: result.address });
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/customer\/addresses\/([^/]+)$/,
    handler: async (_request, [id]) => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      if (!(await deleteAddress(session.id, id))) return apiError(404, "Address not found.");
      return json({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/customer\/cart$/,
    handler: async () => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      return json({ lines: await getSavedCart(session.id) });
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/customer\/cart$/,
    handler: async (request) => {
      const body = await readBody(request);
      if (!body || !Array.isArray(body.lines) || body.lines.length > MAX_CART_LINES) return apiError(400, "Invalid cart.");
      const lines: CartLine[] = [];
      for (const raw of body.lines) {
        const line = sanitizeCartLine(raw);
        if (!line) return apiError(400, "Invalid cart.");
        lines.push(line);
      }
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      await saveCart(session.id, lines);
      return json({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/customer\/wishlist$/,
    handler: async () => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      return json(await getWishlist(session.id));
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/customer\/wishlist$/,
    handler: async (request) => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      const body = await readBody(request);
      const itemId = text(body?.itemId).trim();
      if (!itemId || itemId.length > 80) return apiError(400, "Invalid request.");
      const result = await addToWishlist(session.id, itemId);
      if (!result.ok) return apiError(result.status, result.error);
      return json({ ok: true });
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/customer\/wishlist\/([^/]+)$/,
    handler: async (_request, [itemId]) => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      await removeFromWishlist(session.id, decodeURIComponent(itemId));
      return json({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/customer\/notifications$/,
    handler: async () => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      return json(await listNotifications(session.id));
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/customer\/notifications$/,
    handler: async () => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      await markNotificationsRead(session.id);
      return json({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/customer\/payments$/,
    handler: async () => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      return json({ payments: await listPaymentsForUser(session.id) });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/customer\/offers$/,
    handler: async () => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      return json({ coupons: await listActiveCoupons() });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/customer\/support$/,
    handler: async () => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      return json({ tickets: await listTickets(session.id) });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/customer\/support$/,
    handler: async (request) => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, LOG_IN);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await createTicket(session.id, { topic: body.topic, orderId: body.orderId, message: body.message });
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, ticket: result.ticket }, 201);
    },
  },

  // Orders
  {
    method: "GET",
    pattern: /^\/api\/orders$/,
    handler: async () => {
      const session = await getCustomerSession();
      if (!session) return apiError(401, "Please log in to see your orders.");
      return json({ orders: await listOrdersForUser(session.id) });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/orders$/,
    handler: async (request) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return apiError(400, "Invalid request.");
      }
      const session = await getCustomerSession();
      const result = await createOrder(body, session?.id ?? null);
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, order: result.order }, result.created ? 201 : 200);
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/orders\/([^/]+)$/,
    handler: async (_request, [id]) => {
      const actor = await currentActor();
      if (!actor) return apiError(401, "Please log in.");
      if ("admin" in actor) {
        const check = await checkStaff("orders");
        if (!check.ok) return apiError(check.status, check.error);
      }
      const order = await getOrderForActor(id, actor);
      if (!order) return apiError(404, "Order not found.");
      return json({ order });
    },
  },
  {
    method: "PATCH",
    pattern: /^\/api\/orders\/([^/]+)$/,
    handler: async (request, [id]) => {
      const actor = await currentActor();
      if (!actor) return apiError(401, "Please log in.");
      if (!("admin" in actor)) return apiError(403, "Only staff can change the order progress.");
      const check = await checkStaff("orders");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await setOrderProgress(id, body.statusOverride);
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, order: result.order });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/orders\/([^/]+)\/cancel$/,
    handler: async (_request, [id]) => {
      const actor = await currentActor();
      if (!actor) return apiError(401, "Please log in.");
      if ("admin" in actor) {
        const check = await checkStaff("orders");
        if (!check.ok) return apiError(check.status, check.error);
      }
      const result = await cancelOrder(id, actor);
      if (!result.ok) return apiError(result.status, result.error);
      return json({ ok: true, order: result.order });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/orders\/([^/]+)\/confirm$/,
    handler: async (_request, [id]) => {
      const actor = await currentActor();
      if (!actor) return apiError(401, "Please log in.");
      if (!("admin" in actor)) return apiError(403, "Only staff can confirm orders.");
      const check = await checkStaff("orders");
      if (!check.ok) return apiError(check.status, check.error);
      const result = await confirmOrder(id);
      if (!result.ok) return apiError(result.status, result.error);
      return json({ ok: true, order: result.order });
    },
  },

  {
    // Whether the real database is connected, or the in-memory demo store is in use.
    method: "GET",
    pattern: /^\/api\/status$/,
    handler: async () => {
      const status = await getDatabaseStatus();
      return json(status.mode === "demo" ? { mode: "demo", message: status.message } : { mode: "database" });
    },
  },
  // Staff and admin accounts
  {
    // The signed-in staff member, or null. The admin pages read this to decide what to show; every
    // admin API route still checks the session itself.
    method: "GET",
    pattern: /^\/api\/admin\/session$/,
    handler: async () => json({ session: await getAdminSession() }),
  },
  {
    // Admin sign-up status. Public Admin sign-up is always open, so `open` is always true.
    method: "GET",
    pattern: /^\/api\/admin\/setup$/,
    handler: async () => json({ adminExists: await hasAdminAccounts(), open: true }),
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/session$/,
    handler: async (request) => {
      const body = await readBody(request);
      // Demo login: only a name (the tester's or the restaurant's), no email or password.
      if (body && body.email === undefined && body.password === undefined) {
        const name = cleanDemoName(body.name);
        if (!name) return apiError(400, "Please correct the highlighted fields.", { name: "Enter your name or your restaurant's name (2 to 60 characters)." });
        await startDemoSession(name);
        return json({ ok: true, account: demoAccount(name), redirect: homeForRole("admin") });
      }
      const email = text(body?.email);
      const password = text(body?.password);
      if (!email.trim() || !password) {
        return apiError(400, "Please correct the highlighted fields.", {
          ...(email.trim() ? {} : { email: "Enter your Gmail address." }),
          ...(password ? {} : { password: "Enter your password." }),
        });
      }
      const buckets = loginBuckets(request, email);
      if (isBlocked(buckets.all)) return apiError(429, LOGIN_BLOCKED);
      const account = await verifyAdminCredentials(email, password);
      if (!account) {
        recordFailure(buckets.all);
        return apiError(401, "Email or password is incorrect.");
      }
      clearFailures(buckets.account.key);
      await startAdminSession(account.id);
      // Only the Admin may use the Admin dashboard; an Owner who signs in here is sent to /owner.
      return json({
        ok: true,
        account: { id: account.id, name: account.name, email: account.email, role: account.role },
        redirect: homeForRole(account.role),
      });
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/admin\/session$/,
    handler: async () => {
      await endAdminSession();
      return json({ ok: true });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/accounts$/,
    handler: async (request) => {
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const input = { name: text(body.name), email: text(body.email), password: text(body.password), confirm: text(body.confirm) };
      const signedIn = await getAdminSession();
      if (signedIn) {
        const check = await checkStaff("staff");
        if (!check.ok) return apiError(check.status, "Only the Admin can add owner accounts.");
        const result = await createOwnerAccount(input, body.restaurantId, { id: signedIn.id, name: signedIn.name });
        if (!result.ok) {
          if ("closed" in result) return apiError(403, "Only the Admin can add owner accounts.");
          return apiError(400, "Please correct the highlighted fields.", result.errors);
        }
        return json({ ok: true, account: result.account }, 201);
      }
      // Public Admin sign-up: open to anyone, any number of times, with no first-Admin limit and no setup
      // key. The new account is an Admin (the role is never read from the request), its password is stored
      // as a PBKDF2 hash, and it is signed in. The form asks for the password once, so there is no
      // separate confirmation to compare.
      const result = await createAdminSignupAccount({ ...input, confirm: input.password });
      if (!result.ok) {
        if ("closed" in result) return apiError(403, "Admin sign-up failed. Please try again.");
        return apiError(400, "Please correct the highlighted fields.", result.errors);
      }
      await startAdminSession(result.account.id);
      return json({ ok: true, account: result.account, redirect: homeForRole(result.account.role) }, 201);
    },
  },
  {
    // A signed-in Admin creates another Admin from the Sign Up page: { name, email, password }. Only the
    // Admin role passes checkStaff, the role is fixed here, and the creator's own session is left as it is.
    method: "POST",
    pattern: /^\/api\/admin\/admins$/,
    handler: async (request) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, ADDITIONAL_ADMIN_REFUSED);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await createAdditionalAdminAccount(
        { name: text(body.name), email: text(body.email), password: text(body.password) },
        { id: check.session.id, name: check.session.name },
      );
      if (!result.ok) {
        if ("closed" in result) return apiError(403, ADDITIONAL_ADMIN_REFUSED);
        return apiError(400, "Please correct the highlighted fields.", result.errors);
      }
      return json({ ok: true, account: result.account }, 201);
    },
  },
  {
    // The Admin adds a Manager: { name, email, password, restaurantId }. The role is fixed here, never
    // read from the request. The Admin's own session is left as it is.
    method: "POST",
    pattern: /^\/api\/admin\/managers$/,
    handler: async (request) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.status === 401 ? check.error : "Only the Admin can add manager accounts.");
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await createManagerAccount(
        { name: text(body.name), email: text(body.email), password: text(body.password) },
        body.restaurantId,
        { id: check.session.id, name: check.session.name },
      );
      if (!result.ok) {
        if ("closed" in result) return apiError(403, "Only the Admin can add manager accounts.");
        return apiError(400, "Please correct the highlighted fields.", result.errors);
      }
      return json({ ok: true, account: result.account }, 201);
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/admin\/employees$/,
    handler: async () => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      return json({ staff: await listStaff() });
    },
  },
  {
    method: "PATCH",
    pattern: /^\/api\/admin\/employees\/([^/]+)$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await updateStaff(
        id,
        { id: check.session.id, name: check.session.name },
        { active: body.active, restaurantId: body.restaurantId },
      );
      if (!result.ok) return apiError(result.status, result.error);
      return json({ ok: true, member: result.member });
    },
  },
  {
    // Permanent deletion of an owner account. The checks live here and in deleteOwnerAccount, not only in the page.
    method: "DELETE",
    pattern: /^\/api\/admin\/employees\/([^/]+)$/,
    handler: async (_request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const result = await deleteOwnerAccount(id, { id: check.session.id, name: check.session.name });
      if (!result.ok) return apiError(result.status, result.error);
      // The deleted owner's open sessions end now, not when they next expire.
      await endSessionsFor("admin", result.deleted.id);
      return json({ ok: true, deleted: result.deleted, vacatedRestaurants: result.vacatedRestaurants });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/admin\/owners\/([^/]+)$/,
    handler: async (_request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const details = await getOwnerDetails(id);
      if (!details) return apiError(404, "Owner not found.");
      return json(details);
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/owners\/([^/]+)\/staff$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await createTeamMember(
        id,
        { name: body.name, phone: body.phone, email: body.email },
        { id: check.session.id, name: check.session.name },
      );
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, staff: result.value }, 201);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/api\/admin\/staff\/([^/]+)$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await updateTeamMember(
        id,
        { name: body.name, active: body.active, ownerId: body.ownerId, phone: body.phone, email: body.email },
        { id: check.session.id, name: check.session.name },
      );
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, staff: result.value });
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/admin\/products$/,
    handler: async (request) => {
      const check = await checkStaff("menu");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!Array.isArray(body?.products)) return apiError(400, "Invalid request.");
      const result = await replaceProducts(body.products);
      if (!result.ok) return apiError(400, result.error);
      return json({ ok: true });
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/admin\/categories$/,
    handler: async (request) => {
      const check = await checkStaff("menu");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!Array.isArray(body?.categories)) return apiError(400, "Invalid request.");
      const result = await replaceCategories(body.categories);
      if (!result.ok) return apiError(400, result.error);
      return json({ ok: true });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/admin\/orders$/,
    handler: async () => {
      const check = await checkStaff("orders");
      if (!check.ok) return apiError(check.status, check.error);
      return json({ orders: await listAllOrders() });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/admin\/customers$/,
    handler: async () => {
      const check = await checkStaff("customers");
      if (!check.ok) return apiError(check.status, check.error);
      return json({ customers: await listCustomers() });
    },
  },

  // Restaurants: the public branch list (for checkout) and the owner's restaurant pages.
  {
    method: "GET",
    pattern: /^\/api\/restaurants$/,
    handler: async () => json({ restaurants: await listRestaurantsForCustomers() }),
  },
  {
    method: "GET",
    pattern: /^\/api\/admin\/restaurants$/,
    handler: async () => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      return json({ restaurants: await listRestaurants() });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/restaurants$/,
    handler: async (request) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await createRestaurant({ name: body.name, area: body.area, logo: body.logo, ownerId: body.ownerId });
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, restaurant: result.value }, 201);
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/admin\/restaurants\/([^/]+)$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const requested = new URL(request.url).searchParams.get("date") ?? "";
      const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : new Date().toISOString().slice(0, 10);
      const detail = await getRestaurantDetail(id, date);
      if (!detail) return apiError(404, "Restaurant not found.");
      return json(detail);
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/restaurants\/([^/]+)\/grocery$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      if (!(await findRestaurant(id))) return apiError(404, "Restaurant not found.");
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await addGroceryItem(id, body);
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, item: result.value }, 201);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/api\/admin\/restaurants\/([^/]+)\/grocery\/([^/]+)$/,
    handler: async (request, [id, itemId]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await updateGroceryItem(id, itemId, body);
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, item: result.value });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/restaurants\/([^/]+)\/purchases$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      if (!(await findRestaurant(id))) return apiError(404, "Restaurant not found.");
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await addPurchase(id, body);
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, purchase: result.value }, 201);
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/admin\/restaurants\/([^/]+)\/attendance$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const restaurant = await findRestaurant(id);
      if (!restaurant) return apiError(404, "Restaurant not found.");
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      // Only this restaurant's staff (its owner's team) can be marked here.
      const team = restaurant.ownerId ? await getOwnerDetails(restaurant.ownerId) : null;
      const staffId = text(body.staffId);
      if (!team?.staff.some((member) => member.id === staffId)) {
        return apiError(400, "Choose a staff member who works at this restaurant.");
      }
      const result = await saveAttendance(id, { staffId, date: body.date, status: body.status, checkIn: body.checkIn, checkOut: body.checkOut });
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, record: result.value });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/restaurants\/([^/]+)\/riders$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      if (!(await findRestaurant(id))) return apiError(404, "Restaurant not found.");
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await addRider(id, body);
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, rider: result.value }, 201);
    },
  },
  {
    method: "PATCH",
    pattern: /^\/api\/admin\/riders\/([^/]+)$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await updateRiderStatus(id, body.status);
      if (!result.ok) return apiError(result.status, result.error);
      return json({ ok: true, rider: result.value });
    },
  },
  {
    method: "PUT",
    pattern: /^\/api\/admin\/riders\/([^/]+)\/location$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await setRiderLocation(id, body.lat, body.lng);
      if (!result.ok) return apiError(result.status, result.error);
      return json({ ok: true, rider: result.value });
    },
  },
  {
    method: "PATCH",
    pattern: /^\/api\/admin\/orders\/([^/]+)\/rider$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const riderId = typeof body.riderId === "string" && body.riderId ? body.riderId : null;
      const result = await assignRider(id, riderId);
      if (!result.ok) return apiError(result.status, result.error);
      return json({ ok: true, order: result.order });
    },
  },

  // Cafe operations (lib/server/cafe.ts, stock.ts, cafeStaff.ts, dashboard.ts). Each route names the
  // area it belongs to; canAccess gives the Owner (Admin) every area and a cafe Manager the operational ones.
  ...cafeRoutes(),
];

type Session = { id: string; name: string };
type CafeResult = { ok: true; value: unknown } | { ok: false; status: number; error: string; errors?: Record<string, string> };

// Wraps a cafe handler with the access check and turns a Result into a response.
function cafeRoute(method: string, pattern: RegExp, permission: Permission, run: (request: Request, params: string[], session: Session) => Promise<CafeResult>): Route {
  return {
    method,
    pattern,
    handler: async (request, params) => {
      const check = await checkStaff(permission);
      if (!check.ok) return apiError(check.status, check.error);
      const result = await run(request, params, { id: check.session.id, name: check.session.name });
      if (!result.ok) return apiError(result.status, result.error, result.errors);
      return json({ ok: true, value: result.value });
    },
  };
}

// GET routes that answer with the value itself.
function cafeRead(pattern: RegExp, permission: Permission, run: (request: Request, params: string[]) => Promise<CafeResult>): Route {
  return {
    method: "GET",
    pattern,
    handler: async (request, params) => {
      const check = await checkStaff(permission);
      if (!check.ok) return apiError(check.status, check.error);
      const result = await run(request, params);
      if (!result.ok) return apiError(result.status, result.error);
      return json(result.value);
    },
  };
}

function cafeRoutes(): Route[] {
  const body = async (request: Request) => (await readBody(request)) ?? {};
  const from = (request: Request) => new URL(request.url).searchParams.get("from");
  const value = async <T>(v: Promise<T>): Promise<CafeResult> => ({ ok: true, value: await v });
  return [
    // Tables, waiters and orders
    cafeRead(/^\/api\/admin\/cafe$/, "cafe", () => value(readCafe())),
    cafeRead(/^\/api\/admin\/cafe\/history$/, "cafe", (r) => readHistory(from(r))),
    cafeRoute("POST", /^\/api\/admin\/cafe\/tables$/, "cafe", () => addTable()),
    cafeRoute("PUT", /^\/api\/admin\/cafe\/tables$/, "cafe", async (r) => setTableCount((await body(r)).count)),
    cafeRoute("PUT", /^\/api\/admin\/cafe\/settings$/, "cafe", async (r) => saveSettings(await body(r))),
    cafeRoute("POST", /^\/api\/admin\/cafe\/waiters$/, "cafe", async (r, _p, s) => addWaiter(await body(r), s)),
    cafeRoute("DELETE", /^\/api\/admin\/cafe\/waiters\/([^/]+)$/, "cafe", async (_r, [id]) => removeWaiter(id)),
    cafeRoute("PUT", /^\/api\/admin\/cafe\/waiters\/([^/]+)\/tables$/, "cafe", async (r, [id]) => assignTables(id, (await body(r)).tableIds)),
    cafeRoute("POST", /^\/api\/admin\/cafe\/tables\/([^/]+)\/order$/, "cafe", async (r, [id]) => orderForTable(id, (await body(r)).items)),
    cafeRoute("POST", /^\/api\/admin\/cafe\/tables\/([^/]+)\/cleaned$/, "cafe", async (_r, [id]) => markCleaned(id)),
    cafeRoute("POST", /^\/api\/admin\/cafe\/takeaway$/, "cafe", async (r) => createTakeaway(await body(r))),
    cafeRoute("POST", /^\/api\/admin\/cafe\/orders\/([^/]+)\/ready$/, "cafe", async (_r, [id]) => markReady(id)),
    cafeRoute("POST", /^\/api\/admin\/cafe\/orders\/([^/]+)\/complete$/, "cafe", async (_r, [id]) => completeOrder(id)),

    // Waiter performance
    cafeRead(/^\/api\/admin\/waiters\/performance$/, "waiters", (r) => readWaiterPerformance(from(r))),
    cafeRead(/^\/api\/admin\/waiters\/([^/]+)\/orders$/, "waiters", (r, [id]) => readWaiterOrders(id, from(r))),

    // Stock
    cafeRead(/^\/api\/admin\/stock$/, "stock", () => value(readStock())),
    cafeRoute("POST", /^\/api\/admin\/stock\/items$/, "stock", async (r) => addItem(await body(r))),
    cafeRoute("PATCH", /^\/api\/admin\/stock\/items\/([^/]+)$/, "stock", async (r, [id]) => updateItem(id, await body(r))),
    cafeRoute("DELETE", /^\/api\/admin\/stock\/items\/([^/]+)$/, "stock", async (_r, [id]) => removeItem(id)),
    cafeRoute("POST", /^\/api\/admin\/stock\/items\/([^/]+)\/purchases$/, "stock", async (r, [id]) => recordPurchase(id, await body(r))),
    cafeRoute("POST", /^\/api\/admin\/stock\/items\/([^/]+)\/usage$/, "stock", async (r, [id]) => recordUsage(id, await body(r))),
    // Recipes decide what each sale costs, so only the Owner edits them (they sit with menu prices).
    cafeRoute("PUT", /^\/api\/admin\/stock\/recipes\/([^/]+)$/, "menu", async (r, [id]) => saveRecipe(id, (await body(r)).lines)),

    // Cafe staff directory (salaries): Owner only. Not /api/admin/staff, which is the restaurant teams' route.
    cafeRead(/^\/api\/admin\/cafe-staff$/, "staff", () => value(listStaffDirectory())),
    cafeRoute("POST", /^\/api\/admin\/cafe-staff$/, "staff", async (r, _p, s) => {
      const b = await body(r);
      return addStaff(b.kind, b, s);
    }),
    cafeRoute("PATCH", /^\/api\/admin\/cafe-staff\/([^/]+)$/, "staff", async (r, [id]) => updateStaffRecord(id, await body(r))),
    cafeRoute("DELETE", /^\/api\/admin\/cafe-staff\/([^/]+)$/, "staff", async (_r, [id]) => removeStaffRecord(id)),

    // Attendance, pay entries and payroll (lib/server/staffHr.ts): Owner only, like salaries.
    cafeRead(/^\/api\/admin\/hr\/attendance$/, "staff", async (r) => readAttendanceDay(new URL(r.url).searchParams.get("date"))),
    cafeRoute("POST", /^\/api\/admin\/hr\/attendance\/([^/]+)$/, "staff", async (r, [id]) => changeAttendance(id, await body(r))),
    cafeRead(/^\/api\/admin\/hr\/payroll$/, "staff", async (r) => readPayroll(new URL(r.url).searchParams.get("month"))),
    cafeRoute("PUT", /^\/api\/admin\/hr\/payroll\/([^/]+)$/, "staff", async (r, [id]) => setPayrollPaid(id, await body(r))),
    cafeRoute("POST", /^\/api\/admin\/hr\/pay$/, "staff", async (r) => addPayEntry(await body(r))),
    cafeRoute("DELETE", /^\/api\/admin\/hr\/pay\/([^/]+)$/, "staff", async (_r, [id]) => removePayEntry(id)),
    cafeRead(/^\/api\/admin\/hr\/staff\/([^/]+)$/, "staff", async (r, [id]) => readStaffProfile(id, new URL(r.url).searchParams.get("month"))),

    // Dashboard: Owner only
    cafeRead(/^\/api\/admin\/dashboard$/, "home", (r) => readDashboard(new URL(r.url).searchParams.get("today"))),
  ];
}


// Runs one request against the handlers. Unknown paths and methods return 404 and 405.
// - Database or configuration problems return 503 and log only messages without credentials.
// - Anything else returns 500 with a generic message, and the stack trace is logged on the server.
export async function handleApi(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const matching = routes.filter((route) => route.pattern.test(pathname));
  if (matching.length === 0) return apiError(404, "Not found.");
  const route = matching.find((r) => r.method === request.method);
  if (!route) return apiError(405, "This request is not supported here.");
  const params = (pathname.match(route.pattern)?.slice(1) ?? []) as string[];
  try {
    return await route.handler(request, params);
  } catch (err) {
    if (err instanceof DatabaseConfigError || err instanceof DatabaseUnavailableError) {
      // Says which problem it is (not configured, blocked by Atlas, DNS, credentials, timeout) without
      // any secret; the full redacted detail goes to the server log.
      return databaseErrorResponse(err, "api");
    }
    if (err instanceof MongoError) {
      console.error(`[api] database request failed: ${err.name}${err.code === undefined ? "" : ` (code ${String(err.code)})`}`);
      return apiError(503, "The service is unavailable right now. Please try again shortly.");
    }
    console.error("[api] unexpected error:", err instanceof Error ? (err.stack ?? err.message) : err);
    return apiError(500, "Something went wrong. Please try again.");
  }
}
