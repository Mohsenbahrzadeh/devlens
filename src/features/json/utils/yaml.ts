import { isObject, type JsonValue } from '@/lib/json';

const RESERVED = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off', '~']);

function scalarString(s: string): string {
  const needsQuote =
    s === '' ||
    s !== s.trim() ||
    /[\n\r\t]/.test(s) ||
    /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) ||
    /: |:$| #/.test(s) ||
    RESERVED.has(s.toLowerCase()) ||
    (/^[-+]?(\d|\.\d)/.test(s) && Number.isFinite(Number(s))) ||
    /^0[xob]/i.test(s);
  return needsQuote ? JSON.stringify(s) : s;
}

function scalar(v: JsonValue): string {
  if (v === null) return 'null';
  if (typeof v === 'string') return scalarString(v);
  return String(v);
}

const isScalar = (v: JsonValue) => v === null || typeof v !== 'object';

function lines(v: JsonValue): string[] {
  if (Array.isArray(v)) {
    if (v.length === 0) return ['[]'];
    return v.flatMap((item) => {
      if (isScalar(item)) return [`- ${scalar(item)}`];
      const inner = lines(item);
      if (inner.length === 1 && (inner[0] === '[]' || inner[0] === '{}')) return [`- ${inner[0]}`];
      return inner.map((l, i) => (i === 0 ? `- ${l}` : `  ${l}`));
    });
  }
  if (isObject(v)) {
    const entries = Object.entries(v);
    if (entries.length === 0) return ['{}'];
    return entries.flatMap(([k, val]) => {
      const key = scalarString(k);
      if (isScalar(val)) return [`${key}: ${scalar(val)}`];
      const inner = lines(val);
      if (inner.length === 1 && (inner[0] === '[]' || inner[0] === '{}'))
        return [`${key}: ${inner[0]}`];
      return [`${key}:`, ...inner.map((l) => (Array.isArray(val) ? l : `  ${l}`))];
    });
  }
  return [scalar(v)];
}

export function toYaml(value: JsonValue): string {
  return lines(value).join('\n') + '\n';
}
