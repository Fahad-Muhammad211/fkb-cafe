import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getCollection } from "@/lib/server/collections";

// Sign-in sessions, one kind per role (customer or admin). The browser holds only a random token in an
// httpOnly cookie, which page scripts cannot read. MongoDB stores the token's SHA-256 hash with the
// account ID and expiry, so a leaked database copy cannot be replayed as a cookie, and signing out or
// deleting an account ends its sessions on the server.

export type SessionKind = "admin" | "customer";

export const SESSION_COOKIES: Record<SessionKind, string> = {
  admin: "meg_admin_session",
  customer: "meg_customer_session",
};

const MAX_AGE_SECONDS: Record<SessionKind, number> = {
  admin: 8 * 60 * 60,
  customer: 30 * 24 * 60 * 60,
};

type SessionDoc = {
  _id: string; // SHA-256 of the cookie token
  kind: SessionKind;
  accountId: string;
  createdAt: Date;
  expiresAt: Date;
};

// MongoDB removes expired sessions by itself (TTL index). Reads also check the expiry, because the TTL
// sweep runs only about once a minute.
const sessionsCollection = () =>
  getCollection<SessionDoc>("sessions", [
    { key: { expiresAt: 1 }, name: "sessions_expiry_ttl", expireAfterSeconds: 0 },
    { key: { kind: 1, accountId: 1 }, name: "sessions_account" },
  ]);

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// Tokens are 32 random bytes in base64url (43 characters). Anything else is not one of ours.
const looksLikeToken = (value: string | undefined): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

export async function startSession(kind: SessionKind, accountId: string): Promise<void> {
  const jar = await cookies();
  const sessions = await sessionsCollection();
  // Signing in again replaces this browser's previous session of the same kind.
  const previous = jar.get(SESSION_COOKIES[kind])?.value;
  if (looksLikeToken(previous)) await sessions.deleteOne({ _id: hashToken(previous) });

  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await sessions.insertOne({
    _id: hashToken(token),
    kind,
    accountId,
    createdAt: new Date(now),
    expiresAt: new Date(now + MAX_AGE_SECONDS[kind] * 1000),
  });
  jar.set(SESSION_COOKIES[kind], token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS[kind],
  });
}

export async function endSession(kind: SessionKind): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIES[kind])?.value;
  if (looksLikeToken(token)) await (await sessionsCollection()).deleteOne({ _id: hashToken(token) });
  jar.delete(SESSION_COOKIES[kind]);
}

// Ends every session of one account, for example when the account is deleted.
export async function endSessionsFor(kind: SessionKind, accountId: string): Promise<void> {
  await (await sessionsCollection()).deleteMany({ kind, accountId });
}

// The signed-in account ID for this role, or null when there is no valid session.
export async function readSession(kind: SessionKind): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIES[kind])?.value;
  if (!looksLikeToken(token)) return null;
  const doc = await (await sessionsCollection()).findOne({ _id: hashToken(token), kind });
  if (!doc || doc.expiresAt.getTime() <= Date.now()) return null;
  return doc.accountId;
}
