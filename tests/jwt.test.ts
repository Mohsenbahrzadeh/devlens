import { describe, expect, it } from 'vitest';
import { decodeJwt, extractToken, getTimeInfo } from '@/features/jwt/utils/token';

const b64url = (o: unknown) =>
  btoa(typeof o === 'string' ? o : JSON.stringify(o))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const make = (payload: object, header: object = { alg: 'HS256', typ: 'JWT' }) =>
  `${b64url(header)}.${b64url(payload)}.sig`;

describe('decodeJwt', () => {
  it('decodes a valid JWT', () => {
    const r = decodeJwt(make({ sub: '123', iss: 'me' }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.header.alg).toBe('HS256');
      expect(r.value.payload.sub).toBe('123');
    }
  });

  it('rejects tokens with missing segments', () => {
    const r = decodeJwt('abc.def');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toBe('The token must contain three segments.');
  });

  it('rejects invalid Base64URL', () => {
    const r = decodeJwt('@@@.bbb.ccc');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('Base64URL');
  });

  it('rejects invalid JSON', () => {
    const r = decodeJwt(`${b64url('not json')}.${b64url({ a: 1 })}.s`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain('valid JSON');
  });

  it('rejects empty input', () => {
    expect(decodeJwt('  ').ok).toBe(false);
  });

  it('decodes UTF-8 payloads', () => {
    const bytes = new TextEncoder().encode('{"name":"Zoë"}');
    const payload = b64url(String.fromCharCode(...bytes));
    const r = decodeJwt(`${b64url({ alg: 'none' })}.${payload}.`);
    expect(r.ok && r.value.payload.name).toBe('Zoë');
  });
});

describe('extractToken', () => {
  it('strips whitespace, quotes and Bearer', () => {
    expect(extractToken('  "Bearer abc.def.ghi"  ')).toBe('abc.def.ghi');
  });
  it('strips an Authorization header prefix', () => {
    expect(extractToken('Authorization: Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
  it('decodes a token pasted with Bearer', () => {
    expect(decodeJwt(`Bearer ${make({ a: 1 })}`).ok).toBe(true);
  });
});

describe('getTimeInfo', () => {
  const now = Date.UTC(2026, 9, 1, 12, 0, 0);
  const sec = now / 1000;

  it('reports a valid token with remaining time', () => {
    const info = getTimeInfo({ exp: sec + 102 * 60 }, now);
    expect(info.exp?.status).toBe('valid');
    expect(info.exp?.relative).toBe('1h 42m');
  });
  it('reports an expired token', () => {
    const info = getTimeInfo({ exp: sec - 32 * 60 }, now);
    expect(info.exp?.status).toBe('expired');
    expect(info.exp?.relative).toBe('32 minutes ago');
  });
  it('reports a not-yet-active token (nbf)', () => {
    expect(getTimeInfo({ nbf: sec + 3600 }, now).nbf?.status).toBe('not-yet-active');
  });
  it('reports an active token when nbf is past', () => {
    expect(getTimeInfo({ nbf: sec - 10 }, now).nbf?.status).toBe('active');
  });
  it('handles missing exp', () => {
    expect(getTimeInfo({ sub: 'x' }, now).exp).toBeUndefined();
  });
  it('handles missing iat', () => {
    expect(getTimeInfo({ exp: sec + 60 }, now).iat).toBeUndefined();
  });
  it('formats iat in local time', () => {
    expect(getTimeInfo({ iat: sec }, now).iat?.date).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );
  });
  it('ignores non-numeric exp', () => {
    expect(getTimeInfo({ exp: 'soon' }, now).exp).toBeUndefined();
  });
});
