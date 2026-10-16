import { describe, expect, it } from 'vitest';
import {
  applyEnvironment,
  emptyEnvironment,
  findVarRefs,
  substituteVars,
} from '@/features/sender/utils/environments';
import {
  evaluateAssertion,
  evaluateAssertions,
  type Assertion,
} from '@/features/sender/utils/assertions';
import type { SentResponse } from '@/features/sender/utils/network';
import {
  allPassed,
  emptyCollection,
  emptyRequest,
  summarizeRun,
  type RunResult,
} from '@/features/sender/utils/collections';
import { generateHttpFile } from '@/features/http/generators/httpFile';
import {
  collectionRunToMarkdown,
  fuzzToMarkdown,
  securityHeadersToMarkdown,
} from '@/features/sender/utils/reportMarkdown';
import type { FuzzRow } from '@/features/sender/utils/fuzz';
import type { Finding } from '@/features/sender/utils/securityHeaders';

function res(partial: Partial<SentResponse> = {}): SentResponse {
  return {
    status: 200,
    statusText: 'OK',
    headers: [],
    bodyText: '',
    bodyTruncated: false,
    timeMs: 10,
    redirected: false,
    finalUrl: 'https://api.example.com/',
    ...partial,
  };
}

describe('environments', () => {
  it('finds unique var refs across url, headers and body', () => {
    const refs = findVarRefs({
      method: 'POST',
      url: 'https://api.example.com/{{orderId}}',
      headers: [{ name: 'Authorization', value: 'Bearer {{token}}' }],
      body: '{"id":"{{orderId}}"}',
    });
    expect(refs).toEqual(['orderId', 'token']);
  });

  it('substitutes known vars and leaves unknown ones untouched', () => {
    expect(substituteVars('hello {{name}} and {{missing}}', { name: 'world' })).toBe(
      'hello world and {{missing}}',
    );
  });

  it('applies an environment across the whole request spec', () => {
    const spec = applyEnvironment(
      {
        method: 'GET',
        url: 'https://{{host}}/orders/{{id}}',
        headers: [{ name: '{{headerName}}', value: 'Bearer {{token}}' }],
        body: '{{token}}',
      },
      { host: 'api.example.com', id: '42', headerName: 'Authorization', token: 'secret' },
    );
    expect(spec.url).toBe('https://api.example.com/orders/42');
    expect(spec.headers).toEqual([{ name: 'Authorization', value: 'Bearer secret' }]);
    expect(spec.body).toBe('secret');
  });

  it('creates a fresh empty environment with a unique id', () => {
    const a = emptyEnvironment();
    const b = emptyEnvironment();
    expect(a.id).not.toBe(b.id);
    expect(a.variables).toEqual({});
  });
});

describe('assertions', () => {
  it('evaluates status assertions', () => {
    expect(
      evaluateAssertion({ kind: 'status', op: 'eq', value: 200 }, res({ status: 200 })).pass,
    ).toBe(true);
    expect(
      evaluateAssertion({ kind: 'status', op: 'eq', value: 200 }, res({ status: 404 })).pass,
    ).toBe(false);
    expect(
      evaluateAssertion({ kind: 'status', op: 'lt', value: 300 }, res({ status: 201 })).pass,
    ).toBe(true);
    expect(
      evaluateAssertion({ kind: 'status', op: 'gte', value: 500 }, res({ status: 503 })).pass,
    ).toBe(true);
  });

  it('evaluates header assertions', () => {
    const r = res({ headers: [{ name: 'Content-Type', value: 'application/json' }] });
    expect(evaluateAssertion({ kind: 'header', name: 'content-type', op: 'exists' }, r).pass).toBe(
      true,
    );
    expect(evaluateAssertion({ kind: 'header', name: 'x-missing', op: 'exists' }, r).pass).toBe(
      false,
    );
    expect(
      evaluateAssertion({ kind: 'header', name: 'Content-Type', op: 'contains', value: 'json' }, r)
        .pass,
    ).toBe(true);
    expect(
      evaluateAssertion({ kind: 'header', name: 'Content-Type', op: 'eq', value: 'text/html' }, r)
        .pass,
    ).toBe(false);
  });

  it('evaluates body-contains assertions', () => {
    const r = res({ bodyText: 'hello world' });
    expect(evaluateAssertion({ kind: 'body-contains', text: 'world' }, r).pass).toBe(true);
    expect(evaluateAssertion({ kind: 'body-contains', text: 'nope' }, r).pass).toBe(false);
  });

  it('evaluates json-path assertions, including non-JSON bodies', () => {
    const r = res({ bodyText: '{"data":{"id":"abc"}}' });
    expect(evaluateAssertion({ kind: 'json-path', path: '$.data.id', op: 'exists' }, r).pass).toBe(
      true,
    );
    expect(
      evaluateAssertion({ kind: 'json-path', path: '$.data.id', op: 'eq', value: 'abc' }, r).pass,
    ).toBe(true);
    expect(
      evaluateAssertion({ kind: 'json-path', path: '$.data.id', op: 'eq', value: 'xyz' }, r).pass,
    ).toBe(false);
    expect(
      evaluateAssertion(
        { kind: 'json-path', path: '$.data.id', op: 'exists' },
        res({ bodyText: 'not json' }),
      ).pass,
    ).toBe(false);
  });

  it('evaluates max-time assertions', () => {
    expect(evaluateAssertion({ kind: 'max-time', ms: 500 }, res({ timeMs: 200 })).pass).toBe(true);
    expect(evaluateAssertion({ kind: 'max-time', ms: 500 }, res({ timeMs: 900 })).pass).toBe(false);
  });

  it('evaluateAssertions runs every assertion in order', () => {
    const assertions: Assertion[] = [
      { kind: 'status', op: 'eq', value: 200 },
      { kind: 'max-time', ms: 50 },
    ];
    const results = evaluateAssertions(assertions, res({ status: 200, timeMs: 10 }));
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.pass)).toBe(true);
  });
});

describe('collections', () => {
  it('creates empty collections and requests with unique ids', () => {
    const c1 = emptyCollection();
    const c2 = emptyCollection();
    expect(c1.id).not.toBe(c2.id);
    expect(c1.requests).toEqual([]);
    const r1 = emptyRequest();
    const r2 = emptyRequest();
    expect(r1.id).not.toBe(r2.id);
    expect(r1.method).toBe('GET');
  });

  it('allPassed is true only when every assertion passed', () => {
    expect(allPassed([{ assertion: { kind: 'max-time', ms: 1 }, pass: true, message: 'ok' }])).toBe(
      true,
    );
    expect(
      allPassed([
        { assertion: { kind: 'max-time', ms: 1 }, pass: true, message: 'ok' },
        { assertion: { kind: 'max-time', ms: 1 }, pass: false, message: 'bad' },
      ]),
    ).toBe(false);
  });

  it('summarizeRun counts passed/failed requests and failed assertions', () => {
    const req = emptyRequest();
    const results: RunResult[] = [
      {
        request: req,
        status: 200,
        timeMs: 10,
        assertionResults: [{ assertion: { kind: 'max-time', ms: 1 }, pass: true, message: 'ok' }],
      },
      {
        request: req,
        status: 500,
        timeMs: 10,
        assertionResults: [
          { assertion: { kind: 'status', op: 'eq', value: 200 }, pass: false, message: 'bad' },
        ],
      },
      { request: req, status: 0, timeMs: 10, error: 'timeout', assertionResults: [] },
    ];
    expect(summarizeRun(results)).toEqual({
      requests: 3,
      passed: 1,
      failed: 2,
      assertionsFailed: 1,
    });
  });
});

describe('generateHttpFile', () => {
  it('generates a request-line + headers + body block', () => {
    const out = generateHttpFile({
      method: 'POST',
      url: 'https://api.example.com/orders ',
      headers: [
        { name: 'Content-Type', value: 'application/json' },
        { name: '', value: 'ignored' },
      ],
      body: '{"a":1}',
    });
    expect(out).toBe(
      'POST https://api.example.com/orders\nContent-Type: application/json\n\n{"a":1}\n',
    );
  });

  it('omits the body for GET requests', () => {
    const out = generateHttpFile({
      method: 'GET',
      url: 'https://api.example.com/orders',
      headers: [],
      body: 'ignored for GET',
    });
    expect(out).toBe('GET https://api.example.com/orders\n');
  });
});

describe('reportMarkdown', () => {
  it('fuzzToMarkdown builds a table with a flagged-row count', () => {
    const rows: FuzzRow[] = [
      { value: '1', status: 200, ok: true, timeMs: 5, bodyLength: 10, baseline: true, flags: [] },
      {
        value: "'",
        status: 500,
        ok: false,
        timeMs: 20,
        bodyLength: 999,
        baseline: false,
        flags: ['SQL error'],
      },
    ];
    const md = fuzzToMarkdown(rows, '{{FUZZ}}', 'https://api.example.com/');
    expect(md).toContain('# Fuzz report');
    expect(md).toContain('2 requests sent, 1 flagged.');
    expect(md).toContain('SQL error');
  });

  it('securityHeadersToMarkdown lists each finding', () => {
    const findings: Finding[] = [
      {
        id: 'hsts',
        severity: 'bad',
        title: 'Missing HSTS',
        detail: 'No Strict-Transport-Security',
      },
    ];
    const md = securityHeadersToMarkdown('https://api.example.com/', findings);
    expect(md).toContain('# Security headers report');
    expect(md).toContain('Missing HSTS');
  });

  it('collectionRunToMarkdown reports pass/fail per request', () => {
    const req = emptyRequest('Get order');
    const results: RunResult[] = [
      {
        request: req,
        status: 200,
        timeMs: 12,
        assertionResults: [
          {
            assertion: { kind: 'status', op: 'eq', value: 200 },
            pass: true,
            message: 'status == 200',
          },
        ],
      },
    ];
    const md = collectionRunToMarkdown('My collection', results);
    expect(md).toContain('# Collection run report');
    expect(md).toContain('Get order');
    expect(md).toContain('status == 200');
  });
});
