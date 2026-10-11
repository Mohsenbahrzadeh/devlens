import type { JwtObject } from '../types';

export interface SecurityNote {
  level: 'warn' | 'info';
  text: string;
}

const YEAR_SECONDS = 365 * 24 * 3600;
const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v);

/** Heuristic, offline review of a decoded token. Never a substitute for verification. */
export function reviewToken(
  header: JwtObject,
  payload: JwtObject,
  now: number = Date.now(),
): SecurityNote[] {
  const notes: SecurityNote[] = [];
  const alg = typeof header.alg === 'string' ? header.alg : '';

  if (alg.toLowerCase() === 'none') {
    notes.push({
      level: 'warn',
      text: 'Algorithm is "none": the token is unsigned and can be forged by anyone.',
    });
  } else if (alg.startsWith('HS')) {
    notes.push({
      level: 'info',
      text: 'Symmetric (HMAC) algorithm: anyone who knows the secret can mint valid tokens.',
    });
  }
  for (const k of ['jku', 'x5u', 'jwk'] as const) {
    if (k in header) {
      notes.push({
        level: 'warn',
        text: `Header contains "${k}". Never trust keys supplied by the token itself.`,
      });
    }
  }
  if (typeof header.kid === 'string' && /[./\\'";]|\.\./.test(header.kid)) {
    notes.push({
      level: 'warn',
      text: '"kid" contains path or SQL-like characters. Make sure the server never uses it unsanitised.',
    });
  }

  if (!('exp' in payload)) {
    notes.push({ level: 'warn', text: 'No "exp" claim: this token never expires.' });
  } else if (isNum(payload.exp) && isNum(payload.iat) && payload.exp - payload.iat > YEAR_SECONDS) {
    notes.push({ level: 'warn', text: 'Very long-lived token: it is valid for more than a year.' });
  }
  if (isNum(payload.iat) && payload.iat * 1000 > now + 60_000) {
    notes.push({
      level: 'warn',
      text: '"iat" is in the future. Check clock skew between systems.',
    });
  }
  if (isNum(payload.exp) && isNum(payload.nbf) && payload.nbf > payload.exp) {
    notes.push({ level: 'warn', text: '"nbf" is later than "exp": the token is never valid.' });
  }
  if (!('aud' in payload)) {
    notes.push({
      level: 'info',
      text: 'No "aud" claim: the receiver cannot check the intended audience.',
    });
  }
  if (!('iss' in payload)) {
    notes.push({ level: 'info', text: 'No "iss" claim: the issuer is not identified.' });
  }
  return notes;
}
