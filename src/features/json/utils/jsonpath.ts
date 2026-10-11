import { isObject, type JsonValue } from '@/lib/json';
import { fail, ok, type Result } from '@/types/result';

type Step =
  | { type: 'key'; key: string }
  | { type: 'index'; index: number }
  | { type: 'wildcard' }
  | { type: 'descend'; key: string };

function parse(expr: string): Result<Step[]> {
  const e = expr.trim();
  if (!e.startsWith('$')) return fail('Invalid path', 'A JSONPath expression must start with "$".');
  const steps: Step[] = [];
  let i = 1;
  while (i < e.length) {
    if (e.startsWith('..', i)) {
      const m = /^[\w$-]+/.exec(e.slice(i + 2));
      if (!m) return fail('Invalid path', `Expected a name after ".." at position ${i + 3}.`);
      steps.push({ type: 'descend', key: m[0] });
      i += 2 + m[0].length;
    } else if (e[i] === '.') {
      if (e[i + 1] === '*') {
        steps.push({ type: 'wildcard' });
        i += 2;
        continue;
      }
      const m = /^[\w$-]+/.exec(e.slice(i + 1));
      if (!m)
        return fail('Invalid path', `Expected a property name after "." at position ${i + 2}.`);
      steps.push({ type: 'key', key: m[0] });
      i += 1 + m[0].length;
    } else if (e[i] === '[') {
      const end = e.indexOf(']', i);
      if (end < 0) return fail('Invalid path', 'A "[" is never closed.');
      const inner = e.slice(i + 1, end).trim();
      if (inner === '*') steps.push({ type: 'wildcard' });
      else if (/^-?\d+$/.test(inner)) steps.push({ type: 'index', index: Number(inner) });
      else if (/^(['"]).*\1$/.test(inner)) steps.push({ type: 'key', key: inner.slice(1, -1) });
      else return fail('Invalid path', `Unsupported bracket expression "[${inner}]".`);
      i = end + 1;
    } else {
      return fail('Invalid path', `Unexpected character "${e[i]}" at position ${i + 1}.`);
    }
  }
  return ok(steps);
}

function descend(value: JsonValue, key: string, out: JsonValue[]) {
  if (Array.isArray(value)) value.forEach((v) => descend(v, key, out));
  else if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) {
      if (k === key) out.push(v);
      descend(v, key, out);
    }
  }
}

/** Evaluates a JSONPath subset: `$`, `.key`, `['key']`, `[n]` (negative ok), `[*]`, `.*`, `..key`. */
export function queryJsonPath(root: JsonValue, expr: string): Result<JsonValue[]> {
  const steps = parse(expr);
  if (!steps.ok) return steps;
  let current: JsonValue[] = [root];
  for (const step of steps.value) {
    const next: JsonValue[] = [];
    for (const v of current) {
      if (step.type === 'key') {
        if (isObject(v) && step.key in v) next.push(v[step.key]);
      } else if (step.type === 'index') {
        if (Array.isArray(v)) {
          const item = v[step.index < 0 ? v.length + step.index : step.index];
          if (item !== undefined) next.push(item);
        }
      } else if (step.type === 'wildcard') {
        if (Array.isArray(v)) next.push(...v);
        else if (isObject(v)) next.push(...Object.values(v));
      } else descend(v, step.key, next);
    }
    current = next;
  }
  return ok(current);
}
