import { apiError, json, readBody } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { recordPayment } from "@/lib/server/pos";

// PUT /api/owner/orders/:orderId/payment { method: "cash" | "card" }: records the final bill as paid.
// The payment record keeps its history; a second payment for the same order is refused (409).
export const PUT = ownerRoute<{ orderId: string }>(async (request, ctx, { orderId }) => {
  const body = await readBody(request);
  if (!body) return apiError(400, "Invalid request.");
  const result = await recordPayment(ctx, orderId, body.method);
  if (!result.ok) return apiError(result.status, result.error);
  return json({ ok: true, order: result.value });
});
