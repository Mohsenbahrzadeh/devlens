import { fail, ok, type Result } from '@/types/result';

export interface ParsedQuery {
  /** URL without its query string / fragment, when a full URL was given. */
  base?: string;
  params: { key: string; value: string }[];
}

const decode = (s: string): string => {
  const plus = s.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plus);
  } catch {
    return plus;
  }
};

/** Accepts a full URL, `?a=1&b=2` or `a=1&b=2` and returns decoded key/value pairs. */
export function parseQuery(input: string): Result<ParsedQuery> {
  const text = input.trim();
  if (!text) return fail('Empty input', 'Paste a URL or query string.');
  let base: string | undefined;
  let query = text;
  const hashAt = query.indexOf('#');
  if (hashAt >= 0) query = query.slice(0, hashAt);
  const qAt = query.indexOf('?');
  if (qAt >= 0) {
    base = query.slice(0, qAt) || undefined;
    query = query.slice(qAt + 1);
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(query)) {
    return ok({ base: query, params: [] });
  }
  const params = query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      return eq < 0
        ? { key: decode(pair), value: '' }
        : { key: decode(pair.slice(0, eq)), value: decode(pair.slice(eq + 1)) };
    });
  return ok({ base, params });
}

/** Builds `a=1&b=2` from key/value pairs (blank keys are skipped, values are percent-encoded). */
export function buildQuery(params: { key: string; value: string }[]): string {
  return params
    .filter((p) => p.key.trim())
    .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
    .join('&');
}
