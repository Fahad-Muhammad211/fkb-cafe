import { json } from "@/lib/server/http";
import { ownerRoute } from "@/lib/server/ownerAccess";

// GET /api/owner/session: the signed-in Owner and the one restaurant they manage.
export const GET = ownerRoute(async (_request, ctx) => json(ctx));
