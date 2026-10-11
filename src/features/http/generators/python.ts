import { hasRequestBody, type HttpRequestSpec } from '../types';

/** JSON string literals are valid Python string literals for the characters we emit. */
const str = (s: string) => JSON.stringify(s);

export function generatePython(req: HttpRequestSpec): string {
  const multipart = hasRequestBody(req) ? (req.multipart ?? []) : [];
  // `requests` sets the multipart Content-Type (with boundary) itself.
  const headers = req.headers.filter(
    (h) =>
      h.name.trim() && !(multipart.length > 0 && h.name.trim().toLowerCase() === 'content-type'),
  );
  const hasBody = req.body.length > 0 && req.method !== 'GET' && req.method !== 'HEAD';
  const lines = ['import requests', '', `response = requests.${req.method.toLowerCase()}(`];
  lines.push(`    ${str(req.url.trim())},`);
  if (headers.length > 0) {
    lines.push('    headers={');
    for (const h of headers) lines.push(`        ${str(h.name.trim())}: ${str(h.value)},`);
    lines.push('    },');
  }
  if (multipart.length > 0) {
    const text = multipart.filter((f) => !f.file);
    const files = multipart.filter((f) => f.file);
    if (text.length > 0) {
      lines.push('    data={');
      for (const f of text) lines.push(`        ${str(f.name)}: ${str(f.value)},`);
      lines.push('    },');
    }
    if (files.length > 0) {
      lines.push('    files={');
      for (const f of files) lines.push(`        ${str(f.name)}: open(${str(f.value)}, "rb"),`);
      lines.push('    },');
    }
  } else if (hasBody) {
    lines.push(`    data=${str(req.body)},`);
  }
  lines.push(')', '', 'print(response.status_code)', 'print(response.text)');
  return lines.join('\n');
}
