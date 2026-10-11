import { describe, expect, it } from 'vitest';
import { generateCurl } from '@/features/http/generators/curl';
import { generateFetch } from '@/features/http/generators/fetch';
import { generatePython } from '@/features/http/generators/python';
import { generateCSharp } from '@/features/http/generators/csharp';
import { generateTypedCSharp } from '@/features/http/generators/csharpClient';
import {
  buildRequest,
  emptyBodyState,
  formEncode,
  type BodyState,
} from '@/features/http/utils/bodyModes';
import { parseRawHttp } from '@/features/http/utils/rawHttp';
import { formatGraphQL } from '@/features/http/utils/graphql';
import { exampleFromSchema, operationToRequest, parseOpenApi } from '@/features/http/utils/openapi';
import { findBearerToken, harToSpec } from '@/features/http/utils/har';
import { isSecretHeader, redactUrl, sanitizeForSave } from '@/features/collections/redact';
import type { HttpRequestSpec } from '@/features/http/types';

const multipartReq: HttpRequestSpec = {
  method: 'POST',
  url: 'https://api.example.com/upload',
  headers: [
    { name: 'Authorization', value: 'Bearer abc' },
    { name: 'Content-Type', value: 'multipart/form-data' },
  ],
  body: '',
  multipart: [
    { name: 'title', value: "it's a test" },
    { name: 'avatar', value: 'C:\\pics\\me.png', file: true },
  ],
};

describe('multipart generators', () => {
  it('cURL uses -F and drops Content-Type', () => {
    const out = generateCurl(multipartReq);
    expect(out).toContain("-F 'title=it'\\''s a test'");
    expect(out).toContain("-F 'avatar=@C:\\pics\\me.png'");
    expect(out).not.toContain('Content-Type');
    expect(out).not.toContain('--data-raw');
  });
  it('fetch builds FormData without a manual Content-Type', () => {
    const out = generateFetch(multipartReq);
    expect(out).toContain('const form = new FormData();');
    expect(out).toContain('form.append("title", "it\'s a test");');
    expect(out).toContain('form.append("avatar", fileInput.files[0]);');
    expect(out).toContain('body: form,');
    expect(out).not.toContain('Content-Type');
  });
  it('Python splits text fields and files', () => {
    const out = generatePython(multipartReq);
    expect(out).toContain('data={');
    expect(out).toContain('"title": "it\'s a test",');
    expect(out).toContain('files={');
    expect(out).toContain('"avatar": open("C:\\\\pics\\\\me.png", "rb"),');
    expect(out).not.toContain('Content-Type');
  });
  it('C# uses MultipartFormDataContent', () => {
    const out = generateCSharp(multipartReq);
    expect(out).toContain('using var form = new MultipartFormDataContent();');
    expect(out).toContain('form.Add(new StringContent("it\'s a test"), "title");');
    expect(out).toContain(
      'new StreamContent(File.OpenRead("C:\\\\pics\\\\me.png")), "avatar", Path.GetFileName(',
    );
    expect(out).toContain('request.Content = form;');
    expect(out).not.toContain('StringContent(body');
  });
  it('typed C# refuses multipart', () => {
    expect(generateTypedCSharp(multipartReq, '').ok).toBe(false);
  });
  it('ignores multipart for GET', () => {
    expect(generateCurl({ ...multipartReq, method: 'GET' })).not.toContain('-F');
  });
});

describe('buildRequest', () => {
  const base = { method: 'POST' as const, url: 'https://x.io', headers: [] };
  const state = (p: Partial<BodyState>): BodyState => ({ ...emptyBodyState, ...p });

  it('passes raw bodies through', () => {
    const r = buildRequest(base, state({ raw: '{"a":1}' }));
    expect(r.ok && r.value.body).toBe('{"a":1}');
  });
  it('url-encodes form fields and adds Content-Type once', () => {
    const r = buildRequest(
      base,
      state({
        mode: 'form',
        form: [
          { name: 'q', value: 'a b&c' },
          { name: '', value: 'x' },
        ],
      }),
    );
    expect(r.ok && r.value.body).toBe('q=a%20b%26c');
    expect(r.ok && r.value.headers).toEqual([
      { name: 'Content-Type', value: 'application/x-www-form-urlencoded' },
    ]);
    const keep = buildRequest(
      { ...base, headers: [{ name: 'content-type', value: 'x/y' }] },
      state({ mode: 'form', form: [{ name: 'a', value: '1' }] }),
    );
    expect(keep.ok && keep.value.headers).toHaveLength(1);
    expect(formEncode([{ name: 'é', value: '1' }])).toBe('%C3%A9=1');
  });
  it('keeps multipart fields with names only', () => {
    const r = buildRequest(
      base,
      state({
        mode: 'multipart',
        multipart: [
          { name: 'a', value: '1' },
          { name: ' ', value: '' },
        ],
      }),
    );
    expect(r.ok && r.value.multipart).toEqual([{ name: 'a', value: '1' }]);
  });
  it('builds a GraphQL payload and validates variables', () => {
    const r = buildRequest(
      base,
      state({ mode: 'graphql', gqlQuery: '{ me { id } }', gqlVariables: '{"a":1}' }),
    );
    expect(r.ok && JSON.parse(r.value.body)).toEqual({
      query: '{ me { id } }',
      variables: { a: 1 },
    });
    expect(r.ok && r.value.headers[0].value).toBe('application/json');
    expect(buildRequest(base, state({ mode: 'graphql', gqlQuery: '' })).ok).toBe(false);
    expect(
      buildRequest(base, state({ mode: 'graphql', gqlQuery: '{a}', gqlVariables: '{bad' })).ok,
    ).toBe(false);
  });
});

describe('parseRawHttp', () => {
  it('parses a request with headers and a body', () => {
    const r = parseRawHttp(
      'POST /orders?x=1 HTTP/1.1\r\nHost: api.example.com\r\nContent-Type: application/json\r\nContent-Length: 7\r\n\r\n{"a":1}\r\n',
    );
    expect(r.ok && r.value).toEqual({
      method: 'POST',
      url: 'https://api.example.com/orders?x=1',
      headers: [{ name: 'Content-Type', value: 'application/json' }],
      body: '{"a":1}',
    });
  });
  it('uses http for localhost and accepts absolute URLs', () => {
    const a = parseRawHttp('GET /x HTTP/1.1\nHost: localhost:3000\n');
    expect(a.ok && a.value.url).toBe('http://localhost:3000/x');
    const b = parseRawHttp('GET https://z.io/p HTTP/1.1\n');
    expect(b.ok && b.value.url).toBe('https://z.io/p');
  });
  it('reports errors', () => {
    expect(parseRawHttp('').ok).toBe(false);
    expect(parseRawHttp('hello').ok).toBe(false);
    expect(parseRawHttp('GET /x HTTP/1.1').ok).toBe(false);
    expect(parseRawHttp('TRACE /x HTTP/1.1\nHost: a').ok).toBe(false);
  });
});

describe('formatGraphQL', () => {
  it('indents selections, fragments and variables', () => {
    const r = formatGraphQL(
      'query Q($id: ID!, $n: Int = 5) { user(id: $id) { id, name ...F ... on A { x } friends(first: $n) @include(if: true) { id } } }',
    );
    expect(r.ok && r.value).toBe(
      [
        'query Q($id: ID!, $n: Int = 5) {',
        '  user(id: $id) {',
        '    id',
        '    name',
        '    ...F',
        '    ... on A {',
        '      x',
        '    }',
        '    friends(first: $n) @include(if: true) {',
        '      id',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });
  it('keeps argument objects and lists inline, and preserves comments and strings', () => {
    const r = formatGraphQL('# hi\nmutation { add(input: {a: [1, 2], b: "x y"}) { id } }');
    expect(r.ok && r.value).toBe(
      '# hi\nmutation {\n  add(input: { a: [1, 2], b: "x y" }) {\n    id\n  }\n}\n',
    );
  });
  it('rejects unbalanced documents and empty input', () => {
    expect(formatGraphQL('{ a { b }').ok).toBe(false);
    expect(formatGraphQL(' ').ok).toBe(false);
  });
});

describe('OpenAPI', () => {
  const spec = JSON.stringify({
    openapi: '3.0.0',
    info: { title: 'Shop', version: '1.2' },
    servers: [{ url: 'https://api.shop.io/v1/' }],
    paths: {
      '/orders': {
        parameters: [{ name: 'tenant', in: 'query', required: true }],
        post: {
          summary: 'Create order',
          tags: ['orders'],
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } },
          },
        },
        get: { operationId: 'listOrders', parameters: [{ name: 'page', in: 'query' }] },
      },
    },
    components: {
      schemas: {
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            qty: { type: 'integer', example: 2 },
            status: { type: 'string', enum: ['new', 'paid'] },
            lines: {
              type: 'array',
              items: { type: 'object', properties: { sku: { type: 'string' } } },
            },
          },
        },
      },
    },
  });

  it('lists operations with examples', () => {
    const r = parseOpenApi(spec);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.title).toBe('Shop');
    expect(r.value.servers).toEqual(['https://api.shop.io/v1/']);
    expect(r.value.operations.map((o) => o.id)).toEqual(['GET /orders', 'POST /orders']);
    const post = r.value.operations[1];
    expect(post.bodyExample).toEqual({
      id: '00000000-0000-4000-8000-000000000000',
      qty: 2,
      status: 'new',
      lines: [{ sku: 'string' }],
    });
    expect(post.queryParams).toEqual([{ name: 'tenant', required: true }]);
  });
  it('turns an operation into a request', () => {
    const r = parseOpenApi(spec);
    if (!r.ok) throw new Error('parse failed');
    const req = operationToRequest(r.value.operations[1], r.value.servers[0]);
    expect(req.url).toBe('https://api.shop.io/v1/orders?tenant=');
    expect(req.method).toBe('POST');
    expect(req.headers).toEqual([{ name: 'Content-Type', value: 'application/json' }]);
    expect(JSON.parse(req.body).qty).toBe(2);
    const get = operationToRequest(r.value.operations[0], 'https://x.io');
    expect(get.body).toBe('');
  });
  it('rejects YAML, invalid JSON and non-OpenAPI documents', () => {
    expect(parseOpenApi('openapi: 3.0.0').ok).toBe(false);
    expect(parseOpenApi('{oops').ok).toBe(false);
    expect(parseOpenApi('{"a":1}').ok).toBe(false);
    expect(parseOpenApi('{"openapi":"3","paths":{}}').ok).toBe(false);
  });
  it('supports Swagger 2 bodies', () => {
    const r = parseOpenApi(
      JSON.stringify({
        swagger: '2.0',
        host: 'h.io',
        schemes: ['https'],
        basePath: '/api',
        paths: {
          '/a': {
            put: {
              parameters: [
                { in: 'body', schema: { type: 'object', properties: { n: { type: 'number' } } } },
              ],
            },
          },
        },
      }),
    );
    expect(r.ok && r.value.servers).toEqual(['https://h.io/api']);
    expect(r.ok && r.value.operations[0].bodyExample).toEqual({ n: 0 });
  });
  it('guards against recursive schemas', () => {
    const root = {
      components: {
        schemas: {
          Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } },
        },
      },
    };
    expect(() =>
      exampleFromSchema({ $ref: '#/components/schemas/Node' }, root as never),
    ).not.toThrow();
  });
});

describe('HAR helpers', () => {
  it('converts a HAR request and drops pseudo/transport headers', () => {
    const spec = harToSpec({
      method: 'post',
      url: 'https://x.io/a',
      headers: [
        { name: ':authority', value: 'x.io' },
        { name: 'Content-Length', value: '5' },
        { name: 'Accept', value: '*/*' },
      ],
      postData: { text: '{"a":1}' },
    });
    expect(spec).toEqual({
      method: 'POST',
      url: 'https://x.io/a',
      headers: [{ name: 'Accept', value: '*/*' }],
      body: '{"a":1}',
    });
    expect(harToSpec({ method: 'PROPFIND', url: 'u', headers: [] }).method).toBe('GET');
  });
  it('finds bearer tokens', () => {
    expect(findBearerToken([{ name: 'authorization', value: 'Bearer abc.def.ghi' }])).toBe(
      'abc.def.ghi',
    );
    expect(findBearerToken([{ name: 'Authorization', value: 'Basic xyz' }])).toBeNull();
  });
});

describe('saved request redaction', () => {
  it('detects secret headers', () => {
    for (const n of ['Authorization', 'Cookie', 'X-Api-Key', 'x-custom-token', 'X-Client-Secret']) {
      expect(isSecretHeader(n)).toBe(true);
    }
    expect(isSecretHeader('Content-Type')).toBe(false);
  });
  it('blanks secret query parameters', () => {
    expect(redactUrl('https://a.io/p?token=abc&page=2&api_key=k#frag')).toBe(
      'https://a.io/p?token=&page=2&api_key=#frag',
    );
    expect(redactUrl('https://a.io/p')).toBe('https://a.io/p');
  });
  it('sanitizes before saving and only keeps the body on request', () => {
    const spec: HttpRequestSpec = {
      method: 'POST',
      url: 'https://a.io/x?access_token=zzz',
      headers: [
        { name: 'Authorization', value: 'Bearer secret' },
        { name: 'Accept', value: 'application/json' },
      ],
      body: '{"password":"p"}',
    };
    const s = sanitizeForSave(spec, '', false, 1000);
    expect(s.url).toBe('https://a.io/x?access_token=');
    expect(s.headers).toEqual([
      { name: 'Authorization', value: '' },
      { name: 'Accept', value: 'application/json' },
    ]);
    expect(s.body).toBe('');
    expect(s.name).toContain('POST a.io/x');
    expect(JSON.stringify(s)).not.toContain('secret');
    expect(sanitizeForSave(spec, 'My call', true, 1000).body).toBe('{"password":"p"}');
  });
});
