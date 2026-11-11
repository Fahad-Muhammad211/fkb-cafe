import { NextResponse, type NextRequest } from "next/server";

// Optimistic check for the Admin dashboard: a visitor with no admin session cookie at all is sent to the
// Admin login by the server, so they never wait on the client-side "Checking admin session…" screen (which
// needs JavaScript to finish). This only looks at whether the cookie exists. The real check (is the
// session valid, is the account an active Admin) still happens on the server in every /api/admin route
// and in the page guards. Must match SESSION_COOKIES.admin in lib/server/session.ts.
const ADMIN_SESSION_COOKIE = "meg_admin_session";

export function proxy(request: NextRequest) {
  if (request.cookies.has(ADMIN_SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}

// Every /admin page except the login and sign-up pages.
export const config = {
  matcher: ["/admin", "/admin/((?!login|signup).*)"],
};
