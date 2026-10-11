import { describe, expect, it } from 'vitest';
import { digestText, hmacText } from '@/features/encoding/utils/hash';
import { randomString, ulid, uuidV4, uuidV7 } from '@/features/encoding/utils/ids';
import { inspectUuid } from '@/features/encoding/utils/uuid';
import { testRegex } from '@/features/encoding/utils/regex';
import { searchStatusCodes, STATUS_CODES } from '@/features/encoding/utils/statusCodes';
import { detectInput } from '@/features/encoding/utils/detect';
import { buildQuery } from '@/features/encoding/utils/query';
import { diffJson } from '@/features/diff/utils/diff';
import {
  diffToJson,
  diffToMarkdown,
  filterIgnored,
  parseIgnore,
} from '@/features/diff/utils/ignore';
import { utf8ToBase64Url } from '@/lib/base64';

describe('hashing', () => {
  it('computes known digests', async () => {
    expect((await digestText('SHA-256', 'abc')).hex).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect((await digestText('SHA-1', 'abc')).hex).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect((await digestText('SHA-256', 'abc')).base64).toBe(
      'ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0=',
    );
  });
  it('computes HMAC-SHA256', async () => {
    const r = await hmacText('SHA-256', 'key', 'The quick brown fox jumps over the lazy dog');
    expect(r.ok && r.value.hex).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
    expect((await hmacText('SHA-256', '', 'x')).ok).toBe(false);
  });
});

describe('id generators', () => {
  it('creates valid v4 and v7 UUIDs', () => {
    const v4 = inspectUuid(uuidV4());
    expect(v4.ok && v4.value.version).toBe(4);
    const now = Date.UTC(2026, 9, 2, 12, 0, 0);
    const v7 = inspectUuid(uuidV7(now));
    expect(v7.ok && v7.value.version).toBe(7);
    expect(v7.ok && v7.value.details[0].value).toBe('2026-10-02T12:00:00.000Z');
    expect(v7.ok && v7.value.variant).toContain('RFC');
  });
  it('creates sortable ULIDs', () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true);
    expect(ulid(0).slice(0, 10)).toBe('0000000000');
  });
  it('creates random strings from the charset', () => {
    expect(randomString(40, 'hex')).toMatch(/^[0-9a-f]{40}$/);
    expect(randomString(64)).toHaveLength(64);
    expect(randomString(30, 'base64url')).toMatch(/^[A-Za-z0-9_-]{30}$/);
    expect(new Set([randomString(24), randomString(24)]).size).toBe(2);
  });
});

describe('testRegex', () => {
  it('finds matches with groups and named groups', () => {
    const r = testRegex('(?<k>\\w+)=(\\d+)', 'g', 'a=1 b=22');
    expect(r.ok && r.value.matches.map((m) => m.text)).toEqual(['a=1', 'b=22']);
    expect(r.ok && r.value.matches[1].groups).toEqual(['b', '22']);
    expect(r.ok && r.value.matches[1].named.k).toBe('b');
    expect(r.ok && r.value.matches[1].index).toBe(4);
  });
  it('always iterates all matches and honours flags', () => {
    const r = testRegex('a', 'i', 'aAa');
    expect(r.ok && r.value.matches).toHaveLength(3);
  });
  it('reports invalid patterns and oversized text', () => {
    const bad = testRegex('(', '', 'x');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.title).toBe('Invalid regular expression');
    expect(testRegex('', '', 'x').ok).toBe(false);
    expect(testRegex('a', '', 'a'.repeat(100_001)).ok).toBe(false);
  });
  it('caps the number of matches', () => {
    const r = testRegex('a', 'g', 'a'.repeat(500));
    expect(r.ok && r.value.matches).toHaveLength(200);
    expect(r.ok && r.value.truncated).toBe(true);
  });
  it('handles zero-length matches without looping forever', () => {
    const r = testRegex('x*', 'g', 'ab');
    expect(r.ok && r.value.matches.length).toBe(3);
  });
});

describe('status codes', () => {
  it('searches by code, name, class and meaning', () => {
    expect(searchStatusCodes('404')[0].name).toBe('Not Found');
    expect(searchStatusCodes('teapot')[0].code).toBe(418);
    expect(searchStatusCodes('5xx').every((s) => s.code >= 500)).toBe(true);
    expect(searchStatusCodes('rate').some((s) => s.code === 429)).toBe(true);
    expect(searchStatusCodes('')).toBe(STATUS_CODES);
  });
  it('has unique, sorted codes', () => {
    const codes = STATUS_CODES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
  });
});

describe('detectInput', () => {
  const jwt = `${utf8ToBase64Url('{"alg":"HS256"}')}.${utf8ToBase64Url('{"sub":"1"}')}.c2ln`;
  it.each([
    [jwt, { tool: 'jwt' }],
    ['Bearer ' + jwt, { tool: 'jwt' }],
    ['{"a":1}', { tool: 'json' }],
    ['[1,2]', { tool: 'json' }],
    ['550e8400-e29b-41d4-a716-446655440000', { tool: 'tools', sub: 'uuid' }],
    ['1780230000', { tool: 'tools', sub: 'timestamp' }],
    ['1780230000000', { tool: 'tools', sub: 'timestamp' }],
    ['https://x.io/s?q=1&b=2', { tool: 'tools', sub: 'query' }],
    ['a=1&b=2', { tool: 'tools', sub: 'query' }],
    ['hello%20world', { tool: 'tools', sub: 'url' }],
    ['aGVsbG8gd29ybGQ=', { tool: 'tools', sub: 'base64' }],
    ['just some words', { tool: 'json' }],
  ])('%s', (input, expected) => {
    expect(detectInput(input)).toEqual(expected);
  });
});

describe('buildQuery', () => {
  it('encodes values and skips blank keys', () => {
    expect(
      buildQuery([
        { key: 'q', value: 'a b&c' },
        { key: ' ', value: 'x' },
        { key: 'é', value: '' },
      ]),
    ).toBe('q=a%20b%26c&%C3%A9=');
  });
});

describe('diff ignore and export', () => {
  const a = {
    name: 'a',
    updatedAt: 1,
    meta: { version: 1, id: 'x' },
    items: [
      { id: 1, v: 1, ts: 5 },
      { id: 2, v: 2, ts: 6 },
    ],
  };
  const b = {
    name: 'b',
    updatedAt: 2,
    meta: { version: 2, id: 'y' },
    items: [
      { id: 1, v: 9, ts: 7 },
      { id: 2, v: 2, ts: 8 },
    ],
  };
  const entries = diffJson(a, b).filter((e) => e.kind !== 'unchanged');
  const paths = (p: string) => filterIgnored(entries, parseIgnore(p)).map((e) => e.path);

  it('parses comma/newline separated patterns', () => {
    expect(parseIgnore(' a, b\n c ,,')).toEqual(['a', 'b', 'c']);
  });
  it('ignores a property name anywhere', () => {
    expect(paths('updatedAt')).not.toContain('updatedAt');
    expect(paths('ts')).toEqual(['name', 'updatedAt', 'meta.version', 'meta.id', 'items[id=1].v']);
  });
  it('supports dotted paths, wildcards and subtrees', () => {
    expect(paths('meta')).toEqual([
      'name',
      'updatedAt',
      'items[id=1].v',
      'items[id=1].ts',
      'items[id=2].ts',
    ]);
    expect(paths('meta.version')).toContain('meta.id');
    expect(paths('meta.version')).not.toContain('meta.version');
    expect(paths('items[*].ts')).toEqual([
      'name',
      'updatedAt',
      'meta.version',
      'meta.id',
      'items[id=1].v',
    ]);
    expect(paths('**.id')).not.toContain('meta.id');
    expect(paths('*.version')).not.toContain('meta.version');
  });
  it('does not hide partial name matches', () => {
    expect(paths('date')).toContain('updatedAt');
  });
  it('returns everything without patterns', () => {
    expect(filterIgnored(entries, [])).toBe(entries);
  });
  it('exports Markdown and JSON reports', () => {
    const md = diffToMarkdown(entries);
    expect(md).toContain('## Changed (');
    expect(md).toContain('- `name`: `"a"` → `"b"`');
    expect(diffToMarkdown([])).toContain('No differences.');
    const json = JSON.parse(diffToJson(entries));
    expect(json[0]).toEqual({ kind: 'changed', path: 'name', before: 'a', after: 'b' });
  });
});
