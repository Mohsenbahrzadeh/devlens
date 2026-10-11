import { isObject, type JsonValue } from '@/lib/json';

export type DiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffEntry {
  kind: DiffKind;
  path: string;
  before?: JsonValue;
  after?: JsonValue;
}

const join = (base: string, key: string) => (base ? `${base}.${key}` : key);

/** Identity keys used to match array items of objects regardless of position. */
const ID_KEYS = ['id', '_id', 'key', 'uuid'];

type Obj = { [key: string]: JsonValue };

/** Returns an identity key present (with a unique primitive value) on every item of both arrays. */
function findIdentityKey(a: JsonValue[], b: JsonValue[]): string | undefined {
  if (a.length === 0 || b.length === 0) return undefined;
  const all = [...a, ...b];
  if (!all.every(isObject)) return undefined;
  return ID_KEYS.find((k) => {
    const isPrimitive = (o: Obj) => ['string', 'number'].includes(typeof o[k]);
    return [a, b].every((arr) => {
      const items = arr as Obj[];
      return items.every(isPrimitive) && new Set(items.map((o) => o[k])).size === items.length;
    });
  });
}

function diffArrays(a: JsonValue[], b: JsonValue[], path: string): DiffEntry[] {
  const out: DiffEntry[] = [];
  const idKey = findIdentityKey(a, b);
  if (idKey) {
    const left = a as Obj[];
    const right = b as Obj[];
    const label = (o: Obj) => `${path}[${idKey}=${String(o[idKey])}]`;
    for (const item of left) {
      const match = right.find((r) => r[idKey] === item[idKey]);
      if (match) out.push(...diffJson(item, match, label(item)));
      else out.push({ kind: 'removed', path: label(item), before: item });
    }
    for (const item of right) {
      if (!left.some((l) => l[idKey] === item[idKey])) {
        out.push({ kind: 'added', path: label(item), after: item });
      }
    }
    return out;
  }
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const p = `${path}[${i}]`;
    if (i >= a.length) out.push({ kind: 'added', path: p, after: b[i] });
    else if (i >= b.length) out.push({ kind: 'removed', path: p, before: a[i] });
    else out.push(...diffJson(a[i], b[i], p));
  }
  return out;
}

/**
 * Structural JSON diff. Object key order is irrelevant. Arrays of objects that share a unique
 * `id`/`_id`/`key`/`uuid` are matched by that identity (`items[id=2]`); other arrays by index.
 */
export function diffJson(a: JsonValue, b: JsonValue, path = ''): DiffEntry[] {
  if (Array.isArray(a) && Array.isArray(b)) return diffArrays(a, b, path);
  if (isObject(a) && isObject(b)) {
    const out: DiffEntry[] = [];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const p = join(path, k);
      if (!(k in b)) out.push({ kind: 'removed', path: p, before: a[k] });
      else if (!(k in a)) out.push({ kind: 'added', path: p, after: b[k] });
      else out.push(...diffJson(a[k], b[k], p));
    }
    return out;
  }
  if (a === b) return [{ kind: 'unchanged', path: path || '(root)', before: a, after: b }];
  return [{ kind: 'changed', path: path || '(root)', before: a, after: b }];
}

export function summarize(entries: DiffEntry[]): Record<DiffKind, number> {
  const s: Record<DiffKind, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const e of entries) s[e.kind]++;
  return s;
}
