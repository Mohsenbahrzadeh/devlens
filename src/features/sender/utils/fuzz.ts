import type { HttpHeader, HttpRequestSpec } from '@/features/http/types';

export const FUZZ_MARKER = '{{FUZZ}}';
export const MAX_FUZZ_VALUES = 500;

/** One line per value; blank lines are dropped and duplicates removed (order preserved). */
export function parseWordlist(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const v = raw.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_FUZZ_VALUES) break;
  }
  return out;
}

/** A simple inclusive numeric range, e.g. for IDOR-style ID enumeration. */
export function numericRange(start: number, end: number, step = 1): string[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || step <= 0) return [];
  const out: string[] = [];
  const dir = end >= start ? 1 : -1;
  for (let n = start; dir > 0 ? n <= end : n >= end; n += dir * step) {
    out.push(String(n));
    if (out.length >= MAX_FUZZ_VALUES) break;
  }
  return out;
}

export function countMarkers(spec: HttpRequestSpec): number {
  const text = [spec.url, spec.body, ...spec.headers.flatMap((h) => [h.name, h.value])].join('\n');
  return text.split(FUZZ_MARKER).length - 1;
}

/** Replaces every occurrence of {{FUZZ}} in the URL, headers and body with `value`. */
export function injectFuzzValue(spec: HttpRequestSpec, value: string): HttpRequestSpec {
  const sub = (s: string) => s.split(FUZZ_MARKER).join(value);
  const headers: HttpHeader[] = spec.headers.map((h) => ({
    name: sub(h.name),
    value: sub(h.value),
  }));
  return { ...spec, url: sub(spec.url), headers, body: sub(spec.body) };
}

export interface FuzzRow {
  value: string;
  status: number;
  ok: boolean;
  timeMs: number;
  bodyLength: number;
  error?: string;
  /** True when this response's (status, bodyLength) pair is the most common one in the batch so far. */
  baseline: boolean;
  /** Vulnerability-indicator labels found in this response (see payloads.ts detectSignals). */
  flags: string[];
}

/** Groups rows by (status, bodyLength) and marks the largest group as the "baseline" (likely uninteresting). */
export function markBaseline(rows: FuzzRow[]): FuzzRow[] {
  const counts = new Map<string, number>();
  const key = (r: FuzzRow) => `${r.status}:${r.bodyLength}`;
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
  let topKey = '';
  let topCount = -1;
  for (const [k, c] of counts) {
    if (c > topCount) {
      topCount = c;
      topKey = k;
    }
  }
  return rows.map((r) => ({ ...r, baseline: key(r) === topKey && topCount > 1 }));
}
