import type { HttpHeader, HttpMethod } from '@/features/http/types';
import type { Assertion, AssertionResult } from './assertions';

export interface CollectionRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: HttpHeader[];
  body: string;
  assertions: Assertion[];
}

export interface Collection {
  id: string;
  name: string;
  requests: CollectionRequest[];
}

export interface RunResult {
  request: CollectionRequest;
  status: number;
  timeMs: number;
  error?: string;
  assertionResults: AssertionResult[];
}

const genId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const emptyRequest = (name = 'New request'): CollectionRequest => ({
  id: genId(),
  name,
  method: 'GET',
  url: '',
  headers: [{ name: '', value: '' }],
  body: '',
  assertions: [],
});

export const emptyCollection = (name = 'New collection'): Collection => ({
  id: genId(),
  name,
  requests: [],
});

export function allPassed(results: AssertionResult[]): boolean {
  return results.every((r) => r.pass);
}

export function summarizeRun(results: RunResult[]): {
  requests: number;
  passed: number;
  failed: number;
  assertionsFailed: number;
} {
  let assertionsFailed = 0;
  let passed = 0;
  for (const r of results) {
    const ok = !r.error && allPassed(r.assertionResults);
    if (ok) passed++;
    assertionsFailed += r.assertionResults.filter((a) => !a.pass).length;
  }
  return { requests: results.length, passed, failed: results.length - passed, assertionsFailed };
}
