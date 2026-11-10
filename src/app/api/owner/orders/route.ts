import { apiError, json, readBody } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { createPosOrder, listRestaurantOrders } from "@/lib/server/pos";
import type { OrderType } from "@/types/pos";

const TYPES: OrderType[] = ["dine_in", "takeaway", "online"];

// GET /api/owner/orders?type=dine_in|takeaway|online&open=1&tableId=...
export const GET = ownerRoute(async (request, ctx) => {
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  if (type && !TYPES.includes(type as OrderType)) return apiError(400, "Unknown order type.");
  const orders = await listRestaurantOrders(ctx.restaurant.id, {
    type: (type as OrderType | null) ?? undefined,
    open: params.get("open") === "1",
    tableId: params.get("tableId") ?? undefined,
  });
  return json({ orders });
});

// POST /api/owner/orders: confirms a dine-in or takeaway order from the POS cart. It is created already
// confirmed, with its invoice and token, and appears on the kitchen screen at once. Sending the same
// clientOrderId again returns the same order (200) instead of a second one (201).
export const POST = ownerRoute(async (request, ctx) => {
  const body = await readBody(request);
  if (!body) return apiError(400, "Invalid request.");
  const result = await createPosOrder(ctx, body);
  if (!result.ok) return apiError(result.status, result.error, result.errors);
  return json({ ok: true, order: result.value }, result.created ? 201 : 200);
});
