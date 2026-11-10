import { apiError, json, readBody } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { advanceKitchenStatus } from "@/lib/server/pos";

// PATCH /api/kitchen/orders/:orderId/status { status: "preparing" | "ready" | "served" | "delivered" }
// Moves the order one step forward. The customer's tracking page and the Owner's screens read the same
// order, so they show the new status on their next refresh.
export const PATCH = ownerRoute<{ orderId: string }>(async (request, ctx, { orderId }) => {
  const body = await readBody(request);
  if (!body) return apiError(400, "Invalid request.");
  const result = await advanceKitchenStatus(ctx.restaurant.id, orderId, body.status);
  if (!result.ok) return apiError(result.status, result.error);
  return json({ ok: true, order: result.value });
});
