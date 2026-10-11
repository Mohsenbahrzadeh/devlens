import { hasRequestBody, type HttpRequestSpec } from '../types';

const str = (s: string) => JSON.stringify(s);

export function generateFetch(req: HttpRequestSpec): string {
  const multipart = hasRequestBody(req) ? (req.multipart ?? []) : [];
  // The browser sets the multipart Content-Type (with boundary) itself.
  const headers = req.headers.filter(
    (h) =>
      h.name.trim() && !(multipart.length > 0 && h.name.trim().toLowerCase() === 'content-type'),
  );
  const hasBody = req.body.length > 0 && req.method !== 'GET' && req.method !== 'HEAD';
  const lines: string[] = [];

  if (multipart.length > 0) {
    lines.push('const form = new FormData();');
    for (const f of multipart) {
      lines.push(
        f.file
          ? `form.append(${str(f.name)}, fileInput.files[0]); // <input type="file"> for ${f.value}`
          : `form.append(${str(f.name)}, ${str(f.value)});`,
      );
    }
    lines.push('');
  }

  lines.push(
    `const response = await fetch(${str(req.url.trim())}, {`,
    `  method: ${str(req.method)},`,
  );
  if (headers.length > 0) {
    lines.push('  headers: {');
    for (const h of headers) lines.push(`    ${str(h.name.trim())}: ${str(h.value)},`);
    lines.push('  },');
  }
  if (multipart.length > 0) lines.push('  body: form,');
  else if (hasBody) lines.push(`  body: ${str(req.body)},`);
  lines.push('});', '', 'const data = await response.text();');
  return lines.join('\n');
}
