import { describe, expect, it } from 'vitest';
import { repairJson } from '@/lib/repair';
import { maskForSharing, MASK } from '@/features/collections/redact';
import { safeEqual, verifyWebhook } from '@/features/encoding/utils/webhook';
import { hmacText } from '@/features/encoding/utils/hash';
import { verifyJwt } from '@/features/jwt/utils/verify';
import { CONVERTERS } from '@/features/json/utils/converters';
import { bytesToBase64Url, utf8ToBase64Url } from '@/lib/base64';
import type { HttpRequestSpec } from '@/features/http/types';

const fixed = (input: string) => {
  const r = repairJson(input);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

describe('repairJson', () => {
  it('returns valid JSON untouched with no fixes', () => {
    expect(fixed('{"a": [1, 2]}')).toEqual({ json: '{"a":[1,2]}', fixes: [] });
  });
  it('fixes trailing commas, single quotes and unquoted keys', () => {
    const r = fixed("{a: 1, 'b': 'it\\'s', c: [1, 2,],}");
    expect(JSON.parse(r.json)).toEqual({ a: 1, b: "it's", c: [1, 2] });
    expect(r.fixes).toEqual(
      expect.arrayContaining([
        'Quoted unquoted keys',
        'Converted single/smart quotes to double quotes',
        'Removed trailing commas',
      ]),
    );
  });
  it('removes comments and code fences', () => {
    const r = fixed('```json\n{\n  // note\n  "a": 1, /* inline */ "b": 2\n}\n```');
    expect(JSON.parse(r.json)).toEqual({ a: 1, b: 2 });
    expect(r.fixes).toEqual(
      expect.arrayContaining(['Removed comments', 'Removed Markdown code fence']),
    );
  });
  it('converts Python and JavaScript literals', () => {
    const r = fixed('{"a": True, "b": False, "c": None, "d": undefined, "e": NaN}');
    expect(JSON.parse(r.json)).toEqual({ a: true, b: false, c: null, d: null, e: null });
  });
  it('adds missing commas between values and between members', () => {
    const r = fixed('{"a": 1\n"b": "x"\n"c": [1 2 3]}');
    expect(JSON.parse(r.json)).toEqual({ a: 1, b: 'x', c: [1, 2, 3] });
    expect(r.fixes).toContain('Added missing commas');
  });
  it('closes unclosed brackets and strings', () => {
    expect(JSON.parse(fixed('{"a": [1, 2, {"b": "x').json)).toEqual({ a: [1, 2, { b: 'x' }] });
    expect(JSON.parse(fixed('{"a": {"b": [1, 2}').json)).toEqual({ a: { b: [1, 2] } });
  });
  it('handles smart quotes and odd number formats', () => {
    expect(JSON.parse(fixed('{“a”: +.5, “b”: 10.}').json)).toEqual({ a: 0.5, b: 10 });
  });
  it('quotes bare words and keeps the original value types', () => {
    expect(JSON.parse(fixed('{"a": pending, "b": [1, "2", true, null]}').json)).toEqual({
      a: 'pending',
      b: [1, '2', true, null],
    });
  });
  it('gives up with a readable error on hopeless input', () => {
    const r = repairJson('@@@ not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.title).toBe('Could not repair');
    expect(repairJson('  ').ok).toBe(false);
  });
});

describe('maskForSharing', () => {
  const spec: HttpRequestSpec = {
    method: 'POST',
    url: 'https://api.example.com/login?token=abc&page=2&api_key=k#f',
    headers: [
      { name: 'Authorization', value: 'Bearer eyJ.abc.def' },
      { name: 'Cookie', value: 'sid=123' },
      { name: 'X-Api-Key', value: 'key-1' },
      { name: 'Accept', value: 'application/json' },
    ],
    body: '{"user":"a","password":"hunter2","nested":{"access_token":"t","list":[{"secret":"s","n":1}]},"count":3}',
  };
  const m = maskForSharing(spec);

  it('masks secret headers but keeps the auth scheme', () => {
    expect(m.headers).toEqual([
      { name: 'Authorization', value: `Bearer ${MASK}` },
      { name: 'Cookie', value: MASK },
      { name: 'X-Api-Key', value: MASK },
      { name: 'Accept', value: 'application/json' },
    ]);
  });
  it('masks token query parameters only', () => {
    expect(m.url).toBe(`https://api.example.com/login?token=${MASK}&page=2&api_key=${MASK}#f`);
  });
  it('masks secret-looking JSON fields at any depth', () => {
    expect(JSON.parse(m.body)).toEqual({
      user: 'a',
      password: MASK,
      nested: { access_token: MASK, list: [{ secret: MASK, n: 1 }] },
      count: 3,
    });
  });
  it('masks form bodies and multipart text fields, never the original', () => {
    const f = maskForSharing({
      ...spec,
      body: 'user=a&password=p&x=1',
      multipart: [
        { name: 'password', value: 'p' },
        { name: 'file', value: 'a.png', file: true },
      ],
    });
    expect(f.body).toBe(`user=a&password=${MASK}&x=1`);
    expect(f.multipart).toEqual([
      { name: 'password', value: MASK },
      { name: 'file', value: 'a.png', file: true },
    ]);
    expect(spec.headers[0].value).toBe('Bearer eyJ.abc.def');
  });
  it('leaves non-JSON bodies and empty values alone', () => {
    expect(maskForSharing({ ...spec, body: 'plain text' }).body).toBe('plain text');
    expect(
      maskForSharing({ ...spec, headers: [{ name: 'Authorization', value: '' }] }).headers[0].value,
    ).toBe('');
  });
});

describe('webhook verification', () => {
  const base = { secret: "It's a Secret to Everybody", payload: 'Hello, World!' };
  const GH = 'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17';

  it('verifies the documented GitHub test vector', async () => {
    const r = await verifyWebhook({ ...base, provider: 'github', signature: GH });
    expect(r.ok && r.value.valid).toBe(true);
    const bad = await verifyWebhook({
      ...base,
      provider: 'github',
      signature: GH,
      payload: 'Hello, World',
    });
    expect(bad.ok && bad.value.valid).toBe(false);
  });
  it('verifies Stripe signatures and warns about old timestamps', async () => {
    const t = '1700000000';
    const mac = await hmacText('SHA-256', 'whsec_x', `${t}.{"id":"evt_1"}`);
    if (!mac.ok) throw new Error('hmac failed');
    const sig = `t=${t},v1=${mac.value.hex}`;
    const input = {
      provider: 'stripe' as const,
      payload: '{"id":"evt_1"}',
      secret: 'whsec_x',
      signature: sig,
    };
    const fresh = await verifyWebhook({ ...input, now: 1700000100_000 });
    expect(fresh.ok && fresh.value.valid).toBe(true);
    expect(fresh.ok && fresh.value.warnings).toEqual([]);
    const old = await verifyWebhook({ ...input, now: 1800000000_000 });
    expect(old.ok && old.value.valid).toBe(true);
    expect(old.ok && old.value.warnings[0]).toContain('tolerance');
  });
  it('verifies Slack signatures (needs the timestamp)', async () => {
    const ts = '1700000000';
    const mac = await hmacText('SHA-256', 'slack-secret', `v0:${ts}:body=1`);
    if (!mac.ok) throw new Error('hmac failed');
    const input = {
      provider: 'slack' as const,
      payload: 'body=1',
      secret: 'slack-secret',
      signature: `v0=${mac.value.hex}`,
      now: 1700000100_000,
    };
    expect((await verifyWebhook({ ...input, timestamp: ts })).ok).toBe(true);
    const ok = await verifyWebhook({ ...input, timestamp: ts });
    expect(ok.ok && ok.value.valid).toBe(true);
    expect((await verifyWebhook(input)).ok).toBe(false);
  });
  it('verifies Shopify / generic Base64 and generic hex', async () => {
    const mac = await hmacText('SHA-256', 's', 'payload');
    if (!mac.ok) throw new Error('hmac failed');
    const b64 = await verifyWebhook({
      provider: 'shopify',
      payload: 'payload',
      secret: 's',
      signature: mac.value.base64,
    });
    expect(b64.ok && b64.value.valid).toBe(true);
    const hex = await verifyWebhook({
      provider: 'hex',
      payload: 'payload',
      secret: 's',
      signature: `sha256=${mac.value.hex.toUpperCase()}`,
    });
    expect(hex.ok && hex.value.valid).toBe(true);
  });
  it('validates inputs and formats', async () => {
    expect((await verifyWebhook({ ...base, provider: 'github', signature: '' })).ok).toBe(false);
    expect((await verifyWebhook({ ...base, provider: 'github', signature: 'nope' })).ok).toBe(
      false,
    );
    expect((await verifyWebhook({ ...base, provider: 'stripe', signature: 'v1=abc' })).ok).toBe(
      false,
    );
    expect((await verifyWebhook({ ...base, provider: 'slack', signature: 'v0=ab' })).ok).toBe(
      false,
    );
    expect(
      (await verifyWebhook({ provider: 'github', payload: 'x', secret: '', signature: GH })).ok,
    ).toBe(false);
  });
  it('warns when the payload ends with stray whitespace', async () => {
    const r = await verifyWebhook({
      ...base,
      provider: 'github',
      signature: GH,
      payload: 'Hello, World!\n',
    });
    expect(r.ok && r.value.valid).toBe(false);
    expect(r.ok && r.value.warnings[0]).toContain('whitespace');
  });
  it('compares in constant time and handles length mismatches', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('JWKS support', () => {
  const subtle = globalThis.crypto.subtle;
  const alg = {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  } as const;

  async function setup() {
    const a = await subtle.generateKey(alg, true, ['sign', 'verify']);
    const b = await subtle.generateKey(alg, true, ['sign', 'verify']);
    const jwkOf = async (k: CryptoKeyPair, kid: string) => ({
      ...(await subtle.exportKey('jwk', k.publicKey)),
      kid,
      use: 'sig',
      alg: 'RS256',
    });
    const jwks = JSON.stringify({ keys: [await jwkOf(a, 'key-a'), await jwkOf(b, 'key-b')] });
    const sign = async (k: CryptoKeyPair, kid?: string) => {
      const input = `${utf8ToBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(kid ? { kid } : {}) }))}.${utf8ToBase64Url('{"sub":"1"}')}`;
      const sig = await subtle.sign(
        'RSASSA-PKCS1-v1_5',
        k.privateKey,
        new TextEncoder().encode(input) as unknown as BufferSource,
      );
      return `${input}.${bytesToBase64Url(new Uint8Array(sig))}`;
    };
    return { a, b, jwks, sign };
  }

  it('picks the key by kid', async () => {
    const { a, b, jwks, sign } = await setup();
    const good = await verifyJwt(await sign(b, 'key-b'), jwks);
    expect(good.ok && good.value.valid).toBe(true);
    const wrongKey = await verifyJwt(await sign(a, 'key-b'), jwks);
    expect(wrongKey.ok && wrongKey.value.valid).toBe(false);
  }, 30000);

  it('explains missing or unknown kids', async () => {
    const { a, jwks, sign } = await setup();
    const unknown = await verifyJwt(await sign(a, 'nope'), jwks);
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.error.message).toContain('key-a');
      expect(unknown.error.message).toContain('key-b');
    }
    const noKid = await verifyJwt(await sign(a), jwks);
    expect(noKid.ok).toBe(false);
  }, 30000);

  it('uses the only key when the token has no kid', async () => {
    const { a, sign } = await setup();
    const single = JSON.stringify({
      keys: [{ ...(await subtle.exportKey('jwk', a.publicKey)), kid: 'only' }],
    });
    const r = await verifyJwt(await sign(a), single);
    expect(r.ok && r.value.valid).toBe(true);
  }, 30000);
});

describe('shared converters', () => {
  it('exposes every target and converts a sample', () => {
    expect(CONVERTERS.map((c) => c.id)).toEqual([
      'ts',
      'zod',
      'cs',
      'py',
      'java',
      'go',
      'yaml',
      'csv',
      'xml',
    ]);
    for (const c of CONVERTERS) {
      const r = c.run({ id: 1, tags: ['a'] });
      expect(r.ok).toBe(true);
    }
  });
});
