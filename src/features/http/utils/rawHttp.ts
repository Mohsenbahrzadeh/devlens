import { fail, ok, type Result } from '@/types/result';
import { HTTP_METHODS, type HttpMethod, type HttpRequestSpec } from '../types';

/** Parses a raw HTTP/1.x request (start line, headers, blank line, body). */
export function parseRawHttp(input: string): Result<HttpRequestSpec> {
  const text = input.replace(/\r\n/g, '\n').replace(/^\s+/, '');
  if (!text) return fail('Empty input', 'Paste a raw HTTP request.');
  const [head, ...bodyParts] = text.split(/\n\n/);
  const lines = head.split('\n');
  const start = /^([A-Za-z]+)\s+(\S+)(?:\s+HTTP\/[\d.]+)?\s*$/.exec(lines[0]);
  if (!start) {
    return fail('Invalid request', 'The first line must look like "POST /path HTTP/1.1".');
  }
  const method = start[1].toUpperCase() as HttpMethod;
  if (!HTTP_METHODS.includes(method)) {
    return fail('Unsupported method', `"${start[1]}" is not one of ${HTTP_METHODS.join(', ')}.`);
  }
  const headers = lines
    .slice(1)
    .map((l) => {
      const i = l.indexOf(':');
      return i > 0 ? { name: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null;
    })
    .filter((h): h is { name: string; value: string } => h !== null);

  let url = start[2];
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    const host = headers.find((h) => h.name.toLowerCase() === 'host')?.value;
    if (!host)
      return fail('Missing Host', 'A relative path needs a Host header to build the full URL.');
    const local = /^(localhost|127\.|\[::1\]|.*\.local)(:|$)/.test(host);
    url = `${local ? 'http' : 'https'}://${host}${url}`;
  }
  return ok({
    method,
    url,
    headers: headers.filter((h) => !['host', 'content-length'].includes(h.name.toLowerCase())),
    body: bodyParts.join('\n\n').replace(/\n+$/, ''),
  });
}
