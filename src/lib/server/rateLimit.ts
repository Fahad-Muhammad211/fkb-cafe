// Small in-memory limiter for failed logins. It is per server process, which is enough to slow
// down password guessing on one instance. Use a shared store if the app
// runs on several instances.
//
// Each bucket has its own limit. Login uses one bucket per account (so guessing one account's password
// is slow however the requests are spread out) and, when the visitor's IP is known from a trusted proxy,
// one per IP with a higher limit (so one visitor cannot try many accounts quickly). See loginBuckets in
// api.ts and trustedClientIp in http.ts.

const WINDOW_MS = 15 * 60 * 1000;
export const DEFAULT_MAX_FAILURES = 10;
// Upper bound on tracked keys, so requests with many made-up emails cannot grow memory without limit.
const MAX_TRACKED_KEYS = 10_000;

export type Bucket = { key: string; max: number };

const failures = new Map<string, { count: number; resetAt: number }>();

const asBuckets = (keys: string | Bucket | Bucket[]): Bucket[] =>
  typeof keys === "string" ? [{ key: keys, max: DEFAULT_MAX_FAILURES }] : Array.isArray(keys) ? keys : [keys];

function liveEntry(key: string) {
  const entry = failures.get(key);
  if (entry && entry.resetAt < Date.now()) {
    failures.delete(key);
    return undefined;
  }
  return entry;
}

// Drops expired entries, then the oldest ones, once the map reaches its size limit.
function makeRoom() {
  if (failures.size < MAX_TRACKED_KEYS) return;
  const now = Date.now();
  for (const [key, entry] of failures) if (entry.resetAt < now) failures.delete(key);
  for (const key of failures.keys()) {
    if (failures.size < MAX_TRACKED_KEYS) break;
    failures.delete(key);
  }
}

// True when any of the buckets has reached its limit.
export function isBlocked(keys: string | Bucket | Bucket[]): boolean {
  return asBuckets(keys).some(({ key, max }) => (liveEntry(key)?.count ?? 0) >= max);
}

// Counts one failure in every bucket.
export function recordFailure(keys: string | Bucket | Bucket[]) {
  for (const { key } of asBuckets(keys)) {
    const entry = liveEntry(key);
    if (entry) {
      entry.count += 1;
    } else {
      makeRoom();
      failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
    }
  }
}

export function clearFailures(key: string) {
  failures.delete(key);
}
