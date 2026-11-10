import "server-only";
import { connection } from "next/server";
import { getAdminSession } from "@/lib/server/adminSession";
import { findStaffMember } from "@/lib/server/adminAccounts";
import { findRestaurant } from "@/lib/server/restaurants";
import { apiError } from "@/lib/server/http";
import { DatabaseConfigError, DatabaseUnavailableError } from "@/lib/server/collections";
import { MongoError } from "mongodb";

// Access rules for the Owner dashboard, the POS and the Kitchen Display Screen.
//
// An Owner is a signed-in account that belongs to a restaurant. The restaurant is always read from
// the account on the server; no Owner route accepts a restaurant id from the browser, so an Owner can
// only ever read or change their own restaurant's tables, orders, payments, staff and expenses.
// Accounts without a restaurant (the Admin) are refused here: the Admin works in /admin, and the Owner
// routes grant nothing beyond the one assigned restaurant.

export interface OwnerContext {
  owner: { id: string; name: string; email: string };
  restaurant: { id: string; name: string; area: string; logo: string };
}

export type OwnerCheck = { ok: true; ctx: OwnerContext } | { ok: false; response: Response };

export async function requireOwner(): Promise<OwnerCheck> {
  const session = await getAdminSession();
  if (!session) return { ok: false, response: apiError(401, "Please log in as a restaurant owner.") };
  const member = await findStaffMember(session.id);
  const restaurant = member?.restaurantId ? await findRestaurant(member.restaurantId) : null;
  if (!member || !restaurant) {
    return { ok: false, response: apiError(403, "Your account is not assigned to a restaurant, so the Owner dashboard is not available.") };
  }
  return {
    ok: true,
    ctx: {
      owner: { id: member.id, name: member.name, email: member.email },
      restaurant: { id: restaurant.id, name: restaurant.name, area: restaurant.area, logo: restaurant.logo },
    },
  };
}

// The restaurant's staff are the team of the owner who runs it (the same list the Admin's restaurant
// page shows). An owner who belongs to the restaurant without running it manages that same team.
export async function teamOwnerId(ctx: OwnerContext): Promise<string> {
  return (await findRestaurant(ctx.restaurant.id))?.ownerId ?? ctx.owner.id;
}

// Wraps an Owner route handler: marks it dynamic, checks the Owner, never caches the answer, and turns
// database failures into a 503 without leaking details.
export function ownerRoute<P>(handler: (request: Request, ctx: OwnerContext, params: P) => Promise<Response>) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    await connection();
    let response: Response;
    try {
      const check = await requireOwner();
      response = check.ok ? await handler(request, check.ctx, await context.params) : check.response;
    } catch (err) {
      if (err instanceof DatabaseConfigError || err instanceof DatabaseUnavailableError || err instanceof MongoError) {
        console.error(`[owner-api] database error: ${err.name}`);
        response = apiError(503, "The service is unavailable right now. Please try again shortly.");
      } else {
        console.error("[owner-api] unexpected error:", err instanceof Error ? (err.stack ?? err.message) : err);
        response = apiError(500, "Something went wrong. Please try again.");
      }
    }
    response.headers.set("Cache-Control", "no-store");
    return response;
  };
}
