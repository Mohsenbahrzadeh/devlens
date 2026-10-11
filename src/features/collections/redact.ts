import type { HttpRequestSpec } from '@/features/http/types';

export interface SavedRequest {
  id: string;
  name: string;
  method: HttpRequestSpec['method'];
  url: string;
  headers: { name: string; value: string }[];
  body: string;
  savedAt: number;
}

const SECRET_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-amz-security-token',
]);

const SECRET_PARAMS =
  /^(access[_-]?token|id[_-]?token|refresh[_-]?token|token|api[_-]?key|apikey|key|secret|client[_-]?secret|password|passwd|pwd|sig|signature|auth|code)$/i;

export const isSecretHeader = (name: string): boolean => {
  const n = name.trim().toLowerCase();
  return SECRET_HEADERS.has(n) || /(token|secret|password|api-?key)/.test(n);
};

/** Blanks secret query-parameter values (e.g. `?token=abc` becomes `?token=`). */
export function redactUrl(url: string): string {
  const q = url.indexOf('?');
  if (q < 0) return url;
  const hash = url.indexOf('#', q);
  const query = url.slice(q + 1, hash < 0 ? undefined : hash);
  const redacted = query
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const name = decodeURIComponent(pair.slice(0, eq).replace(/\+/g, ' '));
      return SECRET_PARAMS.test(name) ? `${pair.slice(0, eq)}=` : pair;
    })
    .join('&');
  return `${url.slice(0, q + 1)}${redacted}${hash < 0 ? '' : url.slice(hash)}`;
}

/**
 * Prepares a request for optional local saving. Secret headers keep their name but lose their value;
 * the body is only kept when the user explicitly asked for it.
 */
export function sanitizeForSave(
  spec: HttpRequestSpec,
  name: string,
  includeBody: boolean,
  now: number = Date.now(),
): SavedRequest {
  return {
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || `${spec.method} ${spec.url.replace(/^https?:\/\//, '').slice(0, 40)}`,
    method: spec.method,
    url: redactUrl(spec.url),
    headers: spec.headers
      .filter((h) => h.name.trim())
      .map((h) => ({ name: h.name, value: isSecretHeader(h.name) ? '' : h.value })),
    body: includeBody ? spec.body : '',
    savedAt: now,
  };
}
