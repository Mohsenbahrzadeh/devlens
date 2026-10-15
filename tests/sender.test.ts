import { describe, expect, it, vi } from 'vitest';
import {
  analyzeSecurityHeaders,
  parseSetCookie,
  summarize,
} from '@/features/sender/utils/securityHeaders';
import {
  countMarkers,
  injectFuzzValue,
  markBaseline,
  numericRange,
  parseWordlist,
  type FuzzRow,
} from '@/features/sender/utils/fuzz';
import { analyzeRateResults, runBatch, type RateRow } from '@/features/sender/utils/rateLimit';
import { sendRequest } from '@/features/sender/utils/network';
import type { HttpRequestSpec } from '@/features/http/types';

const h = (pairs: [string, string][]) => pairs.map(([name, value]) => ({ name, value }));

describe('parseSetCookie', () => {
  it('reads flags', () => {
    expect(parseSetCookie('sid=abc; Path=/; Secure; HttpOnly; SameSite=Strict')).toEqual({
      name: 'sid',
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
    });
    expect(parseSetCookie('a=1')).toEqual({
      name: 'a',
      secure: false,
      httpOnly: false,
      sameSite: undefined,
    });
  });
});

describe('analyzeSecurityHeaders', () => {
  const url = 'https://api.example.com/x';

  it('flags a bare response with no protective headers', () => {
    const findings = analyzeSecurityHeaders(url, []);
    const ids = findings.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['csp', 'hsts', 'xcto', 'clickjacking']));
    expect(findings.every((f) => f.severity !== 'good')).toBe(true);
  });

  it('approves a well-configured response', () => {
    const findings = analyzeSecurityHeaders(
      url,
      h([
        ['Content-Security-Policy', "default-src 'self'"],
        ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
        ['X-Content-Type-Options', 'nosniff'],
        ['X-Frame-Options', 'DENY'],
        ['Referrer-Policy', 'strict-origin-when-cross-origin'],
      ]),
    );
    const bySev = summarize(findings);
    expect(bySev.bad).toBe(0);
    expect(bySev.warn).toBe(0);
    expect(findings.find((f) => f.id === 'hsts')?.severity).toBe('good');
  });

  it('does not require HSTS over plain HTTP', () => {
    expect(analyzeSecurityHeaders('http://x.io', []).some((f) => f.id === 'hsts')).toBe(false);
  });

  it('flags unsafe-inline CSP and unsafe-url referrer policy', () => {
    const findings = analyzeSecurityHeaders(
      url,
      h([
        ['Content-Security-Policy', "script-src 'unsafe-inline'"],
        ['Referrer-Policy', 'unsafe-url'],
      ]),
    );
    expect(findings.find((f) => f.id === 'csp')?.severity).toBe('warn');
    expect(findings.find((f) => f.id === 'referrer')?.severity).toBe('warn');
  });

  it('flags the dangerous CORS wildcard + credentials combination', () => {
    const findings = analyzeSecurityHeaders(
      url,
      h([
        ['Access-Control-Allow-Origin', '*'],
        ['Access-Control-Allow-Credentials', 'true'],
      ]),
    );
    expect(findings.find((f) => f.id === 'cors')?.severity).toBe('bad');
  });

  it('audits multiple Set-Cookie headers independently', () => {
    const findings = analyzeSecurityHeaders(url, [
      { name: 'Set-Cookie', value: 'a=1; Secure; HttpOnly; SameSite=Lax' },
      { name: 'Set-Cookie', value: 'b=2' },
      { name: 'Set-Cookie', value: 'c=3; SameSite=None' },
    ]);
    expect(findings.some((f) => f.id === 'cookie-secure-a')).toBe(false);
    expect(findings.find((f) => f.id === 'cookie-secure-b')?.severity).toBe('warn');
    expect(findings.find((f) => f.id === 'cookie-httponly-b')?.severity).toBe('info');
    expect(findings.find((f) => f.id === 'cookie-samesite-c')?.severity).toBe('bad');
  });

  it('notes server/framework fingerprinting headers', () => {
    const findings = analyzeSecurityHeaders(
      url,
      h([
        ['Server', 'Apache/2.4.41'],
        ['X-Powered-By', 'PHP/7.4.3'],
      ]),
    );
    expect(findings.find((f) => f.id === 'server')?.severity).toBe('info');
    expect(findings.find((f) => f.id === 'x-powered-by')).toBeTruthy();
  });
});

describe('fuzz utilities', () => {
  it('parses a wordlist, dropping blanks and duplicates', () => {
    expect(parseWordlist('1\n\n2\n1\n  3  \n')).toEqual(['1', '2', '3']);
  });
  it('builds numeric ranges in both directions', () => {
    expect(numericRange(1, 5)).toEqual(['1', '2', '3', '4', '5']);
    expect(numericRange(5, 1)).toEqual(['5', '4', '3', '2', '1']);
    expect(numericRange(0, 10, 5)).toEqual(['0', '5', '10']);
    expect(numericRange(1, 0, 0)).toEqual([]);
  });
  it('counts and replaces every marker across url, headers and body', () => {
    const spec: HttpRequestSpec = {
      method: 'POST',
      url: 'https://x.io/users/{{FUZZ}}',
      headers: [{ name: 'X-Id', value: '{{FUZZ}}' }],
      body: '{"id":"{{FUZZ}}"}',
    };
    expect(countMarkers(spec)).toBe(3);
    const out = injectFuzzValue(spec, '42');
    expect(out.url).toBe('https://x.io/users/42');
    expect(out.headers[0].value).toBe('42');
    expect(out.body).toBe('{"id":"42"}');
    expect(spec.url).toBe('https://x.io/users/{{FUZZ}}'); // original untouched
  });
  it('marks the most common (status, length) pair as the baseline', () => {
    const rows: FuzzRow[] = [
      { value: '1', status: 200, ok: true, timeMs: 1, bodyLength: 50, baseline: false },
      { value: '2', status: 200, ok: true, timeMs: 1, bodyLength: 50, baseline: false },
      { value: '3', status: 404, ok: false, timeMs: 1, bodyLength: 10, baseline: false },
    ];
    const marked = markBaseline(rows);
    expect(marked.filter((r) => r.baseline).map((r) => r.value)).toEqual(['1', '2']);
  });
  it('marks nothing as baseline when every result is unique', () => {
    const rows: FuzzRow[] = [
      { value: '1', status: 200, ok: true, timeMs: 1, bodyLength: 50, baseline: false },
      { value: '2', status: 201, ok: true, timeMs: 1, bodyLength: 60, baseline: false },
    ];
    expect(markBaseline(rows).some((r) => r.baseline)).toBe(false);
  });
});

describe('rate-limit utilities', () => {
  it('summarises successes, throttling and latency percentiles', () => {
    const rows: RateRow[] = [
      { index: 0, status: 200, ok: true, timeMs: 10 },
      { index: 1, status: 200, ok: true, timeMs: 20 },
      { index: 2, status: 429, ok: false, timeMs: 5, retryAfter: '1' },
      { index: 3, status: 429, ok: false, timeMs: 5 },
    ];
    const a = analyzeRateResults(rows);
    expect(a).toMatchObject({
      total: 4,
      succeeded: 2,
      failed: 2,
      firstThrottledAt: 2,
      throttledCount: 2,
    });
    expect(a.medianMs).toBeGreaterThan(0);
  });
  it('reports no throttling when every request succeeds', () => {
    const rows: RateRow[] = [
      { index: 0, status: 200, ok: true, timeMs: 1 },
      { index: 1, status: 200, ok: true, timeMs: 1 },
    ];
    expect(analyzeRateResults(rows).firstThrottledAt).toBeUndefined();
  });

  it('runs a batch with bounded concurrency and respects abort', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const send = async (i: number) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i;
    };
    const out: number[] = [];
    for await (const r of runBatch(10, 3, send)) out.push(r);
    expect(out.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(maxInFlight).toBeLessThanOrEqual(3);

    const controller = new AbortController();
    const out2: number[] = [];
    let n = 0;
    for await (const r of runBatch(20, 2, async (i) => i, controller.signal)) {
      out2.push(r);
      if (++n === 2) controller.abort();
    }
    expect(out2.length).toBeLessThan(20);
  });
});

describe('sendRequest', () => {
  const spec = (over: Partial<HttpRequestSpec> = {}): HttpRequestSpec => ({
    method: 'GET',
    url: 'https://api.example.com/x',
    headers: [],
    body: '',
    ...over,
  });

  it('rejects an invalid or non-HTTP URL before touching fetch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    expect((await sendRequest(spec({ url: 'not a url' }))).ok).toBe(false);
    expect((await sendRequest(spec({ url: 'ftp://x.io/f' }))).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('sends the method, headers and body, and reports the response', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"ok":true}', {
        status: 201,
        statusText: 'Created',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const r = await sendRequest(
      spec({ method: 'POST', headers: [{ name: 'X-A', value: '1' }], body: '{"a":1}' }),
    );
    expect(r.ok && r.value.status).toBe(201);
    expect(r.ok && r.value.bodyText).toBe('{"ok":true}');
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"a":1}');
    expect((init?.headers as Headers).get('X-A')).toBe('1');
    expect(init?.credentials).toBe('omit');
    fetchSpy.mockRestore();
  });

  it('sends multipart text fields as FormData and skips file fields', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('ok'));
    await sendRequest(
      spec({
        method: 'POST',
        multipart: [
          { name: 'title', value: 'hi' },
          { name: 'avatar', value: 'C:/x.png', file: true },
        ],
      }),
    );
    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get('title')).toBe('hi');
    expect(form.get('avatar')).toBeNull();
    fetchSpy.mockRestore();
  });

  it('turns a thrown network error into a readable failure', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    const r = await sendRequest(spec());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.title).toBe('Request failed');
    fetchSpy.mockRestore();
  });
});
