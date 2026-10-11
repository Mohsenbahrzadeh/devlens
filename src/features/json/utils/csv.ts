import { isObject, type JsonValue } from '@/lib/json';
import { fail, ok, type Result } from '@/types/result';

function flatten(value: JsonValue, prefix: string, out: Record<string, string>): void {
  if (isObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0 && prefix) out[prefix] = '{}';
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else if (Array.isArray(value)) {
    out[prefix] = JSON.stringify(value);
  } else {
    out[prefix] = value === null ? '' : String(value);
  }
}

const cell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Converts an array of objects (or one object) to CSV. Nested objects use dotted headers. */
export function jsonToCsv(value: JsonValue): Result<string> {
  const rows = Array.isArray(value) ? value : [value];
  if (rows.length === 0) return fail('Nothing to convert', 'The array is empty.');
  if (!rows.every(isObject)) {
    return fail('Cannot convert to CSV', 'CSV needs an object or an array of objects.');
  }
  const flat = rows.map((r) => {
    const out: Record<string, string> = {};
    flatten(r, '', out);
    return out;
  });
  const headers = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  const lines = [headers.map(cell).join(',')];
  for (const r of flat) lines.push(headers.map((h) => cell(r[h] ?? '')).join(','));
  return ok(lines.join('\n') + '\n');
}
