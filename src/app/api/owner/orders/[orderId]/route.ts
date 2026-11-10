import { apiError, json } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { getRestaurantOrder } from "@/lib/server/pos";

// GET /api/owner/orders/:orderId: one order of this restaurant, with its payment record (the invoice).
export const GET = ownerRoute<{ orderId: string }>(async (_request, ctx, { orderId }) => {
  const order = await getRestaurantOrder(ctx.restaurant.id, orderId);
  if (!order) return apiError(404, "Order not found.");
  return json({ order, restaurant: ctx.restaurant });
});
