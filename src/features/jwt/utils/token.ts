import { base64ToUtf8 } from '@/lib/base64';
import { isObject, type JsonValue } from '@/lib/json';
import { fail, ok, type Result } from '@/types/result';
import type { DecodedJwt, JwtObject, JwtTimeInfo } from '../types';

export const KNOWN_CLAIMS: Record<string, string> = {
  iss: 'Issuer',
  sub: 'Subject',
  aud: 'Audience',
  exp: 'Expiration time',
  nbf: 'Not before',
  iat: 'Issued at',
  jti: 'JWT ID',
};

/** Trims whitespace/quotes and strips `Authorization:` / `Bearer ` prefixes. */
export function extractToken(input: string): string {
  let t = input.trim();
  t = t.replace(/^["'`]+|["'`]+$/g, '').trim();
  t = t.replace(/^authorization\s*:\s*/i, '');
  t = t.replace(/^bearer\s+/i, '');
  return t.replace(/^["'`]+|["'`]+$/g, '').trim();
}

function decodeSegment(segment: string, name: string): Result<JwtObject> {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    return fail('Invalid JWT', `The ${name} is not valid Base64URL.`);
  }
  if (segment.length % 4 === 1) {
    return fail('Invalid JWT', `The ${name} is not valid Base64URL.`);
  }
  const text = base64ToUtf8(segment);
  if (!text.ok) return fail('Invalid JWT', `The ${name} is not valid Base64URL.`);
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(text.value) as JsonValue;
  } catch (e) {
    return fail('Invalid JWT', `The ${name} does not contain valid JSON.`, String(e));
  }
  if (!isObject(parsed)) return fail('Invalid JWT', `The ${name} must be a JSON object.`);
  return ok(parsed);
}

export function decodeJwt(input: string): Result<DecodedJwt> {
  const token = extractToken(input);
  if (!token) return fail('Empty input', 'Paste a JWT to decode it.');
  const parts = token.split('.');
  if (parts.length !== 3) {
    return fail('Invalid JWT', 'The token must contain three segments.');
  }
  const header = decodeSegment(parts[0], 'header');
  if (!header.ok) return header;
  const payload = decodeSegment(parts[1], 'payload');
  if (!payload.ok) return payload;
  return ok({ header: header.value, payload: payload.value, signature: parts[2] });
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Formats a Unix timestamp (seconds) as `YYYY-MM-DD HH:mm:ss` in the local timezone. */
export function formatLocal(seconds: number): string {
  const d = new Date(seconds * 1000);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function formatRemaining(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.max(0, Math.floor(ms / 1000))}s`;
}

export function formatAgo(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 60) return plural(minutes, 'minute');
  if (minutes < 1440) return plural(Math.floor(minutes / 60), 'hour');
  return plural(Math.floor(minutes / 1440), 'day');
}

const isNum = (v: JsonValue | undefined): v is number => typeof v === 'number' && isFinite(v);

export function getTimeInfo(payload: JwtObject, now: number = Date.now()): JwtTimeInfo {
  const info: JwtTimeInfo = {};
  if (isNum(payload.exp)) {
    const diff = payload.exp * 1000 - now;
    info.exp =
      diff > 0
        ? { status: 'valid', date: formatLocal(payload.exp), relative: formatRemaining(diff) }
        : { status: 'expired', date: formatLocal(payload.exp), relative: formatAgo(-diff) };
  }
  if (isNum(payload.nbf)) {
    const diff = payload.nbf * 1000 - now;
    info.nbf =
      diff > 0
        ? {
            status: 'not-yet-active',
            date: formatLocal(payload.nbf),
            relative: `in ${formatRemaining(diff)}`,
          }
        : { status: 'active', date: formatLocal(payload.nbf), relative: formatAgo(-diff) };
  }
  if (isNum(payload.iat)) info.iat = { date: formatLocal(payload.iat) };
  return info;
}
