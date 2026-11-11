// Shared helpers for the server API handlers (see api.ts).
//
// Every error response has the same shape: { error: string, errors?: { field: message } }.
// `errors` is set for validation problems so forms can show them next to each field.

export type FieldErrors = Record<string, string>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function apiError(status: number, error: string, errors?: FieldErrors): Response {
  return json(errors ? { error, errors } : { error }, status);
}

export async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export const text = (value: unknown) => String(value ?? "");

const MAX_PROXY_HOPS = 10;
// IPv4 or IPv6 characters only; anything else in the header is not a usable address.
const IP_PATTERN = /^[0-9A-Fa-f:.]{2,45}$/;

// The visitor's IP address for rate limiting, or null when it cannot be known safely.
//
// X-Forwarded-For and X-Real-IP are ordinary request headers: a client can send any value, so they are
// never trusted by default. TRUSTED_PROXY_HOPS tells the app how many proxies it runs behind that add
// the address they received the request from to the end of X-Forwarded-For (1 on Vercel or behind a
// single reverse proxy such as nginx with proxy_add_x_forwarded_for). The visitor is then the entry that
// many places from the right; entries further left were written by the client and are ignored.
// When TRUSTED_PROXY_HOPS is unset (or invalid) this returns null and callers rate-limit per account only.
export function trustedClientIp(request: Request): string | null {
  const raw = process.env.TRUSTED_PROXY_HOPS?.trim() ?? "";
  if (!/^\d+$/.test(raw)) return null;
  const hops = Number(raw);
  if (hops < 1 || hops > MAX_PROXY_HOPS) return null;
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (chain.length < hops) return null;
  const ip = chain[chain.length - hops];
  return IP_PATTERN.test(ip) ? ip : null;
}
