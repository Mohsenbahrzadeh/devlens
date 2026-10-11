import { describe, expect, it } from 'vitest';
import { diffJson } from '@/features/diff/utils/diff';
import { generateFetch } from '@/features/http/generators/fetch';
import { generatePython } from '@/features/http/generators/python';
import { generateCurl } from '@/features/http/generators/curl';
import { parseCurl, shellSplit } from '@/features/http/generators/parseCurl';
import { queryJsonPath } from '@/features/json/utils/jsonpath';
import { jsonToTypeScript } from '@/features/json/utils/typescript';
import { parseQuery } from '@/features/encoding/utils/query';
import type { HttpRequestSpec } from '@/features/http/types';

const changes = (a: unknown, b: unknown) =>
  diffJson(a as never, b as never).filter((e) => e.kind !== 'unchanged');

describe('array diff by identity', () => {
  it('matches items by id regardless of position', () => {
    const a = {
      items: [
        { id: 1, n: 'a' },
        { id: 2, n: 'b' },
      ],
    };
    const b = {
      items: [
        { id: 0, n: 'new' },
        { id: 1, n: 'a' },
        { id: 2, n: 'B' },
      ],
    };
    expect(changes(a, b)).toEqual([
      { kind: 'changed', path: 'items[id=2].n', before: 'b', after: 'B' },
      { kind: 'added', path: 'items[id=0]', after: { id: 0, n: 'new' } },
    ]);
  });
  it('reports removed items by id', () => {
    const e = changes([{ id: 'x' }, { id: 'y' }], [{ id: 'y' }]);
    expect(e).toEqual([{ kind: 'removed', path: '[id=x]', before: { id: 'x' } }]);
  });
  it('falls back to index when ids are not unique', () => {
    const e = changes(
      [
        { id: 1, v: 1 },
        { id: 1, v: 2 },
      ],
      [
        { id: 1, v: 1 },
        { id: 1, v: 3 },
      ],
    );
    expect(e[0].path).toBe('[1].v');
  });
});

const req = (o: Partial<HttpRequestSpec>): HttpRequestSpec => ({
  method: 'POST',
  url: 'https://api.example.com/x',
  headers: [{ name: 'Content-Type', value: 'application/json' }],
  body: '{"a":"q\\"uote"}',
  ...o,
});

describe('fetch / python generators', () => {
  it('generates fetch with escaped body', () => {
    const out = generateFetch(req({}));
    expect(out).toContain('method: "POST"');
    expect(out).toContain('"Content-Type": "application/json"');
    expect(out).toContain('body: "{\\"a\\":\\"q\\\\\\"uote\\"}"');
  });
  it('omits body for GET', () => {
    expect(generateFetch(req({ method: 'GET' }))).not.toContain('body');
    expect(generatePython(req({ method: 'GET' }))).not.toContain('data=');
  });
  it('generates python requests', () => {
    const out = generatePython(req({}));
    expect(out).toContain('requests.post(');
    expect(out).toContain('headers={');
    expect(out).toContain('data=');
  });
});

describe('parseCurl', () => {
  it('round-trips the generated cURL', () => {
    const original = req({ headers: [{ name: 'X-A', value: "it's" }], body: '{"k": "v\\n"}' });
    const parsed = parseCurl(generateCurl(original));
    expect(parsed.ok && parsed.value).toEqual(original);
  });
  it('parses a typical copied command', () => {
    const r = parseCurl(
      `curl 'https://a.io/x?y=1' \\\n  -H "Accept: application/json" -d '{"a":1}' --compressed -L`,
    );
    expect(r.ok && r.value).toEqual({
      method: 'POST',
      url: 'https://a.io/x?y=1',
      headers: [{ name: 'Accept', value: 'application/json' }],
      body: '{"a":1}',
    });
  });
  it('supports --request=, -u and -I', () => {
    const r = parseCurl('curl --request=PUT -u user:pass https://a.io');
    expect(r.ok && r.value.method).toBe('PUT');
    expect(r.ok && r.value.headers[0]).toEqual({
      name: 'Authorization',
      value: 'Basic dXNlcjpwYXNz',
    });
    const h = parseCurl('curl -I https://a.io');
    expect(h.ok && h.value.method).toBe('HEAD');
  });
  it('reports errors', () => {
    expect(parseCurl('wget x').ok).toBe(false);
    expect(parseCurl('curl -H "A: b').ok).toBe(false);
    expect(parseCurl('curl -X POST').ok).toBe(false);
    expect(parseCurl('curl -X TRACE https://a.io').ok).toBe(false);
  });
  it('splits shell words', () => {
    const r = shellSplit(`a 'b c' "d \\" e" f\\ g ''`);
    expect(r.ok && r.value).toEqual(['a', 'b c', 'd " e', 'f g', '']);
  });
});

describe('queryJsonPath', () => {
  const doc = {
    users: [
      { name: 'A', tags: ['x', 'y'] },
      { name: 'B', tags: [] },
    ],
    meta: { name: 'M' },
  };
  const q = (p: string) => {
    const r = queryJsonPath(doc as never, p);
    return r.ok ? r.value : r.error.message;
  };
  it('selects keys and indexes', () => {
    expect(q('$.users[0].name')).toEqual(['A']);
    expect(q("$['meta'].name")).toEqual(['M']);
    expect(q('$.users[-1].name')).toEqual(['B']);
  });
  it('supports wildcards', () => {
    expect(q('$.users[*].name')).toEqual(['A', 'B']);
    expect(q('$.meta.*')).toEqual(['M']);
  });
  it('supports recursive descent', () => {
    expect(q('$..name')).toEqual(['A', 'B', 'M']);
  });
  it('returns an empty list for no match and the root for $', () => {
    expect(q('$.nope')).toEqual([]);
    expect(q('$')).toEqual([doc]);
  });
  it('rejects invalid expressions', () => {
    expect(typeof q('users')).toBe('string');
    expect(typeof q('$.users[')).toBe('string');
    expect(typeof q('$.users[?(@.a)]')).toBe('string');
  });
});

describe('jsonToTypeScript', () => {
  it('generates nested interfaces', () => {
    const out = jsonToTypeScript({ id: 1, user: { name: 'a', admin: true }, note: null });
    expect(out).toContain('export interface RootUser {\n  name: string;\n  admin: boolean;\n}');
    expect(out).toContain('user: RootUser;');
    expect(out).toContain('note: null;');
    expect(out.trim().endsWith('}')).toBe(true);
  });
  it('merges array items and marks missing keys optional', () => {
    const out = jsonToTypeScript({ items: [{ a: 1, b: 'x' }, { a: 2 }] });
    expect(out).toContain('items: RootItem[];');
    expect(out).toContain('b?: string;');
  });
  it('handles mixed arrays, empty arrays, primitives and odd keys', () => {
    expect(jsonToTypeScript({ m: [1, 'a'], e: [] })).toContain('m: (number | string)[];');
    expect(jsonToTypeScript({ e: [] })).toContain('e: unknown[];');
    expect(jsonToTypeScript(5)).toBe('export type Root = number;');
    expect(jsonToTypeScript({ 'a-b': 1 })).toContain('"a-b": number;');
  });
});

describe('parseQuery', () => {
  it('decodes a full URL', () => {
    const r = parseQuery('https://x.io/s?q=hello+world&a=%C3%A9&flag#frag');
    expect(r.ok && r.value.base).toBe('https://x.io/s');
    expect(r.ok && r.value.params).toEqual([
      { key: 'q', value: 'hello world' },
      { key: 'a', value: 'é' },
      { key: 'flag', value: '' },
    ]);
  });
  it('accepts a bare query string and tolerates bad escapes', () => {
    const r = parseQuery('a=1&b=%E0%A4%A');
    expect(r.ok && r.value.params).toHaveLength(2);
  });
  it('rejects empty input', () => expect(parseQuery(' ').ok).toBe(false));
});
