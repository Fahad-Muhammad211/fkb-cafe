import { apiError, json, readBody } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";
import { deleteTable, updateTable } from "@/lib/server/pos";

type Params = { tableId: string };

// PATCH /api/owner/tables/:tableId { seats?, reserved? }
export const PATCH = ownerRoute<Params>(async (request, ctx, { tableId }) => {
  const body = await readBody(request);
  if (!body) return apiError(400, "Invalid request.");
  const result = await updateTable(ctx.restaurant.id, tableId, body);
  if (!result.ok) return apiError(result.status, result.error, result.errors);
  return json({ ok: true, table: result.value });
});

// DELETE /api/owner/tables/:tableId: refused while the table has an open order.
export const DELETE = ownerRoute<Params>(async (_request, ctx, { tableId }) => {
  const result = await deleteTable(ctx.restaurant.id, tableId);
  if (!result.ok) return apiError(result.status, result.error);
  return json({ ok: true });
});
