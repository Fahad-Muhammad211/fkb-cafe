import { apiError, json, readBody } from "@/lib/server/http";
import { ownerRoute, teamOwnerId } from "@/lib/server/ownerAccess";
import { createTeamMember, getOwnerDetails } from "@/lib/server/staffMembers";

// GET /api/owner/employees: this restaurant's staff.
export const GET = ownerRoute(async (_request, ctx) => {
  const details = await getOwnerDetails(await teamOwnerId(ctx));
  return json({ staff: details?.staff ?? [] });
});

// POST /api/owner/employees { name, phone?, email? }: adds a staff member (waiter, cook, ...).
export const POST = ownerRoute(async (request, ctx) => {
  const body = await readBody(request);
  if (!body) return apiError(400, "Invalid request.");
  const result = await createTeamMember(
    await teamOwnerId(ctx),
    { name: body.name, phone: body.phone, email: body.email },
    { id: ctx.owner.id, name: ctx.owner.name },
  );
  if (!result.ok) return apiError(result.status, result.error, result.errors);
  return json({ ok: true, staff: result.value }, 201);
});
