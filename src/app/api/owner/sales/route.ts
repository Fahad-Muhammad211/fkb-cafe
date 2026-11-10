import { apiError, json } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { salesSummary } from "@/lib/server/pos";

// GET /api/owner/sales?from=YYYY-MM-DD&to=YYYY-MM-DD (both default to today, restaurant time).
export const GET = ownerRoute(async (request, ctx) => {
  const params = new URL(request.url).searchParams;
  const result = await salesSummary(ctx.restaurant.id, params.get("from"), params.get("to"));
  if (!result.ok) return apiError(result.status, result.error);
  return json({ sales: result.value });
});
