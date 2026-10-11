import { parseJson } from '@/lib/json';
import { fail, ok, type Result } from '@/types/result';
import type { HttpHeader, HttpMethod, HttpRequestSpec, MultipartField } from '../types';

export type BodyMode = 'raw' | 'form' | 'multipart' | 'graphql';

export interface KeyValue {
  name: string;
  value: string;
}

export interface BodyState {
  mode: BodyMode;
  raw: string;
  form: KeyValue[];
  multipart: MultipartField[];
  gqlQuery: string;
  gqlVariables: string;
}

export const emptyBodyState: BodyState = {
  mode: 'raw',
  raw: '',
  form: [{ name: '', value: '' }],
  multipart: [{ name: '', value: '' }],
  gqlQuery: '',
  gqlVariables: '',
};

function withHeader(headers: HttpHeader[], name: string, value: string): HttpHeader[] {
  const has = headers.some((h) => h.name.trim().toLowerCase() === name.toLowerCase());
  return has ? headers : [...headers, { name, value }];
}

export const formEncode = (fields: KeyValue[]): string =>
  fields
    .filter((f) => f.name.trim())
    .map((f) => `${encodeURIComponent(f.name)}=${encodeURIComponent(f.value)}`)
    .join('&');

/** Combines the request line/headers with the selected body editor into one request spec. */
export function buildRequest(
  base: { method: HttpMethod; url: string; headers: HttpHeader[] },
  state: BodyState,
): Result<HttpRequestSpec> {
  const { method, url, headers } = base;
  switch (state.mode) {
    case 'raw':
      return ok({ method, url, headers, body: state.raw });
    case 'form': {
      const body = formEncode(state.form);
      return ok({
        method,
        url,
        headers: body
          ? withHeader(headers, 'Content-Type', 'application/x-www-form-urlencoded')
          : headers,
        body,
      });
    }
    case 'multipart':
      return ok({
        method,
        url,
        headers,
        body: '',
        multipart: state.multipart.filter((f) => f.name.trim()),
      });
    case 'graphql': {
      if (!state.gqlQuery.trim())
        return fail('Missing query', 'Enter a GraphQL query or mutation.');
      const payload: { query: string; variables?: unknown } = { query: state.gqlQuery.trim() };
      if (state.gqlVariables.trim()) {
        const vars = parseJson(state.gqlVariables);
        if (!vars.ok)
          return fail(`Variables: ${vars.error.title}`, vars.error.message, vars.error.details);
        payload.variables = vars.value;
      }
      return ok({
        method,
        url,
        headers: withHeader(headers, 'Content-Type', 'application/json'),
        body: JSON.stringify(payload),
      });
    }
  }
}
