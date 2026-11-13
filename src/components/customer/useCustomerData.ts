"use client";

import { useCallback, useEffect, useState } from "react";

interface CustomerDataState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

// Loads one customer API endpoint. Every request is sent with the session cookie, so the server only
// ever returns the signed-in customer's own data. `reload` fetches again after a change.
export function useCustomerData<T>(url: string) {
  const [state, setState] = useState<CustomerDataState<T>>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    fetch(url, { credentials: "same-origin", cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
        if (!active) return;
        if (res.ok && body) setState({ data: body, error: null, loading: false });
        else setState({ data: null, error: body?.error ?? "We could not load this information.", loading: false });
      })
      .catch(() => {
        if (active) setState({ data: null, error: "Could not reach the server. Check your connection and try again.", loading: false });
      });
    return () => {
      active = false;
    };
  }, [url, version]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    setVersion((v) => v + 1);
  }, []);

  return { ...state, reload };
}

// Sends a change (POST, PATCH, PUT or DELETE) and reads the { error, errors? } shape the API uses.
export type CustomerRequestResult<T> = { ok: true; data: T } | { ok: false; error: string; errors?: Record<string, string> };

export async function customerRequest<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<CustomerRequestResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string; errors?: Record<string, string> }) | null;
    if (res.ok && data) return { ok: true, data };
    return { ok: false, error: data?.error ?? "Something went wrong. Please try again.", errors: data?.errors };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}
