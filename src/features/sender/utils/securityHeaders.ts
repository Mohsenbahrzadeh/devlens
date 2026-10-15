export type Severity = 'good' | 'info' | 'warn' | 'bad';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface HeaderPair {
  name: string;
  value: string;
}

function allValues(headers: HeaderPair[], name: string): string[] {
  const n = name.toLowerCase();
  return headers.filter((h) => h.name.toLowerCase() === n).map((h) => h.value);
}
const first = (headers: HeaderPair[], name: string): string | undefined =>
  allValues(headers, name)[0];

/** Parses one Set-Cookie header value into its name and flags (best-effort; ignores the cookie value). */
export function parseSetCookie(raw: string): {
  name: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: string;
} {
  const parts = raw.split(';').map((p) => p.trim());
  const name = (parts[0] ?? '').split('=')[0];
  const lower = parts.map((p) => p.toLowerCase());
  const sameSitePart = parts.find((p) => p.toLowerCase().startsWith('samesite='));
  return {
    name,
    secure: lower.includes('secure'),
    httpOnly: lower.includes('httponly'),
    sameSite: sameSitePart?.split('=')[1],
  };
}

/**
 * Audits a response's security-relevant headers, the way securityheaders.com or Mozilla Observatory do.
 * Pure and offline: it only reads headers you already have (from a captured request or a response you sent).
 */
export function analyzeSecurityHeaders(url: string, headers: HeaderPair[]): Finding[] {
  const out: Finding[] = [];
  const secure = url.startsWith('https:');
  const add = (id: string, severity: Severity, title: string, detail: string) =>
    out.push({ id, severity, title, detail });

  const csp = first(headers, 'content-security-policy');
  if (!csp) {
    add(
      'csp',
      'warn',
      'No Content-Security-Policy',
      'A CSP restricts which scripts, styles and frames can run; without one, XSS is easier to exploit.',
    );
  } else {
    const risky = /unsafe-inline|unsafe-eval/i.test(csp);
    add(
      'csp',
      risky ? 'warn' : 'good',
      'Content-Security-Policy present',
      risky
        ? `Contains 'unsafe-inline' or 'unsafe-eval', which weakens XSS protection. Value: ${csp}`
        : csp,
    );
  }

  if (secure) {
    const hsts = first(headers, 'strict-transport-security');
    if (!hsts) {
      add(
        'hsts',
        'warn',
        'No Strict-Transport-Security',
        'Without HSTS, a user can be downgraded to plain HTTP by a network attacker on first visit.',
      );
    } else {
      const maxAge = Number(/max-age\s*=\s*(\d+)/i.exec(hsts)?.[1] ?? 0);
      const sixMonths = 15_552_000;
      add(
        'hsts',
        maxAge >= sixMonths ? 'good' : 'warn',
        'Strict-Transport-Security present',
        `${hsts}${maxAge < sixMonths ? ' — max-age is shorter than the commonly recommended 6 months.' : ''}`,
      );
    }
  }

  const xcto = first(headers, 'x-content-type-options');
  add(
    'xcto',
    xcto?.toLowerCase() === 'nosniff' ? 'good' : 'warn',
    xcto ? 'X-Content-Type-Options present' : 'No X-Content-Type-Options',
    xcto ??
      "Without 'nosniff', browsers may MIME-sniff responses, which can enable some content-type confusion attacks.",
  );

  const xfo = first(headers, 'x-frame-options');
  const frameAncestors = csp && /frame-ancestors/i.test(csp);
  if (frameAncestors)
    add(
      'clickjacking',
      'good',
      'Framing restricted via CSP',
      'frame-ancestors in the CSP controls who can embed this page.',
    );
  else if (xfo)
    add(
      'clickjacking',
      /^(deny|sameorigin)$/i.test(xfo.trim()) ? 'good' : 'warn',
      'X-Frame-Options present',
      xfo,
    );
  else
    add(
      'clickjacking',
      'warn',
      'No clickjacking protection',
      'Neither X-Frame-Options nor a CSP frame-ancestors directive was found; the page could be framed by another site.',
    );

  const ref = first(headers, 'referrer-policy');
  if (!ref)
    add(
      'referrer',
      'info',
      'No Referrer-Policy',
      'The browser default is used. Set one explicitly if the URL can contain sensitive data.',
    );
  else
    add(
      'referrer',
      /^unsafe-url$/i.test(ref.trim()) ? 'warn' : 'good',
      'Referrer-Policy present',
      ref +
        (/^unsafe-url$/i.test(ref.trim())
          ? ' — sends the full URL to any destination, including cross-origin.'
          : ''),
    );

  const pp = first(headers, 'permissions-policy');
  add(
    'permissions-policy',
    pp ? 'good' : 'info',
    pp ? 'Permissions-Policy present' : 'No Permissions-Policy',
    pp ?? 'Restricts browser features (camera, geolocation, …). Optional but good practice.',
  );

  for (const [h, label] of [
    ['cross-origin-opener-policy', 'Cross-Origin-Opener-Policy'],
    ['cross-origin-resource-policy', 'Cross-Origin-Resource-Policy'],
    ['cross-origin-embedder-policy', 'Cross-Origin-Embedder-Policy'],
  ] as const) {
    const v = first(headers, h);
    if (v) add(h, 'info', `${label} present`, v);
  }

  const server = first(headers, 'server');
  if (server && !/^(nginx|apache|cloudflare)$/i.test(server.trim())) {
    add(
      'server',
      'info',
      'Server header reveals software/version',
      `${server} — consider hiding exact versions to make targeted exploits harder to pick.`,
    );
  }
  const poweredBy = first(headers, 'x-powered-by');
  if (poweredBy)
    add('x-powered-by', 'info', 'X-Powered-By reveals the backend technology', poweredBy);

  const acao = first(headers, 'access-control-allow-origin');
  const acac = first(headers, 'access-control-allow-credentials');
  if (acao?.trim() === '*' && acac?.toLowerCase() === 'true') {
    add(
      'cors',
      'bad',
      'Dangerous CORS configuration',
      'Access-Control-Allow-Origin: * together with Access-Control-Allow-Credentials: true lets any site read authenticated responses. Browsers are supposed to reject this combination, but some server setups still send it — fix the server regardless.',
    );
  } else if (acao?.trim() === '*') {
    add(
      'cors',
      'info',
      'CORS open to any origin',
      'Access-Control-Allow-Origin: * — fine for public, non-authenticated APIs; risky if the response ever contains per-user data.',
    );
  }

  const cookies = allValues(headers, 'set-cookie').map(parseSetCookie);
  for (const c of cookies) {
    if (secure && !c.secure)
      add(
        `cookie-secure-${c.name}`,
        'warn',
        `Cookie "${c.name}" missing Secure`,
        'Over HTTPS, cookies should be marked Secure so they are never sent over plain HTTP.',
      );
    if (!c.httpOnly)
      add(
        `cookie-httponly-${c.name}`,
        'info',
        `Cookie "${c.name}" missing HttpOnly`,
        'Without HttpOnly, JavaScript (including injected XSS) can read this cookie. Skip this for cookies the page needs to read.',
      );
    if (c.sameSite?.toLowerCase() === 'none' && !c.secure)
      add(
        `cookie-samesite-${c.name}`,
        'bad',
        `Cookie "${c.name}": SameSite=None without Secure`,
        'Browsers reject this combination; the cookie will be dropped.',
      );
    else if (!c.sameSite)
      add(
        `cookie-samesite-${c.name}`,
        'info',
        `Cookie "${c.name}" has no SameSite`,
        'Browsers default to Lax, which is reasonable; set it explicitly to be sure.',
      );
  }

  return out;
}

export function summarize(findings: Finding[]): Record<Severity, number> {
  const s: Record<Severity, number> = { good: 0, info: 0, warn: 0, bad: 0 };
  for (const f of findings) s[f.severity]++;
  return s;
}
