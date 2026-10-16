import { parseJson } from '@/lib/json';
import { queryJsonPath } from '@/features/json/utils/jsonpath';
import type { SentResponse } from './network';

export type Assertion =
  | { kind: 'status'; op: 'eq' | 'lt' | 'gte'; value: number }
  | { kind: 'header'; name: string; op: 'exists' | 'eq' | 'contains'; value?: string }
  | { kind: 'body-contains'; text: string }
  | { kind: 'json-path'; path: string; op: 'exists' | 'eq'; value?: string }
  | { kind: 'max-time'; ms: number };

export interface AssertionResult {
  assertion: Assertion;
  pass: boolean;
  message: string;
}

export function describeAssertion(a: Assertion): string {
  switch (a.kind) {
    case 'status':
      return `status ${a.op === 'eq' ? '==' : a.op === 'lt' ? '<' : '>='} ${a.value}`;
    case 'header':
      return a.op === 'exists'
        ? `header "${a.name}" exists`
        : `header "${a.name}" ${a.op} "${a.value}"`;
    case 'body-contains':
      return `body contains "${a.text}"`;
    case 'json-path':
      return a.op === 'exists' ? `${a.path} exists` : `${a.path} == "${a.value}"`;
    case 'max-time':
      return `response time <= ${a.ms} ms`;
  }
}

function headerValue(res: SentResponse, name: string): string | undefined {
  return res.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

/** Evaluates one assertion against a sent response. Pure — no network calls. */
export function evaluateAssertion(a: Assertion, res: SentResponse): AssertionResult {
  const desc = describeAssertion(a);
  switch (a.kind) {
    case 'status': {
      const pass =
        a.op === 'eq'
          ? res.status === a.value
          : a.op === 'lt'
            ? res.status < a.value
            : res.status >= a.value;
      return { assertion: a, pass, message: pass ? desc : `${desc} (got ${res.status})` };
    }
    case 'header': {
      const v = headerValue(res, a.name);
      const pass =
        a.op === 'exists'
          ? v !== undefined
          : a.op === 'eq'
            ? v === a.value
            : (v?.includes(a.value ?? '') ?? false);
      return {
        assertion: a,
        pass,
        message: pass ? desc : `${desc} (got ${v === undefined ? '(missing)' : `"${v}"`})`,
      };
    }
    case 'body-contains': {
      const pass = res.bodyText.includes(a.text);
      return { assertion: a, pass, message: pass ? desc : `${desc} — not found` };
    }
    case 'json-path': {
      const parsed = parseJson(res.bodyText);
      if (!parsed.ok)
        return { assertion: a, pass: false, message: `${desc} — response body is not JSON` };
      const found = queryJsonPath(parsed.value, a.path);
      if (!found.ok)
        return { assertion: a, pass: false, message: `${desc} — ${found.error.message}` };
      if (a.op === 'exists') {
        const pass = found.value.length > 0;
        return { assertion: a, pass, message: pass ? desc : `${desc} — no match` };
      }
      const actual = found.value[0];
      const actualText =
        actual === undefined
          ? undefined
          : typeof actual === 'string'
            ? actual
            : JSON.stringify(actual);
      const pass = actualText === a.value;
      return {
        assertion: a,
        pass,
        message: pass
          ? desc
          : `${desc} (got ${actualText === undefined ? '(no match)' : `"${actualText}"`})`,
      };
    }
    case 'max-time': {
      const pass = res.timeMs <= a.ms;
      return { assertion: a, pass, message: pass ? desc : `${desc} (took ${res.timeMs} ms)` };
    }
  }
}

export function evaluateAssertions(assertions: Assertion[], res: SentResponse): AssertionResult[] {
  return assertions.map((a) => evaluateAssertion(a, res));
}
