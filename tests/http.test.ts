import { describe, expect, it } from 'vitest';
import { generateCurl, shellQuote } from '@/features/http/generators/curl';
import { generateCSharp } from '@/features/http/generators/csharp';
import type { HttpRequestSpec } from '@/features/http/types';

const req = (o: Partial<HttpRequestSpec>): HttpRequestSpec => ({
  method: 'GET',
  url: 'https://api.example.com/x',
  headers: [],
  body: '',
  ...o,
});

describe('curl', () => {
  it('generates GET', () => {
    expect(generateCurl(req({}))).toBe("curl -X GET \\\n  'https://api.example.com/x'");
  });
  it('generates POST with headers and JSON body', () => {
    const out = generateCurl(
      req({
        method: 'POST',
        headers: [
          { name: 'Authorization', value: 'Bearer ***' },
          { name: 'Content-Type', value: 'application/json' },
        ],
        body: '{"a":1}',
      }),
    );
    expect(out).toContain("-H 'Authorization: Bearer ***'");
    expect(out).toContain("-H 'Content-Type: application/json'");
    expect(out).toContain('--data-raw \'{"a":1}\'');
  });
  it('omits body when empty and skips blank headers', () => {
    const out = generateCurl(req({ method: 'POST', headers: [{ name: ' ', value: 'x' }] }));
    expect(out).not.toContain('--data-raw');
    expect(out).not.toContain('-H');
  });
  it('escapes single quotes, backslashes, newlines and shell characters', () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(shellQuote('a\\b $x `y` "z"\n!')).toBe('\'a\\b $x `y` "z"\n!\'');
  });
  it('uses -I for HEAD', () => {
    expect(generateCurl(req({ method: 'HEAD' }))).toMatch(/^curl -I/);
  });
});

describe('csharp', () => {
  it('generates GET without content', () => {
    const out = generateCSharp(req({}));
    expect(out).toContain('HttpMethod.Get');
    expect(out).not.toContain('StringContent');
  });
  it('maps Authorization to AuthenticationHeaderValue', () => {
    const out = generateCSharp(
      req({
        method: 'POST',
        headers: [{ name: 'Authorization', value: 'Bearer abc' }],
        body: '{}',
      }),
    );
    expect(out).toContain('new AuthenticationHeaderValue("Bearer", "abc")');
  });
  it('uses the supplied content type and escapes the body', () => {
    const out = generateCSharp(
      req({
        method: 'POST',
        headers: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }],
        body: '{"q":"a\\b"}\n',
      }),
    );
    expect(out).toContain('"application/json"');
    expect(out).toContain('"{\\"q\\":\\"a\\\\b\\"}\\n"');
  });
  it('adds custom headers', () => {
    const out = generateCSharp(req({ headers: [{ name: 'X-Correlation-ID', value: 'abc123' }] }));
    expect(out).toContain('TryAddWithoutValidation("X-Correlation-ID", "abc123")');
  });
  it('supports all methods', () => {
    expect(generateCSharp(req({ method: 'PATCH', body: 'x' }))).toContain('HttpMethod.Patch');
    expect(generateCSharp(req({ method: 'OPTIONS' }))).toContain('HttpMethod.Options');
  });
});
