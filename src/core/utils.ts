// Deranged shit from Claude

export function uuid(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  return format(b);
}

/**
 * The same seed always gives the same uuid.
 *
 * For ids that have to survive re-parsing the pipeline, since anything keyed by
 * them — an upload in the run store, a row in IndexedDB — is lost the moment
 * they change.
 */
export function stableUuid(seed: string): string {
  const b = new Uint8Array(16);
  // Four passes with different salts, because one FNV-1a is 32 bits.
  for (let word = 0; word < 4; word++) {
    const hash = fnv1a(`${word}:${seed}`);
    for (let byte = 0; byte < 4; byte++) {
      b[word * 4 + byte] = (hash >>> (24 - byte * 8)) & 0xff;
    }
  }
  b[6] = (b[6] & 0x0f) | 0x50; // version 5, which is the name-based one
  b[8] = (b[8] & 0x3f) | 0x80; // variant
  return format(b);
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function format(b: Uint8Array): string {
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function quoted(value: string): string {
  return `“${value}”`;
}

// Oxford comma: these get read out loud to people who did not ask for SQL.
export function list(values: string[]): string {
  const quotedValues = values.map(quoted);
  if (quotedValues.length <= 2) return quotedValues.join(" and ");
  const last = quotedValues[quotedValues.length - 1];
  return `${quotedValues.slice(0, -1).join(", ")}, and ${last}`;
}
