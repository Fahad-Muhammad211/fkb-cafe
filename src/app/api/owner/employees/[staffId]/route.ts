import { apiError, json, readBody } from "@/lib/server/http";
import { ownerRoute, teamOwnerId } from "@/lib/server/ownerAccess";
import { getOwnerDetails, updateTeamMember } from "@/lib/server/staffMembers";

// PATCH /api/owner/employees/:staffId { name?, phone?, email?, active? }. Only this restaurant's staff
// can be changed, and an Owner cannot move staff to another owner (that stays with the Admin).
export const PATCH = ownerRoute<{ staffId: string }>(async (request, ctx, { staffId }) => {
  const team = await getOwnerDetails(await teamOwnerId(ctx));
  if (!team?.staff.some((member) => member.id === staffId)) return apiError(404, "Staff member not found.");
  const body = await readBody(request);
  if (!body) return apiError(400, "Invalid request.");
  const result = await updateTeamMember(
    staffId,
    { name: body.name, phone: body.phone, email: body.email, active: body.active },
    { id: ctx.owner.id, name: ctx.owner.name },
  );
  if (!result.ok) return apiError(result.status, result.error, result.errors);
  return json({ ok: true, staff: result.value });
});
