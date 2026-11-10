// Random values from the browser's secure generator, replacing Node's crypto module.

export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

// A whole number from min (inclusive) to max (exclusive).
export function randomInt(min: number, max: number): number {
  const range = max - min;
  const limit = Math.floor(0x100000000 / range) * range;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return min + (buffer[0] % range);
}
