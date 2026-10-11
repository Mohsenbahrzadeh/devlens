import { HTTP_METHODS, type HttpMethod, type HttpRequestSpec } from '../types';

/** The subset of a HAR entry's request that DevLens needs (as given by chrome.devtools.network). */
export interface HarRequestLike {
  method: string;
  url: string;
  headers: { name: string; value: string }[];
  postData?: { mimeType?: string; text?: string };
}

const SKIP = new Set(['content-length', 'host', 'connection', 'accept-encoding']);

export function harToSpec(request: HarRequestLike): HttpRequestSpec {
  const upper = request.method.toUpperCase() as HttpMethod;
  const method = HTTP_METHODS.includes(upper) ? upper : 'GET';
  return {
    method,
    url: request.url,
    headers: request.headers.filter(
      (h) => !h.name.startsWith(':') && !SKIP.has(h.name.toLowerCase()),
    ),
    body: request.postData?.text ?? '',
  };
}

export function findBearerToken(headers: { name: string; value: string }[]): string | null {
  const auth = headers.find((h) => h.name.toLowerCase() === 'authorization');
  const m = auth ? /^bearer\s+(\S+)$/i.exec(auth.value.trim()) : null;
  return m ? m[1] : null;
}
