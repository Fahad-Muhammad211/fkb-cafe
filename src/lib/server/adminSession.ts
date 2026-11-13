import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { StaffAccess } from "@/lib/permissions";
import { findAdminAccount } from "@/lib/server/adminAccounts";
import { endSession, readSession, startSession } from "@/lib/server/session";

// Sign-in helpers for admins and staff. The session lives in MongoDB behind an httpOnly cookie.
//
// Demo login: for now anyone can open the Owner dashboard by typing their own name or the restaurant's
// name, with no password and no database lookup. The session is a signed cookie that carries that
// name, so the dashboard shows who is testing. Set DEMO_SESSION_SECRET in production to sign it.
const DEMO_ID = "demo-owner";
const DEMO_COOKIE = "meg_admin_demo";
const DEMO_MAX_AGE_SECONDS = 12 * 60 * 60;
const demoSecret = () => process.env.DEMO_SESSION_SECRET || "restaurant-demo-login";
const sign = (payload: string) => createHmac("sha256", demoSecret()).update(payload).digest("base64url");

const sameText = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// The name typed on the login page, tidied, or null when it is too short or too long.
export function cleanDemoName(value: unknown): string | null {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 60 ? name : null;
}

export const demoAccount = (name: string) => ({ id: DEMO_ID, name, email: "", role: "admin" as const });

export async function startDemoSession(name: string) {
  const expires = Date.now() + DEMO_MAX_AGE_SECONDS * 1000;
  const payload = `${Buffer.from(name).toString("base64url")}.${expires}`;
  const jar = await cookies();
  jar.set(DEMO_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DEMO_MAX_AGE_SECONDS,
  });
}

async function readDemoName(): Promise<string | null> {
  const value = (await cookies()).get(DEMO_COOKIE)?.value;
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [encoded, expires, signature] = parts;
  if (!(Number(expires) > Date.now()) || !sameText(signature, sign(`${encoded}.${expires}`))) return null;
  return cleanDemoName(Buffer.from(encoded, "base64url").toString("utf8"));
}

export async function startAdminSession(accountId: string) {
  await startSession("admin", accountId);
}

export async function endAdminSession() {
  const jar = await cookies();
  if (jar.get(DEMO_COOKIE)) {
    jar.delete(DEMO_COOKIE);
    if (!jar.get("meg_admin_session")) return;
  }
  await endSession("admin");
}

export type StaffSession = { id: string; name: string; email: string } & StaffAccess;

// Returns the signed-in staff member, or null. The account is read on every call, so a role change
// applies at once and a switched-off account loses access straight away.
export async function getAdminSession(): Promise<StaffSession | null> {
  const demoName = await readDemoName();
  if (demoName) return demoAccount(demoName);
  const accountId = await readSession("admin");
  if (!accountId) return null;
  const account = await findAdminAccount(accountId);
  if (!account) {
    // The account was deleted: drop the saved session so it cannot be used again.
    await endSession("admin");
    return null;
  }
  if (!account.active) return null;
  return { id: account.id, name: account.name, email: account.email, role: account.role };
}
