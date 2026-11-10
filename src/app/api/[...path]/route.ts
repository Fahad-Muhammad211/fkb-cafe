import { connection } from "next/server";
import { handleApi } from "@/lib/server/api";

// Every /api/... request is handled on the server by lib/server/api.ts, against MongoDB. The routes
// read the caller's session cookie, so they are always dynamic: connection() keeps Next.js from
// prerendering or caching them. They run on the default Node.js runtime (the MongoDB driver needs it).

async function handle(request: Request): Promise<Response> {
  await connection();
  const response = await handleApi(request);
  // Account and order data must never be stored by the browser or a shared cache.
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };
