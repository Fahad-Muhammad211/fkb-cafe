// Browser-side helpers for the admin auth API. Passwords go straight to the server over POST
// requests and are never stored in the browser. The session is an httpOnly cookie set by the
// server, so this module never reads or writes it.

export type AdminAuthErrors = Record<string, string>;
export type AdminAuthResult = { ok: true } | { ok: false; errors: AdminAuthErrors };

const UNREACHABLE: AdminAuthResult = { ok: false, errors: { form: "Could not complete this request in this browser. Reload the page and try again." } };

// Reads the shared error shape { error, errors? } and maps it to form errors.
async function send(url: string, method: "POST" | "DELETE", body?: unknown): Promise<AdminAuthResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: string; errors?: AdminAuthErrors } | null;
    return { ok: false, errors: data?.errors ?? { form: data?.error ?? "Something went wrong. Please try again." } };
  } catch {
    return UNREACHABLE;
  }
}

export function adminSignupRequest(input: { name: string; email: string; password: string; confirm: string }) {
  return send("/api/admin/accounts", "POST", input);
}

export function adminLoginRequest(email: string, password: string) {
  return send("/api/admin/session", "POST", { email, password });
}

export function adminLogoutRequest() {
  return send("/api/admin/session", "DELETE");
}
