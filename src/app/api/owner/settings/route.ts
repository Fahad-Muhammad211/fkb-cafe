import { apiError, json, readBody } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { getTableSettings, saveTableSettings } from "@/lib/server/pos";

// GET /api/owner/settings: { tableCount, seats } for the signed-in Owner's restaurant.
export const GET = ownerRoute(async (_request, ctx) => json(await getTableSettings(ctx.restaurant.id)));

// PUT /api/owner/settings { tableCount, seats }: saves both and makes the table list match tableCount.
// The restaurant always comes from the session, never from the request.
export const PUT = ownerRoute(async (request, ctx) => {
  const body = await readBody(request);
  if (!body) return apiError(400, "Invalid request.");
  const result = await saveTableSettings(ctx.restaurant.id, body, ctx.owner.id);
  if (!result.ok) return apiError(result.status, result.error, result.errors);
  return json({ ok: true, ...result.value });
});
