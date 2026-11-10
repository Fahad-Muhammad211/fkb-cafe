// The app's data endpoints, served inside the browser. The components still call the same paths
// (/api/...) they always did; fetchShim.ts sends those calls here. Every handler returns the same
// status codes and messages the server versions used to return.

import { readBody, apiError, json, text, clientKey } from "@/lib/local/http";
import { createCustomer, verifyCustomer, changeCustomerPassword, listCustomers, updateCustomerProfile } from "@/lib/local/customers";
import { createInitialAdminAccount, createManagerAccount, listStaff, updateStaff, verifyAdminCredentials } from "@/lib/local/adminAccounts";
import { endAdminSession, getAdminSession, startAdminSession } from "@/lib/local/adminSession";
import { endCustomerSession, getCustomerSession, startCustomerSession } from "@/lib/local/customerSession";
import { checkStaff } from "@/lib/local/staff";
import { readCatalog, replaceCategories, replaceProducts } from "@/lib/local/catalog";
import { getSavedCart, saveCart, sanitizeCartLine, MAX_CART_LINES } from "@/lib/local/carts";
import { listAddresses, createAddress, updateAddress, deleteAddress } from "@/lib/local/addresses";
import { getWishlist, addToWishlist, removeFromWishlist } from "@/lib/local/wishlist";
import { listNotifications, markNotificationsRead } from "@/lib/local/notifications";
import { listPaymentsForUser } from "@/lib/local/payments";
import { listActiveCoupons } from "@/lib/local/coupons";
import { createTicket, listTickets } from "@/lib/local/support";
import { assignRider, cancelOrder, confirmOrder, createOrder, getOrderForActor, listAllOrders, listOrdersForUser, setOrderProgress } from "@/lib/local/orders";
import { currentActor } from "@/lib/local/actor";
import { createOffice, listOffices } from "@/lib/local/offices";
import { createTeamMember, getManagerDetails, updateTeamMember } from "@/lib/local/staffMembers";
import { createRestaurant, findRestaurant, listRestaurants, listRestaurantsForCustomers } from "@/lib/local/restaurants";
import { addGroceryItem, updateGroceryItem, addPurchase, saveAttendance, addRider, updateRiderStatus, setRiderLocation } from "@/lib/local/restaurantRecords";
import { getRestaurantDetail } from "@/lib/local/restaurantDetail";
import { isBlocked, recordFailure, clearFailures } from "@/lib/local/rateLimit";
import { isValidEmail } from "@/lib/validation";
import type { CartLine } from "@/types";

type Handler = (request: Request, params: string[]) => Promise<Response>;
type Route = { method: string; pattern: RegExp; handler: Handler };

const LOGIN_BLOCKED = "Too many failed attempts. Please wait 15 minutes and try again.";
const LOG_IN = "Please log in first.";

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
      startCustomerSession(result.user.id);
      return json({ ok: true, user: result.user }, 201);
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/customer\/session$/,
    handler: async (request) => {
      const key = `customer:${clientKey()}`;
      if (isBlocked(key)) return apiError(429, LOGIN_BLOCKED);
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
      const user = await verifyCustomer(email, password);
      if (!user) {
        recordFailure(key);
        return apiError(401, "Email or password is incorrect.");
      }
      clearFailures(key);
      startCustomerSession(user.id);
      return json({ ok: true, user });
    },
  },
  {
    method: "DELETE",
    pattern: /^\/api\/customer\/session$/,
    handler: async () => {
      endCustomerSession();
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

  // Staff and admin accounts
  {
    method: "POST",
    pattern: /^\/api\/admin\/session$/,
    handler: async (request) => {
      const key = `admin:${clientKey()}`;
      if (isBlocked(key)) return apiError(429, LOGIN_BLOCKED);
      const body = await readBody(request);
      const email = text(body?.email);
      const password = text(body?.password);
      if (!email.trim() || !password) {
        return apiError(400, "Please correct the highlighted fields.", {
          ...(email.trim() ? {} : { email: "Enter your Gmail address." }),
          ...(password ? {} : { password: "Enter your password." }),
        });
      }
      const account = await verifyAdminCredentials(email, password);
      if (!account) {
        recordFailure(key);
        return apiError(401, "Email or password is incorrect.");
      }
      clearFailures(key);
      await startAdminSession(account.id);
      return json({ ok: true, account: { id: account.id, name: account.name, email: account.email } });
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
        if (!check.ok) return apiError(check.status, "Only the owner can add staff accounts.");
        const result = await createManagerAccount(input, body.role, body.officeId, { id: signedIn.id, name: signedIn.name });
        if (!result.ok) {
          if ("closed" in result) return apiError(403, "Only the owner can add staff accounts.");
          return apiError(400, "Please correct the highlighted fields.", result.errors);
        }
        return json({ ok: true, account: result.account }, 201);
      }
      const result = await createInitialAdminAccount(input);
      if (!result.ok) {
        if ("closed" in result) return apiError(403, "Admin signup is closed. Ask the owner to create your account.");
        return apiError(400, "Please correct the highlighted fields.", result.errors);
      }
      await startAdminSession(result.account.id);
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
        { responsibilities: body.responsibilities, active: body.active, officeId: body.officeId },
      );
      if (!result.ok) return apiError(result.status, result.error);
      return json({ ok: true, member: result.member });
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/admin\/offices$/,
    handler: async () => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      return json({ offices: await listOffices() });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/offices$/,
    handler: async (request) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await createOffice({ name: body.name, address: body.address });
      if (!result.ok) return apiError(400, "Please correct the highlighted fields.", result.errors);
      return json({ ok: true, office: result.office }, 201);
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/admin\/managers\/([^/]+)$/,
    handler: async (_request, [id]) => {
      // A manager can open their own team page; the owner can open any manager's.
      const session = await getAdminSession();
      if (!session) return apiError(401, "Please log in as an admin.");
      if (session.role !== "owner" && session.id !== id) return apiError(403, "You can only view your own team.");
      const details = await getManagerDetails(id);
      if (!details) return apiError(404, "Manager not found.");
      return json(details);
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/admin\/managers\/([^/]+)\/staff$/,
    handler: async (request, [id]) => {
      const check = await checkStaff("staff");
      if (!check.ok) return apiError(check.status, check.error);
      const body = await readBody(request);
      if (!body) return apiError(400, "Invalid request.");
      const result = await createTeamMember(
        id,
        { name: body.name, jobRole: body.jobRole, phone: body.phone, email: body.email },
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
        { name: body.name, jobRole: body.jobRole, active: body.active, managerId: body.managerId, phone: body.phone, email: body.email },
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
      const result = await createRestaurant({ name: body.name, area: body.area, logo: body.logo, managerId: body.managerId });
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
      // Only this restaurant's staff (its manager's team) can be marked here.
      const team = restaurant.managerId ? await getManagerDetails(restaurant.managerId) : null;
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
];


// Runs one request against the local handlers. Unknown paths and methods return 404 and 405.
export async function handleLocalApi(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  const matching = routes.filter((route) => route.pattern.test(pathname));
  if (matching.length === 0) return apiError(404, "Not found.");
  const route = matching.find((r) => r.method === request.method);
  if (!route) return apiError(405, "This request is not supported here.");
  const params = (pathname.match(route.pattern)?.slice(1) ?? []) as string[];
  try {
    return await route.handler(request, params);
  } catch (err) {
    console.error("[api] unexpected error:", err instanceof Error ? (err.stack ?? err.message) : err);
    return apiError(500, "Something went wrong. Please try again.");
  }
}
