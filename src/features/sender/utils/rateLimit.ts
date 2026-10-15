export interface RateRow {
  index: number;
  status: number;
  ok: boolean;
  timeMs: number;
  retryAfter?: string;
  error?: string;
}

export interface RateAnalysis {
  total: number;
  succeeded: number;
  failed: number;
  firstThrottledAt?: number;
  throttledCount: number;
  medianMs: number;
  p95Ms: number;
}

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
};

/** Summarises a batch of identical requests sent to look for rate limiting (429, or errors after a streak of 2xx). */
export function analyzeRateResults(rows: RateRow[]): RateAnalysis {
  const times = rows
    .filter((r) => r.ok || r.status > 0)
    .map((r) => r.timeMs)
    .sort((a, b) => a - b);
  const throttled = rows.filter((r) => r.status === 429);
  return {
    total: rows.length,
    succeeded: rows.filter((r) => r.status >= 200 && r.status < 300).length,
    failed: rows.filter((r) => !(r.status >= 200 && r.status < 300)).length,
    firstThrottledAt: throttled[0]?.index,
    throttledCount: throttled.length,
    medianMs: Math.round(percentile(times, 50)),
    p95Ms: Math.round(percentile(times, 95)),
  };
}

/** Runs `n` sends with up to `concurrency` in flight at once, yielding each result as it completes. */
export async function* runBatch<T>(
  n: number,
  concurrency: number,
  send: (index: number) => Promise<T>,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  let next = 0;
  const inFlight = new Map<number, Promise<{ i: number; result: T }>>();
  const launch = () => {
    const i = next++;
    inFlight.set(
      i,
      send(i).then((result) => ({ i, result })),
    );
  };
  while (next < Math.min(concurrency, n)) launch();
  while (inFlight.size > 0) {
    if (signal?.aborted) return;
    const { i, result } = await Promise.race(inFlight.values());
    inFlight.delete(i);
    if (next < n && !signal?.aborted) launch();
    yield result;
  }
}
