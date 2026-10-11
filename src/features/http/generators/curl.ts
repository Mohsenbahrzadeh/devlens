import type { HttpRequestSpec } from '../types';

/** Single-quotes a value for POSIX shells (embedded quotes become '\'' ). */
export function shellQuote(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function generateCurl(req: HttpRequestSpec): string {
  const parts: string[] = [];
  const multipart = req.method !== 'GET' && req.method !== 'HEAD' ? (req.multipart ?? []) : [];
  // curl sets the multipart Content-Type (with boundary) itself.
  const headers = req.headers.filter(
    (h) =>
      h.name.trim() && !(multipart.length > 0 && h.name.trim().toLowerCase() === 'content-type'),
  );
  const hasBody = req.body.length > 0 && req.method !== 'GET' && req.method !== 'HEAD';

  parts.push(req.method === 'HEAD' ? 'curl -I' : `curl -X ${req.method}`);
  parts.push(shellQuote(req.url.trim()));
  for (const h of headers) parts.push(`-H ${shellQuote(`${h.name.trim()}: ${h.value}`)}`);
  if (multipart.length > 0) {
    for (const f of multipart) {
      parts.push(`-F ${shellQuote(`${f.name}=${f.file ? '@' : ''}${f.value}`)}`);
    }
  } else if (hasBody) {
    parts.push(`--data-raw ${shellQuote(req.body)}`);
  }
  return parts.join(' \\\n  ');
}
