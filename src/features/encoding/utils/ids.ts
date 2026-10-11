const rand = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const dashed = (h: string) =>
  `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;

export function uuidV4(): string {
  return globalThis.crypto.randomUUID();
}

/** RFC 9562 UUIDv7: 48-bit Unix millisecond timestamp followed by random bits. */
export function uuidV7(now: number = Date.now()): string {
  const b = rand(16);
  let t = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  return dashed(hex(b));
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID: 48-bit timestamp + 80 random bits, Crockford Base32 (26 chars). */
export function ulid(now: number = Date.now()): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const r = rand(16);
  let random = '';
  for (let i = 0; i < 16; i++) random += CROCKFORD[r[i] % 32];
  return time + random;
}

export const CHARSETS = {
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  hex: '0123456789abcdef',
  base64url: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',
  symbols: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+',
} as const;
export type Charset = keyof typeof CHARSETS;

/** Cryptographically random string using rejection sampling (no modulo bias). */
export function randomString(length: number, charset: Charset = 'alphanumeric'): string {
  const chars = CHARSETS[charset];
  const limit = 256 - (256 % chars.length);
  let out = '';
  while (out.length < length) {
    for (const byte of rand(Math.max(16, length))) {
      if (byte < limit && out.length < length) out += chars[byte % chars.length];
    }
  }
  return out;
}
