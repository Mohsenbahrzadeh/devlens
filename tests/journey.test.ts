import { describe, expect, it } from 'vitest';
import {
  buildRedirectChain,
  buildStages,
  cacheInfo,
  describeConnection,
  detectIntermediaries,
  diagnose,
  findPreflight,
  initiatorLabel,
  journeyToMarkdown,
  normalizeProtocol,
  parseServerTiming,
  summarizeJourney,
  traceIds,
  type JourneyEntry,
} from '@/features/http/utils/journey';

const T0 = Date.UTC(2026, 9, 13, 12, 0, 0);
const iso = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

function entry(
  over: Partial<JourneyEntry> & {
    status?: number;
    headers?: [string, string][];
    reqHeaders?: [string, string][];
    url?: string;
    method?: string;
    at?: number;
  } = {},
): JourneyEntry {
  const {
    status = 200,
    headers = [],
    reqHeaders = [],
    url = 'https://api.example.com/orders',
    method = 'GET',
    at = 0,
    ...rest
  } = over;
  return {
    startedDateTime: iso(at),
    time: 100,
    request: {
      method,
      url,
      httpVersion: 'h2',
      headers: reqHeaders.map(([name, value]) => ({ name, value })),
    },
    response: {
      status,
      statusText: '',
      httpVersion: 'h2',
      headers: headers.map(([name, value]) => ({ name, value })),
    },
    ...rest,
  };
}

describe('buildStages', () => {
  it('splits queueing/stalled and separates TLS from TCP', () => {
    const { stages, total } = buildStages(
      entry({
        timings: {
          blocked: 20,
          _blocked_queueing: 5,
          dns: 10,
          connect: 40,
          ssl: 25,
          send: 1,
          wait: 120,
          receive: 8,
        },
      }),
    );
    expect(stages.map((s) => [s.id, s.ms])).toEqual([
      ['queue', 5],
      ['stalled', 15],
      ['dns', 10],
      ['tcp', 15],
      ['tls', 25],
      ['send', 1],
      ['wait', 120],
      ['receive', 8],
    ]);
    expect(total).toBe(199);
    expect(stages.map((s) => s.start)).toEqual([0, 5, 20, 30, 45, 70, 71, 191]);
  });

  it('skips unavailable (-1) stages but always shows the wait', () => {
    const { stages } = buildStages(
      entry({
        timings: { blocked: 0, dns: -1, connect: -1, ssl: -1, send: 0, wait: 0, receive: 3 },
      }),
    );
    expect(stages.map((s) => s.id)).toEqual(['wait', 'receive']);
  });

  it('returns no stages for cached or untimed requests and falls back to the total time', () => {
    expect(buildStages(entry({ _fromCache: 'memory', timings: { wait: 5 } })).stages).toEqual([]);
    expect(buildStages(entry({ time: 42 }))).toEqual({ stages: [], total: 42 });
  });
});

describe('connection', () => {
  it('normalises protocol names', () => {
    expect(normalizeProtocol('h2')).toBe('HTTP/2');
    expect(normalizeProtocol('h3-29')).toBe('HTTP/3');
    expect(normalizeProtocol('http/1.1')).toBe('HTTP/1.1');
    expect(normalizeProtocol(undefined)).toBe('unknown');
  });
  it('detects a new connection, a reused one and the cache', () => {
    const fresh = entry({
      serverIPAddress: '[2001:db8::1]',
      timings: { dns: 8, connect: 30, ssl: 20, wait: 5 },
    });
    const c1 = describeConnection(fresh);
    expect(c1).toMatchObject({
      ip: '2001:db8::1',
      protocol: 'HTTP/2',
      secure: true,
      reused: false,
      fromCache: false,
    });

    const first = entry({ connection: '443', at: 0, timings: { dns: 5, connect: 20, wait: 5 } });
    const second = entry({ connection: '443', at: 50, timings: { dns: -1, connect: -1, wait: 5 } });
    expect(describeConnection(second, [first, second]).reused).toBe(true);
    expect(describeConnection(entry({ _fromCache: 'disk' })).fromCache).toBe(true);
    expect(describeConnection(entry({ _fromCache: 'disk' })).reused).toBeNull();
  });
});

describe('initiator', () => {
  it('describes scripts, the parser and unknown origins', () => {
    expect(initiatorLabel(entry())).toBe('the browser');
    expect(
      initiatorLabel(entry({ _initiator: { type: 'parser', url: 'https://x.io/index.html' } })),
    ).toBe('the HTML parser (index.html)');
    expect(
      initiatorLabel(
        entry({
          _initiator: {
            type: 'script',
            stack: {
              callFrames: [{ functionName: 'load', url: 'https://x.io/app.js', lineNumber: 41 }],
            },
          },
        }),
      ),
    ).toBe('script load() (app.js:42)');
  });
});

describe('detectIntermediaries', () => {
  const names = (h: [string, string][]) =>
    detectIntermediaries(h.map(([name, value]) => ({ name, value }))).map((x) => x.name);

  it('recognises Cloudflare with its edge location', () => {
    const hops = detectIntermediaries([
      { name: 'CF-RAY', value: '8a1b2c3d4e5f-FRA' },
      { name: 'Server', value: 'cloudflare' },
    ]);
    expect(hops[0]).toMatchObject({ name: 'Cloudflare', kind: 'cdn', detail: 'edge location FRA' });
    expect(hops).toHaveLength(1);
  });
  it('recognises CloudFront, Fastly, Vercel, Envoy and a plain web server', () => {
    expect(
      names([
        ['X-Amz-Cf-Pop', 'FRA56-C1'],
        ['X-Amz-Cf-Id', 'abc'],
      ]),
    ).toEqual(['Amazon CloudFront']);
    expect(names([['X-Served-By', 'cache-fra1234-FRA']])).toEqual(['Fastly']);
    expect(detectIntermediaries([{ name: 'x-vercel-id', value: 'fra1::abc-123' }])[0].detail).toBe(
      'region fra1',
    );
    const envoy = detectIntermediaries([
      { name: 'server', value: 'envoy' },
      { name: 'x-envoy-upstream-service-time', value: '37' },
    ]);
    expect(envoy[0]).toMatchObject({ name: 'Envoy proxy', detail: 'upstream took 37 ms' });
    expect(
      names([
        ['Server', 'nginx/1.25.3'],
        ['X-Powered-By', 'Express'],
      ]),
    ).toEqual(['nginx/1.25.3', 'Express']);
  });
  it('lists unexplained Via hops once each', () => {
    expect(names([['Via', '1.1 corp-proxy.local, 1.1 varnish']])).toEqual([
      'Varnish cache',
      '1.1 corp-proxy.local',
    ]);
  });
  it('finds nothing in plain responses', () => {
    expect(names([['Content-Type', 'application/json']])).toEqual([]);
  });
});

describe('cacheInfo', () => {
  it('reads CDN and browser cache signals', () => {
    expect(
      cacheInfo(
        entry({
          headers: [
            ['cf-cache-status', 'HIT'],
            ['age', '120'],
          ],
        }),
      ),
    ).toMatchObject({ state: 'hit', ageSeconds: 120 });
    expect(cacheInfo(entry({ headers: [['x-cache', 'Miss from cloudfront']] })).state).toBe('miss');
    expect(cacheInfo(entry({ headers: [['cf-cache-status', 'DYNAMIC']] })).state).toBe('bypass');
    expect(
      cacheInfo(
        entry({
          headers: [
            ['x-cache', 'Error from cloudfront'],
            ['age', '30'],
          ],
        }),
      ).state,
    ).toBe('hit');
    expect(cacheInfo(entry({ status: 304 })).state).toBe('revalidated');
    expect(cacheInfo(entry({ _fromCache: 'memory' })).state).toBe('hit');
    expect(cacheInfo(entry()).state).toBe('unknown');
  });
});

describe('trace ids and Server-Timing', () => {
  it('collects ids from both directions and parses traceparent', () => {
    const t = traceIds(
      entry({
        reqHeaders: [['traceparent', '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01']],
        headers: [
          ['X-Request-Id', 'req-123'],
          ['CF-Ray', 'abc-FRA'],
        ],
      }),
    );
    expect(t.ids.map((i) => `${i.source}:${i.name}`)).toEqual([
      'request:traceparent',
      'response:x-request-id',
      'response:cf-ray',
    ]);
    expect(t.traceparent).toEqual({
      traceId: '0af7651916cd43dd8448eb211c80319c',
      spanId: 'b7ad6b7169203331',
      sampled: true,
    });
  });
  it('parses Server-Timing entries, including quoted descriptions', () => {
    expect(
      parseServerTiming('db;dur=53.2, cache;desc="Cache Read";dur=23.2, total;dur=120'),
    ).toEqual([
      { name: 'db', durationMs: 53.2, description: undefined },
      { name: 'cache', durationMs: 23.2, description: 'Cache Read' },
      { name: 'total', durationMs: 120, description: undefined },
    ]);
    expect(parseServerTiming(undefined)).toEqual([]);
  });
});

describe('redirect chain', () => {
  const hop1 = entry({
    url: 'http://example.com/a',
    status: 301,
    headers: [['Location', 'https://example.com/a']],
    at: 0,
  });
  const hop2 = entry({
    url: 'https://example.com/a',
    status: 302,
    headers: [['Location', '/b']],
    at: 100,
  });
  const final = entry({ url: 'https://example.com/b', status: 200, at: 200 });
  const all = [hop1, hop2, final];

  it('rebuilds the chain from any member', () => {
    for (const e of all) {
      const chain = buildRedirectChain(e, all);
      expect(chain.map((h) => h.status)).toEqual([301, 302, 200]);
      expect(chain.filter((h) => h.current)).toHaveLength(1);
      expect(chain.find((h) => h.current)?.url).toBe(e.request.url);
    }
  });
  it('returns nothing for requests that were not redirected, and survives loops', () => {
    expect(buildRedirectChain(entry({ url: 'https://other.io/x', at: 5 }), all)).toEqual([]);
    const a = entry({ url: 'https://x.io/a', status: 302, headers: [['Location', '/b']], at: 0 });
    const b = entry({ url: 'https://x.io/b', status: 302, headers: [['Location', '/a']], at: 10 });
    expect(buildRedirectChain(a, [a, b]).length).toBeLessThanOrEqual(3);
  });
});

describe('CORS preflight', () => {
  it('finds the preceding OPTIONS request', () => {
    const pre = entry({
      method: 'OPTIONS',
      status: 204,
      at: 0,
      reqHeaders: [['Access-Control-Request-Method', 'POST']],
      headers: [
        ['Access-Control-Allow-Origin', 'https://app.io'],
        ['Access-Control-Allow-Methods', 'GET, POST'],
        ['Access-Control-Max-Age', '600'],
      ],
    });
    const main = entry({ method: 'POST', at: 20 });
    expect(findPreflight(main, [pre, main])).toEqual({
      status: 204,
      allowOrigin: 'https://app.io',
      allowMethods: 'GET, POST',
      allowHeaders: undefined,
      maxAge: '600',
      credentials: undefined,
    });
    expect(findPreflight(pre, [pre, main])).toBeNull();
    expect(findPreflight(entry({ method: 'POST', at: 60_000 }), [pre])).toBeNull();
  });
});

describe('diagnose', () => {
  it('treats 2xx as ok', () => {
    expect(diagnose(entry({ status: 200 })).severity).toBe('ok');
    const created = diagnose(entry({ status: 201, headers: [['Location', '/orders/7']] }));
    expect(created.advice[0]).toContain('/orders/7');
  });
  it('explains auth errors and points to the JWT tab when a bearer token was sent', () => {
    const d = diagnose(
      entry({ status: 401, headers: [['WWW-Authenticate', 'Bearer realm="api"']] }),
      true,
    );
    expect(d.severity).toBe('warn');
    expect(d.title).toBe('401 Unauthorized');
    expect(d.advice[0]).toContain('JWT tab');
    expect(d.advice[0]).toContain('Bearer realm');
    expect(diagnose(entry({ status: 401 }), false).advice[0]).toContain('No Bearer token');
  });
  it('explains rate limits, gateway errors and redirects', () => {
    expect(diagnose(entry({ status: 429, headers: [['Retry-After', '30']] })).advice[0]).toContain(
      '30 seconds',
    );
    const gw = diagnose(entry({ status: 504 }));
    expect(gw.severity).toBe('error');
    expect(gw.advice[0]).toContain('gateway');
    expect(
      diagnose(entry({ status: 301, headers: [['Location', 'https://x.io/new']] })).advice.join(
        ' ',
      ),
    ).toContain('https://x.io/new');
  });
  it('explains failed requests from the Chrome error code', () => {
    const d = diagnose(entry({ status: 0, _error: 'net::ERR_NAME_NOT_RESOLVED' }));
    expect(d.severity).toBe('error');
    expect(d.title).toBe('DNS lookup failed');
    expect(d.advice.join(' ')).toContain('net::ERR_NAME_NOT_RESOLVED');
    expect(diagnose(entry({ status: 0 })).title).toBe('The request did not complete');
    expect(
      diagnose(entry({ status: 0, _error: 'net::ERR_BLOCKED_BY_CLIENT' })).advice[0],
    ).toContain('ad blocker');
  });
  it('flags slow phases and downgrades an otherwise fine request to a warning', () => {
    const d = diagnose(entry({ timings: { dns: 5, connect: 5, wait: 2500, receive: 1 } }));
    expect(d.severity).toBe('warn');
    expect(d.advice[0]).toContain('2500 ms');
  });
});

describe('summary and report', () => {
  const e = entry({
    status: 200,
    url: 'https://api.example.com/orders?token=abc123',
    serverIPAddress: '203.0.113.7',
    timings: { dns: 10, connect: 40, ssl: 25, send: 1, wait: 120, receive: 8 },
    headers: [
      ['CF-Ray', 'x-FRA'],
      ['Server-Timing', 'db;dur=53'],
      ['X-Request-Id', 'r-1'],
    ],
  });
  it('builds a full journey', () => {
    const j = summarizeJourney(e, [e]);
    expect(j.total).toBe(179);
    expect(j.connection.ip).toBe('203.0.113.7');
    expect(j.hops[0].name).toBe('Cloudflare');
    expect(j.serverTiming[0]).toMatchObject({ name: 'db', durationMs: 53 });
    expect(j.diagnosis.severity).toBe('ok');
  });
  it('writes a Markdown report and masks URLs when asked', () => {
    const md = journeyToMarkdown(summarizeJourney(e, [e]), (u) => u.replace('abc123', 'REDACTED'));
    expect(md).toContain('# Request journey');
    expect(md).toContain(
      '`GET https://api.example.com/orders?token=REDACTED` → **200 OK** in 179 ms',
    );
    expect(md).toContain('| DNS lookup | 10 |');
    expect(md).toContain('Cloudflare — edge location FRA');
    expect(md).toContain('r-1');
    expect(md).not.toContain('abc123');
  });
});
