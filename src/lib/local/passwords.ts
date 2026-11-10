// Password hashing for customer and admin accounts, in the browser. PBKDF2-SHA256 with a random salt
// per password, through the Web Crypto API. Hashes are stored as "pbkdf2$<salt hex>$<key hex>".
// Plain passwords are never stored.

const ITERATIONS = 210_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, KEY_BYTES * 8);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await derive(password, salt);
  return `pbkdf2$${toHex(salt)}$${toHex(key)}`;
}

export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "pbkdf2") return false;
  const salt = fromHex(saltHex ?? "");
  const expected = fromHex(keyHex ?? "");
  if (!salt || !expected) return false;
  const actual = await derive(password, salt);
  if (actual.length !== expected.length) return false;
  // Compare every byte, so the time taken does not show where the first difference is.
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
