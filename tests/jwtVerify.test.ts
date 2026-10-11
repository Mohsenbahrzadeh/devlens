import { describe, expect, it } from 'vitest';
import { signJwt, verifyJwt } from '@/features/jwt/utils/verify';
import { reviewToken } from '@/features/jwt/utils/security';
import { decodeJwt } from '@/features/jwt/utils/token';
import { bytesToBase64Url, utf8ToBase64Url } from '@/lib/base64';

const subtle = globalThis.crypto.subtle;
const buf = (b: Uint8Array) => b as unknown as BufferSource;

const toPem = (spki: ArrayBuffer) => {
  const b64 = Buffer.from(spki)
    .toString('base64')
    .match(/.{1,64}/g)!
    .join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`;
};

async function signWith(
  alg: string,
  privateKey: CryptoKey,
  params: AlgorithmIdentifier | RsaPssParams | EcdsaParams,
  payload: object = { sub: '1' },
) {
  const input = `${utf8ToBase64Url(JSON.stringify({ alg, typ: 'JWT' }))}.${utf8ToBase64Url(JSON.stringify(payload))}`;
  const sig = await subtle.sign(params, privateKey, buf(new TextEncoder().encode(input)));
  return `${input}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

describe('HMAC sign / verify', () => {
  const base = {
    header: '{"typ":"JWT"}',
    payload: '{"sub":"123","name":"Mohsen"}',
    secret: 'super-secret',
    alg: 'HS256' as const,
  };

  it('signs a token that decodes and verifies', async () => {
    const t = await signJwt(base);
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    const d = decodeJwt(t.value);
    expect(d.ok && d.value.header.alg).toBe('HS256');
    expect(d.ok && d.value.payload.name).toBe('Mohsen');
    const v = await verifyJwt(t.value, 'super-secret');
    expect(v.ok && v.value.valid).toBe(true);
  });

  it('rejects a wrong secret and a tampered payload', async () => {
    const t = await signJwt(base);
    if (!t.ok) throw new Error('sign failed');
    const wrong = await verifyJwt(t.value, 'other');
    expect(wrong.ok && wrong.value.valid).toBe(false);
    const [h, , s] = t.value.split('.');
    const forged = `${h}.${utf8ToBase64Url('{"sub":"admin"}')}.${s}`;
    const tampered = await verifyJwt(forged, 'super-secret');
    expect(tampered.ok && tampered.value.valid).toBe(false);
  });

  it.each(['HS384', 'HS512'] as const)('supports %s', async (alg) => {
    const t = await signJwt({ ...base, alg });
    if (!t.ok) throw new Error('sign failed');
    const v = await verifyJwt(t.value, 'super-secret');
    expect(v.ok && v.value.valid).toBe(true);
    expect(v.ok && v.value.alg).toBe(alg);
  });

  it('supports Base64-encoded secrets', async () => {
    const secret = Buffer.from('raw-bytes-secret').toString('base64');
    const t = await signJwt({ ...base, secret, secretIsBase64: true });
    if (!t.ok) throw new Error('sign failed');
    expect((await verifyJwt(t.value, 'raw-bytes-secret')).ok).toBe(true);
    const v = await verifyJwt(t.value, secret, { secretIsBase64: true });
    expect(v.ok && v.value.valid).toBe(true);
  });

  it('validates sign inputs', async () => {
    expect((await signJwt({ ...base, secret: '' })).ok).toBe(false);
    expect((await signJwt({ ...base, payload: '{oops' })).ok).toBe(false);
    expect((await signJwt({ ...base, header: '[]' })).ok).toBe(false);
  });

  it('requires a secret to verify', async () => {
    const t = await signJwt(base);
    if (!t.ok) throw new Error('sign failed');
    expect((await verifyJwt(t.value, '')).ok).toBe(false);
  });
});

describe('asymmetric verification', () => {
  it('verifies RS256 with a PEM public key', async () => {
    const pair = await subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const token = await signWith('RS256', pair.privateKey, 'RSASSA-PKCS1-v1_5');
    const pem = toPem(await subtle.exportKey('spki', pair.publicKey));
    const ok = await verifyJwt(token, pem);
    expect(ok.ok && ok.value.valid).toBe(true);

    const other = await subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const bad = await verifyJwt(token, toPem(await subtle.exportKey('spki', other.publicKey)));
    expect(bad.ok && bad.value.valid).toBe(false);
  }, 30000);

  it('verifies PS256 with a JWK', async () => {
    const pair = await subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const token = await signWith('PS256', pair.privateKey, { name: 'RSA-PSS', saltLength: 32 });
    const jwk = JSON.stringify({
      ...(await subtle.exportKey('jwk', pair.publicKey)),
      alg: 'PS256',
      use: 'sig',
    });
    const v = await verifyJwt(token, jwk);
    expect(v.ok && v.value.valid).toBe(true);
  }, 30000);

  it('verifies ES256 (raw R||S signatures)', async () => {
    const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const token = await signWith('ES256', pair.privateKey, { name: 'ECDSA', hash: 'SHA-256' });
    const pem = toPem(await subtle.exportKey('spki', pair.publicKey));
    const v = await verifyJwt(token, pem);
    expect(v.ok && v.value.valid).toBe(true);
  });

  it('refuses private keys and certificates', async () => {
    const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const token = await signWith('ES256', pair.privateKey, { name: 'ECDSA', hash: 'SHA-256' });
    const priv = await verifyJwt(
      token,
      '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----',
    );
    expect(priv.ok).toBe(false);
    if (!priv.ok) expect(priv.error.title).toContain('Private key');
    const jwkPriv = JSON.stringify(await subtle.exportKey('jwk', pair.privateKey));
    expect((await verifyJwt(token, jwkPriv)).ok).toBe(false);
    const cert = await verifyJwt(
      token,
      '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----',
    );
    expect(cert.ok).toBe(false);
  });

  it('reports a readable error for a malformed key', async () => {
    const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const token = await signWith('ES256', pair.privateKey, { name: 'ECDSA', hash: 'SHA-256' });
    const r = await verifyJwt(token, '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.title).toBe('Could not use the key');
  });
});

describe('verify edge cases', () => {
  const tokenWith = (header: object) =>
    `${utf8ToBase64Url(JSON.stringify(header))}.${utf8ToBase64Url('{"sub":"1"}')}.c2ln`;

  it('flags alg none', async () => {
    const v = await verifyJwt(tokenWith({ alg: 'none' }), '');
    expect(v.ok && v.value.valid).toBe(false);
    expect(v.ok && v.value.message).toContain('unsigned');
  });
  it('rejects unsupported algorithms and missing alg', async () => {
    expect((await verifyJwt(tokenWith({ alg: 'EdDSA' }), 'x')).ok).toBe(false);
    expect((await verifyJwt(tokenWith({ typ: 'JWT' }), 'x')).ok).toBe(false);
  });
  it('propagates decode errors', async () => {
    expect((await verifyJwt('nope', 'x')).ok).toBe(false);
  });
});

describe('reviewToken', () => {
  const now = Date.UTC(2026, 9, 1);
  const sec = now / 1000;
  const texts = (h: object, p: object) =>
    reviewToken(h as never, p as never, now).map((n) => n.text);

  it('warns about alg none, missing exp and external key references', () => {
    const t = texts({ alg: 'none', jku: 'http://evil' }, { sub: 'x' });
    expect(t.some((x) => x.includes('"none"'))).toBe(true);
    expect(t.some((x) => x.includes('"jku"'))).toBe(true);
    expect(t.some((x) => x.includes('never expires'))).toBe(true);
  });
  it('warns about long-lived tokens, future iat and nbf after exp', () => {
    const t = texts(
      { alg: 'RS256' },
      { iat: sec + 3600, exp: sec + 3 * 365 * 86400, nbf: sec + 4 * 365 * 86400 },
    );
    expect(t.some((x) => x.includes('more than a year'))).toBe(true);
    expect(t.some((x) => x.includes('in the future'))).toBe(true);
    expect(t.some((x) => x.includes('never valid'))).toBe(true);
  });
  it('flags suspicious kid values and symmetric algorithms', () => {
    const t = texts(
      { alg: 'HS256', kid: '../../etc/passwd' },
      { exp: sec + 60, aud: 'a', iss: 'i' },
    );
    expect(t.some((x) => x.includes('"kid"'))).toBe(true);
    expect(t.some((x) => x.includes('Symmetric'))).toBe(true);
  });
  it('stays quiet for a healthy token', () => {
    const notes = reviewToken(
      { alg: 'RS256', kid: 'abc' },
      { exp: sec + 600, iat: sec, aud: 'a', iss: 'i' },
      now,
    );
    expect(notes).toEqual([]);
  });
});
