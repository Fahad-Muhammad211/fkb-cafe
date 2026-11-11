// Browser-side helpers for the admin auth API. Passwords go straight to the server over POST
// requests and are never stored in the browser. The session is an httpOnly cookie set by the
// server, so this module never reads or writes it.

export type AdminAuthErrors = Record<string, string>;
// `redirect` is where the server says the signed-in account belongs: /admin for the Admin, /owner for an Owner.
export type AdminAuthResult = { ok: true; redirect: "/admin" | "/owner" } | { ok: false; errors: AdminAuthErrors };

const UNREACHABLE: AdminAuthResult = { ok: false, errors: { form: "Could not reach the server. Check your connection and try again." } };

// Reads the shared error shape { error, errors? } and maps it to form errors.
async function send(url: string, method: "POST" | "DELETE", body?: unknown): Promise<AdminAuthResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => null)) as { error?: string; errors?: AdminAuthErrors; redirect?: unknown } | null;
    if (res.ok) return { ok: true, redirect: data?.redirect === "/owner" ? "/owner" : "/admin" };
    return { ok: false, errors: data?.errors ?? { form: data?.error ?? "Something went wrong. Please try again." } };
  } catch {
    return UNREACHABLE;
  }
}

// Public Admin sign-up. The server creates an Admin and signs them in.
export function adminSignupRequest(input: { name: string; email: string; password: string }) {
  return send("/api/admin/accounts", "POST", input);
}

// Another Admin, created by the signed-in Admin. The server checks the caller's session and role; the
// caller stays signed in as themselves.
export function additionalAdminRequest(input: { name: string; email: string; password: string }) {
  return send("/api/admin/admins", "POST", input);
}

export function adminLoginRequest(email: string, password: string) {
  return send("/api/admin/session", "POST", { email, password });
}

export function adminLogoutRequest() {
  return send("/api/admin/session", "DELETE");
}
