import type { AuthUser } from "@/types";

// Browser-side client for the customer account API. Passwords go to the server, which checks
// them and sets an httpOnly session cookie. The browser never stores a password or a session.

export type AuthErrors = Record<string, string>;
export type AuthResult = { ok: true; user: AuthUser } | { ok: false; errors: AuthErrors };

const UNREACHABLE: AuthResult = { ok: false, errors: { form: "Could not reach the server. Check your connection and try again." } };

async function send(url: string, method: "POST" | "PATCH", body?: unknown): Promise<AuthResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => null)) as { user?: AuthUser; error?: string; errors?: AuthErrors } | null;
    if (res.ok && data?.user) return { ok: true, user: data.user };
    return { ok: false, errors: data?.errors ?? { form: data?.error ?? "Something went wrong. Please try again." } };
  } catch {
    return UNREACHABLE;
  }
}

// The signed-in customer, or null when nobody is signed in or the server cannot be reached.
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/customer/profile", { credentials: "same-origin", cache: "no-store" });
    const data = (await res.json().catch(() => null)) as { user?: AuthUser | null } | null;
    return data?.user ?? null;
  } catch {
    return null;
  }
}

export function signUpRequest(input: { name: string; email: string; phone: string; password: string; confirm: string }) {
  return send("/api/customers", "POST", input);
}

export function logInRequest(email: string, password: string) {
  return send("/api/customer/session", "POST", { email, password });
}

export async function logOutRequest(): Promise<void> {
  await fetch("/api/customer/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
}

export function updateProfileRequest(values: { name: string; phone: string }) {
  return send("/api/customer/profile", "PATCH", values);
}
