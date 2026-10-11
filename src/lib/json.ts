import { fail, ok, type Result } from '@/types/result';

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function lineColumn(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, position);
  const line = before.split('\n').length;
  return { line, column: position - before.lastIndexOf('\n') };
}

const POSITION = /position (\d+)/;
const INCOMPLETE = /end of JSON|Unexpected end|Unterminated/i;

/** Some engines omit the position; find it as the shortest prefix that is definitively invalid. */
function locateError(text: string): number | undefined {
  const isBad = (n: number): boolean => {
    try {
      JSON.parse(text.slice(0, n));
      return false;
    } catch (e) {
      const m = e instanceof Error ? e.message : '';
      const pos = POSITION.exec(m);
      if (pos) return Number(pos[1]) < n;
      return !INCOMPLETE.test(m);
    }
  };
  if (!isBad(text.length)) return undefined;
  let lo = 1;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (isBad(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo - 1;
}

function describe(message: string, text: string): string {
  const explicitLine = /line (\d+) column (\d+)/.exec(message);
  const found = POSITION.exec(message);
  let position = found ? Number(found[1]) : undefined;
  if (position === undefined && !explicitLine && !INCOMPLETE.test(message)) {
    position = locateError(text);
  }
  let where = '';
  if (explicitLine) {
    where = ` at line ${explicitLine[1]}, column ${explicitLine[2]}`;
  } else if (position !== undefined) {
    const { line, column } = lineColumn(text, position);
    where = ` at line ${line}, column ${column}`;
  }
  if (INCOMPLETE.test(message)) return `Unexpected end of input${where}.`;
  if (/property name/i.test(message)) return `Expected a double-quoted property name${where}.`;
  if (/Unexpected token|Unexpected non-whitespace|Unexpected character/i.test(message)) {
    return `Unexpected character${where}.`;
  }
  return `The text is not valid JSON${where}.`;
}

export function parseJson(text: string): Result<JsonValue> {
  if (text.trim() === '') return fail('Empty input', 'Paste some JSON to get started.');
  try {
    return ok(JSON.parse(text) as JsonValue);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return fail('Invalid JSON', describe(raw, text), raw);
  }
}

export function formatJson(text: string, indent = 2): Result<string> {
  const parsed = parseJson(text);
  return parsed.ok ? ok(JSON.stringify(parsed.value, null, indent)) : parsed;
}

export function minifyJson(text: string): Result<string> {
  const parsed = parseJson(text);
  return parsed.ok ? ok(JSON.stringify(parsed.value)) : parsed;
}

export function stringifyValue(value: JsonValue): string {
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export const isObject = (v: JsonValue): v is { [key: string]: JsonValue } =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Returns the set of tree paths whose key or primitive value matches the query. */
export function searchJson(root: JsonValue, query: string): Set<string> {
  const matches = new Set<string>();
  const q = query.trim().toLowerCase();
  if (!q) return matches;
  const walk = (value: JsonValue, path: string, key: string) => {
    if (key.toLowerCase().includes(q)) matches.add(path);
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`, String(i)));
    } else if (isObject(value)) {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`, k);
    } else if (String(value).toLowerCase().includes(q)) {
      matches.add(path);
    }
  };
  walk(root, '$', '');
  return matches;
}
