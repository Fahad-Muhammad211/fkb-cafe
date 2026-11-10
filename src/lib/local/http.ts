// Shared helpers for the local API handlers (see api.ts).
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

// The client key for rate limiting. In the browser every request comes from the same place, so
// the limit applies to this browser.
export function clientKey(): string {
  return "browser";
}
