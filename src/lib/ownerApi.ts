"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Browser helpers for the Owner dashboard and the Kitchen Display Screen. Every record comes from the
// server (MongoDB) on each request; nothing is written to the browser's storage.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; errors?: Record<string, string> };

export async function ownerRequest<T>(url: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET", body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string; errors?: Record<string, string> }) | null;
    if (res.ok && data) return { ok: true, data };
    return { ok: false, status: res.status, error: data?.error ?? "Something went wrong. Please try again.", errors: data?.errors };
  } catch {
    return { ok: false, status: 0, error: "Could not reach the server. Check your connection and try again." };
  }
}

// Loads a URL and reloads it every `intervalMs` while the tab is visible, so status changes made on
// another screen (kitchen, owner, customer) show up here without a manual refresh.
export function usePolled<T>(url: string | null, intervalMs = 4000) {
  const [state, setState] = useState<{ data: T | null; error: string | null; status: number | null; loading: boolean }>({
    data: null,
    error: null,
    status: null,
    loading: true,
  });
  // Bumped on each URL change, so an answer for an earlier URL is ignored.
  const generation = useRef(0);

  const reload = useCallback(async () => {
    if (!url) return;
    const mine = generation.current;
    const result = await ownerRequest<T>(url);
    if (generation.current !== mine) return;
    setState(result.ok ? { data: result.data, error: null, status: 200, loading: false } : (s) => ({ ...s, error: result.error, status: result.status, loading: false }));
  }, [url]);

  useEffect(() => {
    if (!url) return;
    void reload();
    if (intervalMs <= 0) return () => void (generation.current += 1);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, intervalMs);
    return () => {
      generation.current += 1;
      window.clearInterval(timer);
    };
  }, [url, intervalMs, reload]);

  return { ...state, reload };
}

// A random reference for one "Confirm order" press, so a retried request cannot create a second order.
export function newClientOrderId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
}
