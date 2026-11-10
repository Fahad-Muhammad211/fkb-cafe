import { apiError, json, readBody } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { createTable, listTables } from "@/lib/server/pos";

// GET /api/owner/tables: the restaurant's tables with Available / Occupied / Reserved status.
export const GET = ownerRoute(async (_request, ctx) => json({ tables: await listTables(ctx.restaurant.id) }));

// POST /api/owner/tables { number?, seats? }: adds a table (next free number when none is given).
export const POST = ownerRoute(async (request, ctx) => {
  const body = await readBody(request);
  if (!body) return apiError(400, "Invalid request.");
  const result = await createTable(ctx.restaurant.id, body);
  if (!result.ok) return apiError(result.status, result.error, result.errors);
  return json({ ok: true, table: result.value }, 201);
});
