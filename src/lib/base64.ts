import { fail, ok, type Result } from '@/types/result';

const toBinary = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return out;
};

export function utf8ToBase64(text: string): string {
  return btoa(toBinary(new TextEncoder().encode(text)));
}

/** Decodes standard Base64 or Base64URL (padding optional) to bytes. */
export function base64ToBytes(input: string): Result<Uint8Array> {
  const cleaned = input.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(cleaned)) {
    return fail('Invalid Base64', 'The input contains characters that are not valid in Base64.');
  }
  const normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (normalized.length % 4 === 1) {
    return fail('Invalid Base64', 'The input has an invalid length.');
  }
  try {
    const bin = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    return ok(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch (e) {
    return fail('Invalid Base64', 'The input could not be decoded.', String(e));
  }
}

export function base64ToUtf8(input: string): Result<string> {
  const bytes = base64ToBytes(input);
  if (!bytes.ok) return bytes;
  try {
    return ok(new TextDecoder('utf-8', { fatal: true }).decode(bytes.value));
  } catch {
    return fail('Not UTF-8 text', 'The decoded bytes are not valid UTF-8 text.');
  }
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(toBinary(bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const utf8ToBase64Url = (text: string): string =>
  bytesToBase64Url(new TextEncoder().encode(text));
