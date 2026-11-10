import { apiError, json } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { cancelRestaurantOrder } from "@/lib/server/pos";

// POST /api/owner/orders/:orderId/cancellation: cancels an unpaid order that is not served yet.
export const POST = ownerRoute<{ orderId: string }>(async (_request, ctx, { orderId }) => {
  const result = await cancelRestaurantOrder(ctx, orderId);
  if (!result.ok) return apiError(result.status, result.error);
  return json({ ok: true, order: result.value });
});
