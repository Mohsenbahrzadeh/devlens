import { STATUS_CODES } from '@/features/encoding/utils/statusCodes';

/* ---------- input shape (a HAR entry as delivered by chrome.devtools.network) ---------- */

interface Header {
  name: string;
  value: string;
}

export interface HarTimings {
  blocked?: number;
  dns?: number;
  connect?: number;
  ssl?: number;
  send?: number;
  wait?: number;
  receive?: number;
  _blocked_queueing?: number;
}

export interface JourneyEntry {
  startedDateTime: string;
  time: number;
  serverIPAddress?: string;
  connection?: string;
  _fromCache?: string;
  _error?: string;
  _resourceType?: string;
  _initiator?: {
    type?: string;
    url?: string;
    lineNumber?: number;
    stack?: { callFrames?: { functionName?: string; url?: string; lineNumber?: number }[] };
  };
  timings?: HarTimings;
  request: { method: string; url: string; httpVersion?: string; headers: Header[] };
  response: {
    status: number;
    statusText: string;
    httpVersion?: string;
    redirectURL?: string;
    headers: Header[];
    content?: { size?: number; mimeType?: string };
    _error?: string;
    _transferSize?: number;
  };
}

const lower = (headers: Header[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const h of headers) {
    const k = h.name.toLowerCase();
    out[k] = k in out ? `${out[k]}, ${h.value}` : h.value;
  }
  return out;
};
const round = (n: number) => Math.round(n * 100) / 100;
const valid = (n: number | undefined): n is number => typeof n === 'number' && n >= 0;
const startMs = (e: JourneyEntry) => Date.parse(e.startedDateTime) || 0;

/* ---------- timing stages ---------- */

export type StageId = 'queue' | 'stalled' | 'dns' | 'tcp' | 'tls' | 'send' | 'wait' | 'receive';

export interface Stage {
  id: StageId;
  label: string;
  hint: string;
  ms: number;
  /** Offset from the start of the request, in ms. */
  start: number;
}

const STAGE_INFO: Record<StageId, { label: string; hint: string }> = {
  queue: { label: 'Queued', hint: 'Waiting in the browser (priority, per-host connection limit).' },
  stalled: {
    label: 'Stalled',
    hint: 'Blocked before sending (proxy negotiation, connection slot).',
  },
  dns: { label: 'DNS lookup', hint: 'Resolving the host name to an IP address.' },
  tcp: { label: 'TCP connect', hint: 'Opening the connection to the server.' },
  tls: { label: 'TLS handshake', hint: 'Negotiating encryption (HTTPS).' },
  send: { label: 'Request sent', hint: 'Sending the request headers and body.' },
  wait: {
    label: 'Waiting (TTFB)',
    hint: 'Time until the first byte of the response: server and network latency.',
  },
  receive: { label: 'Download', hint: 'Receiving the response body.' },
};

export function buildStages(entry: JourneyEntry): { stages: Stage[]; total: number } {
  const t = entry.timings;
  if (!t || entry._fromCache) return { stages: [], total: round(Math.max(0, entry.time)) };

  const blocked = valid(t.blocked) ? t.blocked : 0;
  const queueing = valid(t._blocked_queueing) ? Math.min(t._blocked_queueing, blocked) : 0;
  const tls = valid(t.ssl) ? t.ssl : 0;
  const connect = valid(t.connect) ? t.connect : 0;
  const raw: [StageId, number][] = [
    ['queue', queueing],
    ['stalled', blocked - queueing],
    ['dns', valid(t.dns) ? t.dns : 0],
    ['tcp', Math.max(0, connect - tls)], // HAR counts TLS time inside "connect"
    ['tls', tls],
    ['send', valid(t.send) ? t.send : 0],
    ['wait', valid(t.wait) ? t.wait : 0],
    ['receive', valid(t.receive) ? t.receive : 0],
  ];
  let offset = 0;
  const stages: Stage[] = [];
  for (const [id, ms] of raw) {
    if (ms <= 0 && id !== 'wait') continue;
    stages.push({ id, ...STAGE_INFO[id], ms: round(ms), start: round(offset) });
    offset += ms;
  }
  return { stages, total: round(offset > 0 ? offset : Math.max(0, entry.time)) };
}

/* ---------- connection ---------- */

export interface ConnectionInfo {
  ip?: string;
  protocol: string;
  secure: boolean;
  connectionId?: string;
  /** true: reused, false: new connection, null: unknown (e.g. cached). */
  reused: boolean | null;
  fromCache: boolean;
}

export function normalizeProtocol(v: string | undefined): string {
  const s = (v ?? '').toLowerCase();
  if (s === 'h3' || s.startsWith('h3-') || s.includes('http/3')) return 'HTTP/3';
  if (s === 'h2' || s.includes('http/2')) return 'HTTP/2';
  if (s.includes('1.1')) return 'HTTP/1.1';
  if (s.includes('1.0')) return 'HTTP/1.0';
  return v ? v.toUpperCase() : 'unknown';
}

export function describeConnection(entry: JourneyEntry, all: JourneyEntry[] = []): ConnectionInfo {
  const fromCache = Boolean(entry._fromCache);
  const t = entry.timings;
  let reused: boolean | null = null;
  if (!fromCache && t) {
    if ((valid(t.connect) && t.connect > 0) || (valid(t.dns) && t.dns > 0)) reused = false;
    else if (
      entry.connection &&
      all.some(
        (e) => e !== entry && e.connection === entry.connection && startMs(e) <= startMs(entry),
      )
    ) {
      reused = true;
    } else if (valid(t.connect) || t.connect === -1) reused = true;
  }
  return {
    ip: entry.serverIPAddress?.replace(/^\[|\]$/g, '') || undefined,
    protocol: normalizeProtocol(entry.response.httpVersion ?? entry.request.httpVersion),
    secure: entry.request.url.startsWith('https:'),
    connectionId: entry.connection,
    reused,
    fromCache,
  };
}

/* ---------- initiator ---------- */

export function initiatorLabel(entry: JourneyEntry): string {
  const i = entry._initiator;
  if (!i?.type) return 'the browser';
  const frame = i.stack?.callFrames?.[0];
  if (i.type === 'script' && frame?.url) {
    const where = `${frame.url.split('/').slice(-1)[0] || frame.url}:${(frame.lineNumber ?? 0) + 1}`;
    return `script ${frame.functionName ? `${frame.functionName}() ` : ''}(${where})`;
  }
  if (i.type === 'parser')
    return `the HTML parser${i.url ? ` (${i.url.split('/').slice(-1)[0]})` : ''}`;
  return i.type;
}

/* ---------- intermediaries (inferred from response headers) ---------- */

export type HopKind = 'cdn' | 'proxy' | 'gateway' | 'platform' | 'server' | 'framework';

export interface Hop {
  kind: HopKind;
  name: string;
  detail?: string;
  evidence: string[];
}

type Match = { name: string; kind: HopKind; detail?: string; evidence: string[] } | null;

const ev = (h: Record<string, string>, ...names: string[]) =>
  names.filter((n) => n in h).map((n) => `${n}: ${h[n]}`);

const RULES: ((h: Record<string, string>) => Match)[] = [
  (h) => {
    if (!('cf-ray' in h) && !/cloudflare/i.test(h.server ?? '')) return null;
    const pop = /-([A-Za-z]{3})$/.exec(h['cf-ray'] ?? '')?.[1];
    return {
      name: 'Cloudflare',
      kind: 'cdn',
      detail: pop ? `edge location ${pop.toUpperCase()}` : undefined,
      evidence: ev(h, 'cf-ray', 'server', 'cf-cache-status'),
    };
  },
  (h) => {
    if (!('x-amz-cf-id' in h) && !('x-amz-cf-pop' in h) && !/cloudfront/i.test(h.via ?? ''))
      return null;
    return {
      name: 'Amazon CloudFront',
      kind: 'cdn',
      detail: h['x-amz-cf-pop'] ? `edge location ${h['x-amz-cf-pop']}` : undefined,
      evidence: ev(h, 'x-amz-cf-pop', 'x-amz-cf-id', 'via', 'x-cache'),
    };
  },
  (h) => {
    if (!/cache-/.test(h['x-served-by'] ?? '') && !('fastly-debug-digest' in h)) return null;
    return {
      name: 'Fastly',
      kind: 'cdn',
      detail: h['x-served-by'] ? `served by ${h['x-served-by']}` : undefined,
      evidence: ev(h, 'x-served-by', 'x-cache', 'x-timer'),
    };
  },
  (h) => {
    if (
      !Object.keys(h).some((k) => k.startsWith('x-akamai')) &&
      !/akamai/i.test(h.server ?? '') &&
      !('akamai-grn' in h)
    )
      return null;
    return {
      name: 'Akamai',
      kind: 'cdn',
      evidence: ev(h, 'server', 'akamai-grn', 'x-akamai-request-id'),
    };
  },
  (h) => {
    if (!('x-vercel-id' in h)) return null;
    const region = h['x-vercel-id'].split('::')[0];
    return {
      name: 'Vercel',
      kind: 'platform',
      detail: region ? `region ${region}` : undefined,
      evidence: ev(h, 'x-vercel-id', 'x-vercel-cache'),
    };
  },
  (h) =>
    'x-nf-request-id' in h || /netlify/i.test(h.server ?? '')
      ? { name: 'Netlify', kind: 'platform', evidence: ev(h, 'x-nf-request-id', 'server') }
      : null,
  (h) =>
    'x-azure-ref' in h
      ? { name: 'Azure Front Door', kind: 'cdn', evidence: ev(h, 'x-azure-ref') }
      : null,
  (h) =>
    /google/i.test(h.via ?? '') || /^(gws|esf|gse|google frontend)$/i.test(h.server ?? '')
      ? { name: 'Google Front End', kind: 'gateway', evidence: ev(h, 'via', 'server') }
      : null,
  (h) =>
    /awselb/i.test(h.server ?? '')
      ? { name: 'AWS load balancer', kind: 'gateway', evidence: ev(h, 'server') }
      : null,
  (h) =>
    'apigw-requestid' in h
      ? {
          name: 'Amazon API Gateway',
          kind: 'gateway',
          evidence: ev(h, 'apigw-requestid', 'x-amzn-requestid'),
        }
      : null,
  (h) =>
    /vegur/i.test(h.via ?? '')
      ? { name: 'Heroku router', kind: 'gateway', evidence: ev(h, 'via') }
      : null,
  (h) => {
    if (!/envoy/i.test(h.server ?? '') && !('x-envoy-upstream-service-time' in h)) return null;
    const up = h['x-envoy-upstream-service-time'];
    return {
      name: 'Envoy proxy',
      kind: 'proxy',
      detail: up ? `upstream took ${up} ms` : undefined,
      evidence: ev(h, 'server', 'x-envoy-upstream-service-time'),
    };
  },
  (h) =>
    /varnish/i.test(h.via ?? '') || 'x-varnish' in h
      ? { name: 'Varnish cache', kind: 'proxy', evidence: ev(h, 'via', 'x-varnish') }
      : null,
];

const KNOWN_SERVERS =
  /^(nginx|apache|microsoft-iis|kestrel|caddy|openresty|litespeed|gunicorn|uvicorn|cowboy|jetty|tomcat|traefik|haproxy|express|werkzeug|envoy)/i;

export function detectIntermediaries(headers: Header[]): Hop[] {
  const h = lower(headers);
  const hops: Hop[] = [];
  const claimed = new Set<string>();
  for (const rule of RULES) {
    const m = rule(h);
    if (m) {
      hops.push(m);
      claimed.add(m.name.toLowerCase());
    }
  }
  // Generic Via hops that no rule explained.
  for (const part of (h.via ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const known = [...claimed].some((c) =>
      part.toLowerCase().includes(c.split(' ')[0].toLowerCase()),
    );
    if (!known)
      hops.push({
        name: part,
        kind: 'proxy',
        detail: 'listed in the Via header',
        evidence: [`via: ${part}`],
      });
  }
  const server = h.server;
  if (server && !hops.some((x) => x.evidence.some((e) => e.startsWith('server:')))) {
    hops.push({
      name: server,
      kind: 'server',
      detail: KNOWN_SERVERS.test(server) ? 'web server / reverse proxy' : undefined,
      evidence: [`server: ${server}`],
    });
  }
  if (h['x-powered-by']) {
    hops.push({
      name: h['x-powered-by'],
      kind: 'framework',
      evidence: [`x-powered-by: ${h['x-powered-by']}`],
    });
  }
  return hops;
}

/* ---------- cache ---------- */

export interface CacheInfo {
  state: 'hit' | 'miss' | 'stale' | 'bypass' | 'revalidated' | 'unknown';
  ageSeconds?: number;
  detail: string;
}

export function cacheInfo(entry: JourneyEntry): CacheInfo {
  const h = lower(entry.response.headers);
  const age = h.age !== undefined && /^\d+$/.test(h.age) ? Number(h.age) : undefined;
  if (entry._fromCache) {
    return {
      state: 'hit',
      ageSeconds: age,
      detail: `served from the browser ${entry._fromCache} cache without contacting the server`,
    };
  }
  if (entry.response.status === 304)
    return {
      state: 'revalidated',
      detail: 'the server confirmed the cached copy is still valid (304)',
    };
  const raw = (h['cf-cache-status'] ?? h['x-cache-status'] ?? h['x-cache'] ?? '').toUpperCase();
  const where =
    'cf-cache-status' in h
      ? 'Cloudflare'
      : 'x-cache' in h || 'x-cache-status' in h
        ? 'a CDN/proxy cache'
        : 'a cache';
  if (/BYPASS|DYNAMIC/.test(raw))
    return {
      state: 'bypass',
      ageSeconds: age,
      detail: `${where} did not cache this response (${raw})`,
    };
  if (/STALE|EXPIRED|REVALIDATED/.test(raw))
    return { state: 'stale', ageSeconds: age, detail: `${where} reported ${raw}` };
  if (/HIT/.test(raw))
    return {
      state: 'hit',
      ageSeconds: age,
      detail: `${where} answered from cache${age !== undefined ? ` (age ${age}s)` : ''}`,
    };
  if (/MISS/.test(raw))
    return { state: 'miss', ageSeconds: age, detail: `${where} had to ask the origin server` };
  if (age !== undefined && age > 0)
    return {
      state: 'hit',
      ageSeconds: age,
      detail: `an intermediate cache held this response for ${age}s (Age header)`,
    };
  return { state: 'unknown', detail: 'no cache headers were found' };
}

/* ---------- correlation ids and Server-Timing ---------- */

export interface TraceId {
  name: string;
  value: string;
  source: 'request' | 'response';
}

export interface TraceInfo {
  ids: TraceId[];
  traceparent?: { traceId: string; spanId: string; sampled: boolean };
}

const TRACE_HEADERS = [
  'traceparent',
  'x-request-id',
  'x-correlation-id',
  'x-amzn-trace-id',
  'request-id',
  'x-trace-id',
  'x-b3-traceid',
  'cf-ray',
];

export function traceIds(entry: JourneyEntry): TraceInfo {
  const ids: TraceId[] = [];
  for (const [source, headers] of [
    ['request', entry.request.headers],
    ['response', entry.response.headers],
  ] as const) {
    const h = lower(headers);
    for (const name of TRACE_HEADERS) if (name in h) ids.push({ name, value: h[name], source });
  }
  const tp = ids.find((i) => i.name === 'traceparent');
  const m = tp
    ? /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(tp.value.trim())
    : null;
  return {
    ids,
    traceparent: m
      ? { traceId: m[1], spanId: m[2], sampled: (parseInt(m[3], 16) & 1) === 1 }
      : undefined,
  };
}

export interface ServerTimingEntry {
  name: string;
  durationMs?: number;
  description?: string;
}

export function parseServerTiming(value: string | undefined): ServerTimingEntry[] {
  if (!value) return [];
  const out: ServerTimingEntry[] = [];
  const re = /([A-Za-z0-9!#$%&'*+.^_`|~-]+)((?:\s*;\s*[A-Za-z]+\s*=\s*(?:"[^"]*"|[^;,\s]+))*)/g;
  for (const m of value.matchAll(re)) {
    const dur = /dur\s*=\s*([\d.]+)/i.exec(m[2]);
    const desc = /desc\s*=\s*(?:"([^"]*)"|([^;,\s]+))/i.exec(m[2]);
    out.push({
      name: m[1],
      durationMs: dur ? Number(dur[1]) : undefined,
      description: desc ? (desc[1] ?? desc[2]) : undefined,
    });
  }
  return out;
}

/* ---------- redirects and CORS preflight ---------- */

export interface ChainHop {
  url: string;
  method: string;
  status: number;
  current: boolean;
}

const is3xx = (e: JourneyEntry) => e.response.status >= 300 && e.response.status < 400;

function redirectTarget(e: JourneyEntry): string | undefined {
  const loc = e.response.redirectURL || lower(e.response.headers).location;
  if (!loc) return undefined;
  try {
    return new URL(loc, e.request.url).href;
  } catch {
    return undefined;
  }
}

const sameUrl = (a: string, b: string) => a.split('#')[0] === b.split('#')[0];

/** Reconstructs the redirect chain this request belongs to (empty when it was not redirected). */
export function buildRedirectChain(entry: JourneyEntry, all: JourneyEntry[]): ChainHop[] {
  const chain: JourneyEntry[] = [entry];
  const seen = new Set<JourneyEntry>(chain);

  for (let cur = entry; chain.length < 20;) {
    const target = is3xx(cur) ? redirectTarget(cur) : undefined;
    if (!target) break;
    const next = all
      .filter((e) => !seen.has(e) && sameUrl(e.request.url, target) && startMs(e) >= startMs(cur))
      .sort((a, b) => startMs(a) - startMs(b))[0];
    if (!next) break;
    chain.push(next);
    seen.add(next);
    cur = next;
  }
  for (let cur = entry; chain.length < 20;) {
    const prev = all
      .filter((e) => !seen.has(e) && is3xx(e) && startMs(e) <= startMs(cur))
      .filter((e) => {
        const t = redirectTarget(e);
        return t !== undefined && sameUrl(t, cur.request.url);
      })
      .sort((a, b) => startMs(b) - startMs(a))[0];
    if (!prev) break;
    chain.unshift(prev);
    seen.add(prev);
    cur = prev;
  }
  if (chain.length < 2) return [];
  return chain.map((e) => ({
    url: e.request.url,
    method: e.request.method,
    status: e.response.status,
    current: e === entry,
  }));
}

export interface Preflight {
  status: number;
  allowOrigin?: string;
  allowMethods?: string;
  allowHeaders?: string;
  maxAge?: string;
  credentials?: string;
}

/** Finds the CORS preflight (OPTIONS) request that preceded this request, if any. */
export function findPreflight(entry: JourneyEntry, all: JourneyEntry[]): Preflight | null {
  if (entry.request.method.toUpperCase() === 'OPTIONS') return null;
  const candidate = all
    .filter(
      (e) =>
        e !== entry &&
        e.request.method.toUpperCase() === 'OPTIONS' &&
        sameUrl(e.request.url, entry.request.url) &&
        'access-control-request-method' in lower(e.request.headers) &&
        startMs(e) <= startMs(entry) &&
        startMs(entry) - startMs(e) <= 10_000,
    )
    .sort((a, b) => startMs(b) - startMs(a))[0];
  if (!candidate) return null;
  const h = lower(candidate.response.headers);
  return {
    status: candidate.response.status,
    allowOrigin: h['access-control-allow-origin'],
    allowMethods: h['access-control-allow-methods'],
    allowHeaders: h['access-control-allow-headers'],
    maxAge: h['access-control-max-age'],
    credentials: h['access-control-allow-credentials'],
  };
}

/* ---------- diagnosis ---------- */

export type Severity = 'ok' | 'info' | 'warn' | 'error';

export interface Diagnosis {
  severity: Severity;
  title: string;
  advice: string[];
}

const NET_ERRORS: Record<string, [string, string[]]> = {
  ERR_NAME_NOT_RESOLVED: [
    'DNS lookup failed',
    [
      'The host name could not be resolved. Check the spelling, your DNS/VPN settings, and that the domain exists.',
    ],
  ],
  ERR_CONNECTION_REFUSED: [
    'Connection refused',
    [
      'Nothing is listening on that host and port, or a firewall rejected the connection. Is the server running and is the port right?',
    ],
  ],
  ERR_CONNECTION_RESET: [
    'Connection reset',
    [
      'The server or a device in between closed the connection abruptly (proxy, firewall, crash, or protocol mismatch).',
    ],
  ],
  ERR_CONNECTION_TIMED_OUT: [
    'Connection timed out',
    [
      'The server did not answer in time. It may be down, blocked by a firewall, or the address is wrong.',
    ],
  ],
  ERR_TIMED_OUT: [
    'Timed out',
    ['The request took too long. Check server load and network connectivity.'],
  ],
  ERR_INTERNET_DISCONNECTED: ['No internet connection', ['The browser is offline.']],
  ERR_ADDRESS_UNREACHABLE: [
    'Address unreachable',
    ['There is no route to that IP address (network, VPN or IPv6 issue).'],
  ],
  ERR_BLOCKED_BY_CLIENT: [
    'Blocked by a browser extension',
    [
      'An ad blocker or privacy extension blocked this request. Disable it for this site to confirm.',
    ],
  ],
  ERR_BLOCKED_BY_RESPONSE: [
    'Blocked by the response',
    ['The response headers (CORP, COEP or similar) prevented the page from using this resource.'],
  ],
  ERR_TOO_MANY_REDIRECTS: [
    'Too many redirects',
    ['The server keeps redirecting in a loop. Check redirect rules and cookies.'],
  ],
  ERR_SSL_PROTOCOL_ERROR: [
    'TLS handshake failed',
    [
      'The server does not speak TLS correctly on this port, or uses an unsupported protocol version/cipher.',
    ],
  ],
  ERR_ABORTED: [
    'Request aborted',
    ['The page cancelled the request (navigation, AbortController or a newer request).'],
  ],
  ERR_FAILED: [
    'Request failed',
    [
      'A generic failure. For cross-origin calls this is often a CORS rejection or mixed content. Check the Console for the exact message.',
    ],
  ],
};

function netError(entry: JourneyEntry): string | undefined {
  const raw = entry._error ?? entry.response._error;
  return raw ? /(ERR_[A-Z0-9_]+)/.exec(raw)?.[1] : undefined;
}

export function statusName(status: number, statusText?: string): string {
  return statusText?.trim() || STATUS_CODES.find((s) => s.code === status)?.name || '';
}

export function diagnose(entry: JourneyEntry, hasBearer = false): Diagnosis {
  const { status } = entry.response;
  const h = lower(entry.response.headers);
  const advice: string[] = [];
  const stages = buildStages(entry).stages;
  const ms = (id: StageId) => stages.find((s) => s.id === id)?.ms ?? 0;

  let severity: Severity;
  let title: string;

  if (status === 0) {
    const code = netError(entry);
    const known = code ? NET_ERRORS[code] : undefined;
    severity = 'error';
    title = known ? known[0] : 'The request did not complete';
    if (code && known) advice.push(...known[1], `Chrome error: net::${code}.`);
    else if (code) advice.push(`Chrome reported net::${code}.`);
    else
      advice.push(
        'No response was received. Common causes: CORS rejection, blocked by an extension, offline, DNS or TLS failure. Check the Console for the exact message.',
      );
  } else {
    const name = statusName(status, entry.response.statusText);
    title = `${status} ${name}`.trim();
    if (status < 200) {
      severity = 'info';
      advice.push('An informational response; the final response follows.');
    } else if (status < 300) {
      severity = 'ok';
      if (status === 201 && h.location) advice.push(`A resource was created: ${h.location}`);
      if (status === 204) advice.push('Success with no response body.');
      if (status === 202)
        advice.push('Accepted but not finished. Poll the status URL if one was given.');
    } else if (status < 400) {
      severity = 'info';
      if (status === 304)
        advice.push('Not modified: the browser reused its cached copy after asking the server.');
      else {
        const target = redirectTarget(entry);
        advice.push(
          target ? `Redirects to ${target}.` : 'A redirect without a usable Location header.',
        );
        if (status === 301 || status === 308)
          advice.push(
            'Permanent redirect: browsers cache it, so changes may not show up immediately.',
          );
      }
    } else if (status < 500) {
      severity = 'warn';
      const hints: Record<number, string> = {
        400: 'The server rejected the request as malformed. Check the body, parameters and Content-Type.',
        401: `Authentication is missing or invalid.${h['www-authenticate'] ? ` The server asks for: ${h['www-authenticate']}.` : ''}${hasBearer ? ' A Bearer token was sent: it may be expired, revoked or for another audience. Decode it in the JWT tab.' : ' No Bearer token was sent.'}`,
        403: 'You are authenticated but not allowed to do this (permissions, scope, IP allow-list or a WAF rule).',
        404: 'The URL does not exist (or is hidden). Check the path, the API version prefix and the HTTP method.',
        405: `This method is not allowed on this URL.${h.allow ? ` Allowed: ${h.allow}.` : ''}`,
        408: 'The server gave up waiting for the request.',
        409: 'The request conflicts with the current state of the resource (duplicate, version or edit conflict).',
        413: 'The request body is larger than the server accepts.',
        415: 'The Content-Type is not supported. Check the Content-Type header and body format.',
        422: 'The request is well-formed but failed validation. The response body usually lists the fields.',
        429: `Rate limited.${h['retry-after'] ? ` Retry after ${h['retry-after']}${/^\d+$/.test(h['retry-after']) ? ' seconds' : ''}.` : ' Slow down and retry with backoff.'}`,
      };
      advice.push(
        hints[status] ??
          'The server says the request is wrong. The response body usually explains why.',
      );
    } else {
      severity = 'error';
      const hints: Record<number, string> = {
        500: 'An unexpected error inside the server. Check server logs; the trace id below helps to find the request.',
        502: 'A gateway or proxy received an invalid response from the upstream server (it may be down or crashed).',
        503: `The service is unavailable (overloaded or in maintenance).${h['retry-after'] ? ` Retry after ${h['retry-after']}.` : ''}`,
        504: 'A gateway or proxy timed out waiting for the upstream server. The backend is too slow or unreachable.',
      };
      advice.push(hints[status] ?? 'A server-side error.');
    }
  }

  if (status !== 0 && !entry._fromCache) {
    if (ms('wait') > 1000)
      advice.push(`Slow server response: ${ms('wait')} ms until the first byte.`);
    if (ms('dns') > 200) advice.push(`Slow DNS lookup: ${ms('dns')} ms.`);
    if (ms('tcp') > 300) advice.push(`Slow TCP connect: ${ms('tcp')} ms (distance or congestion).`);
    if (ms('tls') > 300) advice.push(`Slow TLS handshake: ${ms('tls')} ms.`);
    if (ms('queue') + ms('stalled') > 500)
      advice.push(
        `The request waited ${round(ms('queue') + ms('stalled'))} ms in the browser before being sent.`,
      );
    if (
      severity === 'ok' &&
      advice.length > 0 &&
      advice.every((a) => /^Slow|^The request waited/.test(a))
    )
      severity = 'warn';
  }
  return { severity, title, advice };
}

/* ---------- everything together ---------- */

export interface Journey {
  method: string;
  url: string;
  status: number;
  statusName: string;
  initiator: string;
  stages: Stage[];
  total: number;
  connection: ConnectionInfo;
  chain: ChainHop[];
  preflight: Preflight | null;
  hops: Hop[];
  cache: CacheInfo;
  trace: TraceInfo;
  serverTiming: ServerTimingEntry[];
  diagnosis: Diagnosis;
}

export function summarizeJourney(
  entry: JourneyEntry,
  all: JourneyEntry[] = [],
  hasBearer = false,
): Journey {
  const { stages, total } = buildStages(entry);
  return {
    method: entry.request.method,
    url: entry.request.url,
    status: entry.response.status,
    statusName: statusName(entry.response.status, entry.response.statusText),
    initiator: initiatorLabel(entry),
    stages,
    total,
    connection: describeConnection(entry, all),
    chain: buildRedirectChain(entry, all),
    preflight: findPreflight(entry, all),
    hops: detectIntermediaries(entry.response.headers),
    cache: cacheInfo(entry),
    trace: traceIds(entry),
    serverTiming: parseServerTiming(lower(entry.response.headers)['server-timing']),
    diagnosis: diagnose(entry, hasBearer),
  };
}

/** A plain-text report for tickets and chat. Pass `maskUrl` to hide secrets in URLs. */
export function journeyToMarkdown(j: Journey, maskUrl: (url: string) => string = (u) => u): string {
  const lines: string[] = [];
  const c = j.connection;
  lines.push(
    `# Request journey`,
    '',
    `\`${j.method} ${maskUrl(j.url)}\` → **${j.status || 'failed'} ${j.statusName}**${j.total ? ` in ${j.total} ms` : ''}`,
    '',
  );
  lines.push(`- Started by: ${j.initiator}`);
  if (j.chain.length > 0) {
    lines.push('', '## Redirects');
    j.chain.forEach((h, i) =>
      lines.push(
        `${i + 1}. ${h.status} ${h.method} \`${maskUrl(h.url)}\`${h.current ? ' ← this request' : ''}`,
      ),
    );
  }
  if (j.preflight) {
    lines.push(
      '',
      '## CORS preflight',
      `- OPTIONS answered ${j.preflight.status}${j.preflight.allowOrigin ? `, allow-origin ${j.preflight.allowOrigin}` : ''}${j.preflight.allowMethods ? `, methods ${j.preflight.allowMethods}` : ''}`,
    );
  }
  lines.push('', '## Connection');
  lines.push(
    `- ${c.protocol}${c.secure ? ' over TLS' : ' (not encrypted)'}${c.ip ? ` to ${c.ip}` : ''}`,
  );
  lines.push(
    `- ${c.fromCache ? 'Served from the browser cache' : c.reused === null ? 'Connection reuse unknown' : c.reused ? 'Reused an existing connection' : 'Opened a new connection'}`,
  );
  if (j.stages.length > 0) {
    lines.push(
      '',
      '## Timing',
      '| Stage | ms |',
      '| --- | ---: |',
      ...j.stages.map((s) => `| ${s.label} | ${s.ms} |`),
      `| **Total** | **${j.total}** |`,
    );
  }
  if (j.hops.length > 0) {
    lines.push('', '## Intermediaries (inferred from response headers, not measured)');
    for (const h of j.hops) lines.push(`- ${h.name}${h.detail ? ` — ${h.detail}` : ''}`);
  }
  lines.push('', '## Cache', `- ${j.cache.detail}`);
  if (j.trace.ids.length > 0) {
    lines.push(
      '',
      '## Correlation ids',
      ...j.trace.ids.map((t) => `- ${t.name} (${t.source}): ${t.value}`),
    );
  }
  if (j.serverTiming.length > 0) {
    lines.push(
      '',
      '## Server-Timing',
      ...j.serverTiming.map(
        (s) =>
          `- ${s.name}${s.durationMs !== undefined ? `: ${s.durationMs} ms` : ''}${s.description ? ` (${s.description})` : ''}`,
      ),
    );
  }
  lines.push('', `## Result: ${j.diagnosis.title}`, ...j.diagnosis.advice.map((a) => `- ${a}`));
  return lines.join('\n') + '\n';
}
