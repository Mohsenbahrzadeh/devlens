import { hasRequestBody, type HttpRequestSpec } from '../types';

/**
 * Generates a VS Code REST Client / JetBrains HTTP Client `.http` request block.
 * Multipart bodies are not representable in this format, so only the headers are emitted.
 */
export function generateHttpFile(req: HttpRequestSpec): string {
  const lines = [`${req.method} ${req.url.trim()}`];
  for (const h of req.headers) if (h.name.trim()) lines.push(`${h.name.trim()}: ${h.value}`);
  if (hasRequestBody(req) && req.body.length > 0) lines.push('', req.body);
  return lines.join('\n') + '\n';
}
