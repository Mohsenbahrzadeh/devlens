import type { HttpHeader, HttpRequestSpec } from '@/features/http/types';

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
}

const VAR_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

/** Every `{{name}}` reference found in a request (url, headers, body), in first-seen order. */
export function findVarRefs(spec: HttpRequestSpec): string[] {
  const text = [spec.url, spec.body, ...spec.headers.flatMap((h) => [h.name, h.value])].join('\n');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

/** Replaces every `{{name}}` with the matching variable; unknown names are left untouched. */
export function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(VAR_RE, (whole, name: string) => (name in vars ? vars[name] : whole));
}

/** Applies an environment's variables to a request's URL, headers and body. */
export function applyEnvironment(
  spec: HttpRequestSpec,
  vars: Record<string, string>,
): HttpRequestSpec {
  const sub = (s: string) => substituteVars(s, vars);
  const headers: HttpHeader[] = spec.headers.map((h) => ({
    name: sub(h.name),
    value: sub(h.value),
  }));
  return { ...spec, url: sub(spec.url), headers, body: sub(spec.body) };
}

export const emptyEnvironment = (name = 'New environment'): Environment => ({
  id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  name,
  variables: {},
});
