import { base64ToBytes, bytesToBase64Url, utf8ToBase64Url } from '@/lib/base64';
import { isObject, type JsonValue } from '@/lib/json';
import { fail, ok, type Result } from '@/types/result';
import type { JwtObject } from '../types';
import { decodeJwt, extractToken } from './token';

type HashName = 'SHA-256' | 'SHA-384' | 'SHA-512';
const HASH: Record<string, HashName> = {
  '256': 'SHA-256',
  '384': 'SHA-384',
  '512': 'SHA-512',
};

export interface VerifyOutcome {
  valid: boolean;
  alg: string;
  message: string;
}

export interface VerifyOptions {
  /** HS* only: the secret is Base64/Base64URL-encoded instead of plain text. */
  secretIsBase64?: boolean;
}

export const SUPPORTED_ALGS = [
  'HS256',
  'HS384',
  'HS512',
  'RS256',
  'RS384',
  'RS512',
  'PS256',
  'PS384',
  'PS512',
  'ES256',
  'ES384',
  'ES512',
] as const;

const asBuffer = (b: Uint8Array) => b as unknown as BufferSource;
const CURVES: Record<string, string> = { '256': 'P-256', '384': 'P-384', '512': 'P-521' };

function pemToDer(pem: string): Result<Uint8Array> {
  const label = /-----BEGIN ([A-Z ]+)-----/.exec(pem)?.[1];
  if (label?.includes('PRIVATE KEY')) {
    return fail(
      'Private key detected',
      'Paste the PUBLIC key (or JWK) instead. A private key should never be pasted into a tool.',
    );
  }
  if (label === 'CERTIFICATE') {
    return fail(
      'Certificates are not supported',
      'Extract the public key first (e.g. `openssl x509 -pubkey -noout -in cert.pem`) or paste a JWK.',
    );
  }
  if (label === 'RSA PUBLIC KEY') {
    return fail(
      'PKCS#1 keys are not supported',
      'Convert it to an SPKI "BEGIN PUBLIC KEY" key (`openssl rsa -RSAPublicKey_in -pubout`) or paste a JWK.',
    );
  }
  const body = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return base64ToBytes(body);
}

async function importVerifyKey(
  alg: string,
  key: string,
  opts: VerifyOptions,
): Promise<Result<CryptoKey>> {
  const bits = alg.slice(2);
  const hash = HASH[bits];
  const subtle = globalThis.crypto.subtle;

  if (alg.startsWith('HS')) {
    if (!key) return fail('Secret required', 'Enter the shared secret used to sign this token.');
    let raw: Uint8Array;
    if (opts.secretIsBase64) {
      const decoded = base64ToBytes(key);
      if (!decoded.ok) return decoded;
      raw = decoded.value;
    } else {
      raw = new TextEncoder().encode(key);
    }
    return ok(
      await subtle.importKey('raw', asBuffer(raw), { name: 'HMAC', hash }, false, ['verify']),
    );
  }

  const algorithm = alg.startsWith('RS')
    ? { name: 'RSASSA-PKCS1-v1_5', hash }
    : alg.startsWith('PS')
      ? { name: 'RSA-PSS', hash }
      : { name: 'ECDSA', namedCurve: CURVES[bits] };

  const text = key.trim();
  if (!text)
    return fail('Public key required', 'Paste a PEM public key ("BEGIN PUBLIC KEY") or a JWK.');
  if (text.startsWith('{')) {
    let jwk: JsonValue;
    try {
      jwk = JSON.parse(text) as JsonValue;
    } catch {
      return fail('Invalid JWK', 'The key looks like JSON but could not be parsed.');
    }
    if (!isObject(jwk)) return fail('Invalid JWK', 'A JWK must be a JSON object.');
    if ('d' in jwk) {
      return fail(
        'Private key detected',
        'This JWK contains private parameters. Paste only the public key.',
      );
    }
    const {
      alg: _alg,
      use: _use,
      key_ops: _ops,
      ext: _ext,
      ...rest
    } = jwk as Record<string, JsonValue>;
    void [_alg, _use, _ops, _ext];
    return ok(await subtle.importKey('jwk', rest as JsonWebKey, algorithm, false, ['verify']));
  }
  const der = pemToDer(text);
  if (!der.ok) return der;
  return ok(await subtle.importKey('spki', asBuffer(der.value), algorithm, false, ['verify']));
}

/** Verifies a JWT signature locally with Web Crypto. Nothing leaves the browser. */
export async function verifyJwt(
  input: string,
  key: string,
  opts: VerifyOptions = {},
): Promise<Result<VerifyOutcome>> {
  const decoded = decodeJwt(input);
  if (!decoded.ok) return decoded;
  const alg = decoded.value.header.alg;
  if (typeof alg !== 'string') {
    return fail(
      'No algorithm',
      'The header has no "alg" value, so the signature cannot be verified.',
    );
  }
  if (alg.toLowerCase() === 'none') {
    return ok({
      valid: false,
      alg,
      message: 'This token is unsigned ("alg": "none"). Never accept it as proof of identity.',
    });
  }
  if (!(SUPPORTED_ALGS as readonly string[]).includes(alg)) {
    return fail(
      'Unsupported algorithm',
      `"${alg}" cannot be verified here. Supported: ${SUPPORTED_ALGS.join(', ')}.`,
    );
  }

  const [h, p, s] = extractToken(input).split('.');
  const signature = base64ToBytes(s);
  if (!signature.ok)
    return fail('Invalid signature', 'The signature segment is not valid Base64URL.');
  const data = new TextEncoder().encode(`${h}.${p}`);

  try {
    const imported = await importVerifyKey(alg, key, opts);
    if (!imported.ok) return imported;
    const bits = alg.slice(2);
    const params = alg.startsWith('HS')
      ? 'HMAC'
      : alg.startsWith('RS')
        ? 'RSASSA-PKCS1-v1_5'
        : alg.startsWith('PS')
          ? { name: 'RSA-PSS', saltLength: Number(bits) / 8 }
          : { name: 'ECDSA', hash: HASH[bits] };
    const valid = await globalThis.crypto.subtle.verify(
      params,
      imported.value,
      asBuffer(signature.value),
      asBuffer(data),
    );
    return ok({
      valid,
      alg,
      message: valid
        ? `Signature is valid for ${alg}.`
        : 'Signature does NOT match. The token was altered or a different key was used.',
    });
  } catch (e) {
    return fail(
      'Could not use the key',
      'The key does not match the token algorithm or is not formatted correctly.',
      String(e),
    );
  }
}

export interface SignInput {
  header: string;
  payload: string;
  secret: string;
  alg: 'HS256' | 'HS384' | 'HS512';
  secretIsBase64?: boolean;
}

function parseObject(text: string, what: string): Result<JwtObject> {
  let value: JsonValue;
  try {
    value = JSON.parse(text) as JsonValue;
  } catch {
    return fail(`Invalid ${what}`, `The ${what} is not valid JSON.`);
  }
  return isObject(value)
    ? ok(value)
    : fail(`Invalid ${what}`, `The ${what} must be a JSON object.`);
}

/** Creates an HMAC-signed JWT for testing. Only HS256/384/512 are supported. */
export async function signJwt(input: SignInput): Promise<Result<string>> {
  const header = parseObject(input.header, 'header');
  if (!header.ok) return header;
  const payload = parseObject(input.payload, 'payload');
  if (!payload.ok) return payload;
  if (!input.secret) return fail('Secret required', 'Enter a secret to sign the token.');

  let secret: Uint8Array;
  if (input.secretIsBase64) {
    const d = base64ToBytes(input.secret);
    if (!d.ok) return d;
    secret = d.value;
  } else {
    secret = new TextEncoder().encode(input.secret);
  }
  const fullHeader = { typ: 'JWT', ...header.value, alg: input.alg };
  const signingInput = `${utf8ToBase64Url(JSON.stringify(fullHeader))}.${utf8ToBase64Url(JSON.stringify(payload.value))}`;
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    asBuffer(secret),
    { name: 'HMAC', hash: HASH[input.alg.slice(2)] },
    false,
    ['sign'],
  );
  const sig = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    asBuffer(new TextEncoder().encode(signingInput)),
  );
  return ok(`${signingInput}.${bytesToBase64Url(new Uint8Array(sig))}`);
}
