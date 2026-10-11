import type { JsonValue } from '@/lib/json';

export type JwtObject = { [key: string]: JsonValue };

export interface DecodedJwt {
  header: JwtObject;
  payload: JwtObject;
  /** Raw Base64URL signature segment. It is never verified. */
  signature: string;
}

export type TimeStatus = 'valid' | 'expired' | 'not-yet-active' | 'active';

export interface ExpirationInfo {
  status: 'valid' | 'expired';
  date: string;
  /** Human readable, e.g. "1h 42m" (remaining) or "32 minutes ago". */
  relative: string;
}

export interface NotBeforeInfo {
  status: 'not-yet-active' | 'active';
  date: string;
  relative: string;
}

export interface JwtTimeInfo {
  exp?: ExpirationInfo;
  nbf?: NotBeforeInfo;
  iat?: { date: string };
}
