import { apiError, json, readBody } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { addPurchase, listPurchases } from "@/lib/server/restaurantRecords";

// Expenses are the restaurant's purchase records (the same records the Admin's restaurant page lists).

// GET /api/owner/expenses
export const GET = ownerRoute(async (_request, ctx) => json({ expenses: await listPurchases(ctx.restaurant.id) }));

// POST /api/owner/expenses { supplier, description?, amount, date }
export const POST = ownerRoute(async (request, ctx) => {
  const body = await readBody(request);
  if (!body) return apiError(400, "Invalid request.");
  const result = await addPurchase(ctx.restaurant.id, body);
  if (!result.ok) return apiError(result.status, result.error, result.errors);
  return json({ ok: true, expense: result.value }, 201);
});
