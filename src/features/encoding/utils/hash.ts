import { bytesToBase64Url } from '@/lib/base64';
import { fail, ok, type Result } from '@/types/result';

export const HASH_ALGS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;
export type HashAlg = (typeof HASH_ALGS)[number];

const asBuffer = (b: Uint8Array) => b as unknown as BufferSource;
const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const toBase64 = (buf: ArrayBuffer) => {
  const url = bytesToBase64Url(new Uint8Array(buf));
  const std = url.replace(/-/g, '+').replace(/_/g, '/');
  return std + '='.repeat((4 - (std.length % 4)) % 4);
};

export interface DigestResult {
  hex: string;
  base64: string;
}

export async function digestText(alg: HashAlg, text: string): Promise<DigestResult> {
  const buf = await globalThis.crypto.subtle.digest(alg, asBuffer(new TextEncoder().encode(text)));
  return { hex: toHex(buf), base64: toBase64(buf) };
}

export async function hmacText(
  alg: HashAlg,
  key: string,
  text: string,
): Promise<Result<DigestResult>> {
  if (!key) return fail('Key required', 'Enter the HMAC secret key.');
  const k = await globalThis.crypto.subtle.importKey(
    'raw',
    asBuffer(new TextEncoder().encode(key)),
    { name: 'HMAC', hash: alg },
    false,
    ['sign'],
  );
  const buf = await globalThis.crypto.subtle.sign(
    'HMAC',
    k,
    asBuffer(new TextEncoder().encode(text)),
  );
  return ok({ hex: toHex(buf), base64: toBase64(buf) });
}
