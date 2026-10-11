import { describe, expect, it } from 'vitest';
import { formatJson, lineColumn, minifyJson, parseJson, searchJson } from '@/lib/json';

describe('parseJson', () => {
  it('parses valid objects, arrays and nested values', () => {
    const r = parseJson('{"a":{"b":[1,2,{"c":null}]}}');
    expect(r.ok && r.value).toEqual({ a: { b: [1, 2, { c: null }] } });
  });
  it.each(['null', 'true', '42', '"hi"', '[]'])('parses primitive/array %s', (s) => {
    expect(parseJson(s).ok).toBe(true);
  });
  it('reports a readable error with location', () => {
    const r = parseJson('{\n  "a": 1,\n  "b": \n  }');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.title).toBe('Invalid JSON');
      expect(r.error.message).toMatch(/line \d+, column \d+/);
      expect(r.error.message).not.toMatch(/SyntaxError/);
    }
  });
  it('rejects empty input', () => {
    expect(parseJson('').ok).toBe(false);
  });
});

describe('format / minify', () => {
  it('formats with 2-space indent', () => {
    const r = formatJson('{"a":1,"b":[1]}');
    expect(r.ok && r.value).toBe('{\n  "a": 1,\n  "b": [\n    1\n  ]\n}');
  });
  it('minifies', () => {
    const r = minifyJson('{\n "a": 1,\n "b": [ 1, 2 ]\n}');
    expect(r.ok && r.value).toBe('{"a":1,"b":[1,2]}');
  });
  it('propagates errors', () => {
    expect(formatJson('{').ok).toBe(false);
    expect(minifyJson('{').ok).toBe(false);
  });
});

describe('searchJson', () => {
  const doc = { user: { name: 'Mohsen', tags: ['dev', 'ops'] } };
  it('matches keys', () => {
    expect(searchJson(doc, 'name').has('$.user.name')).toBe(true);
  });
  it('matches values case-insensitively', () => {
    expect(searchJson(doc, 'MOHSEN').has('$.user.name')).toBe(true);
    expect(searchJson(doc, 'ops').has('$.user.tags[1]')).toBe(true);
  });
  it('returns nothing for empty query', () => {
    expect(searchJson(doc, ' ').size).toBe(0);
  });
});

describe('lineColumn', () => {
  it('computes 1-based positions', () => {
    expect(lineColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
  });
});
