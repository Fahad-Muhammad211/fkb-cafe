import { json } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { listKitchenOrders } from "@/lib/server/pos";

// GET /api/kitchen/orders: confirmed orders of the signed-in Owner's restaurant that are not served or
// delivered yet, oldest first. The Kitchen Display Screen polls this.
export const GET = ownerRoute(async (_request, ctx) => json({ orders: await listKitchenOrders(ctx.restaurant.id), restaurant: ctx.restaurant }));
