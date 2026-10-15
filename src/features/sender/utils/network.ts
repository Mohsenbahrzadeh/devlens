import type { HttpRequestSpec } from '@/features/http/types';
import { fail, ok, type Result } from '@/types/result';

export interface SentResponse {
  status: number;
  statusText: string;
  headers: { name: string; value: string }[];
  bodyText: string;
  bodyTruncated: boolean;
  timeMs: number;
  redirected: boolean;
  finalUrl: string;
}

const MAX_BODY_CHARS = 2_000_000;
const DEFAULT_TIMEOUT_MS = 30_000;

function buildBody(spec: HttpRequestSpec): BodyInit | undefined {
  if (spec.method === 'GET' || spec.method === 'HEAD') return undefined;
  if (spec.multipart && spec.multipart.length > 0) {
    const form = new FormData();
    for (const f of spec.multipart) {
      if (f.file) continue; // Sender only has a file's path as text; it cannot read the real file content.
      if (f.name.trim()) form.append(f.name, f.value);
    }
    return form;
  }
  return spec.body.length > 0 ? spec.body : undefined;
}

/**
 * Sends a real HTTP request from the extension (requires host permission for the target origin).
 * Used only by the Sender tool, and only once the user has acknowledged the authorization notice.
 */
export async function sendRequest(
  spec: HttpRequestSpec,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Result<SentResponse>> {
  let url: URL;
  try {
    url = new URL(spec.url);
  } catch {
    return fail('Invalid URL', 'Enter a full URL, including the scheme (https://…).');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return fail('Unsupported scheme', 'Only http:// and https:// URLs can be sent.');
  }

  const headers = new Headers();
  for (const h of spec.headers) if (h.name.trim()) headers.append(h.name.trim(), h.value);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch(spec.url, {
      method: spec.method,
      headers,
      body: buildBody(spec),
      redirect: 'follow',
      credentials: 'omit',
      signal: controller.signal,
    });
    const timeMs = Math.round(performance.now() - started);
    const text = await res.text();
    const truncated = text.length > MAX_BODY_CHARS;
    const outHeaders: { name: string; value: string }[] = [];
    res.headers.forEach((value, name) => outHeaders.push({ name, value }));
    return ok({
      status: res.status,
      statusText: res.statusText,
      headers: outHeaders,
      bodyText: truncated ? text.slice(0, MAX_BODY_CHARS) : text,
      bodyTruncated: truncated,
      timeMs,
      redirected: res.redirected,
      finalUrl: res.url,
    });
  } catch (e) {
    const timeMs = Math.round(performance.now() - started);
    if (controller.signal.aborted) {
      return fail('Timed out', `No response after ${Math.round(timeoutMs / 1000)}s.`);
    }
    return fail(
      'Request failed',
      'The browser could not complete the request. Common causes: the host is unreachable, DNS failed, or the certificate is invalid.',
      `${e instanceof Error ? e.message : String(e)} (${timeMs} ms)`,
    );
  } finally {
    clearTimeout(timer);
  }
}
