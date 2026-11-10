import { apiError, json } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { confirmOnlineOrder } from "@/lib/server/pos";

// POST /api/owner/orders/:orderId/confirmation: accepts an online order. It gets its invoice and token
// and goes to the kitchen. Repeating the call returns the same invoice and token.
export const POST = ownerRoute<{ orderId: string }>(async (_request, ctx, { orderId }) => {
  const result = await confirmOnlineOrder(ctx.restaurant.id, orderId);
  if (!result.ok) return apiError(result.status, result.error);
  return json({ ok: true, order: result.value });
});
