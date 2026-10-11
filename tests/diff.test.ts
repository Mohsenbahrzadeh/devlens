import { describe, expect, it } from 'vitest';
import { diffJson, summarize } from '@/features/diff/utils/diff';

const changes = (a: unknown, b: unknown) =>
  diffJson(a as never, b as never).filter((e) => e.kind !== 'unchanged');

describe('diffJson', () => {
  it('detects added properties', () => {
    expect(changes({ a: 1 }, { a: 1, b: 2 })).toEqual([{ kind: 'added', path: 'b', after: 2 }]);
  });
  it('detects removed properties', () => {
    expect(changes({ a: 1, b: 2 }, { a: 1 })).toEqual([{ kind: 'removed', path: 'b', before: 2 }]);
  });
  it('detects changed properties', () => {
    expect(changes({ age: 30 }, { age: 31 })).toEqual([
      { kind: 'changed', path: 'age', before: 30, after: 31 },
    ]);
  });
  it('detects nested changes with a dotted path', () => {
    const e = changes(
      { user: { profile: { name: 'John' } } },
      { user: { profile: { name: 'Mike' } } },
    );
    expect(e).toEqual([
      { kind: 'changed', path: 'user.profile.name', before: 'John', after: 'Mike' },
    ]);
  });
  it('detects array changes by index', () => {
    expect(changes({ a: [1, 2, 3] }, { a: [1, 5] })).toEqual([
      { kind: 'changed', path: 'a[1]', before: 2, after: 5 },
      { kind: 'removed', path: 'a[2]', before: 3 },
    ]);
  });
  it('reports identical documents as unchanged', () => {
    const s = summarize(diffJson({ a: [1, { b: null }] }, { a: [1, { b: null }] }));
    expect(s).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 2 });
  });
  it('ignores property ordering', () => {
    expect(changes({ a: 1, b: 2 }, { b: 2, a: 1 })).toEqual([]);
  });
  it('distinguishes types (null vs 0, "1" vs 1, bool)', () => {
    expect(changes({ a: null }, { a: 0 })).toHaveLength(1);
    expect(changes({ a: '1' }, { a: 1 })).toHaveLength(1);
    expect(changes({ a: true }, { a: false })).toHaveLength(1);
  });
  it('treats object vs array as changed', () => {
    expect(changes({ a: {} }, { a: [] })).toHaveLength(1);
  });
  it('handles root primitives', () => {
    expect(changes(1, 2)[0].path).toBe('(root)');
  });
});
