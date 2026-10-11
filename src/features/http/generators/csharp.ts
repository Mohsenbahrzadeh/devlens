import { hasRequestBody, type HttpRequestSpec } from '../types';

export const csString = (s: string): string =>
  `"${s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')}"`;

const CONTENT_HEADERS = new Set([
  'content-type',
  'content-length',
  'content-encoding',
  'content-language',
  'content-disposition',
  'content-location',
  'content-md5',
  'content-range',
  'expires',
  'last-modified',
  'allow',
]);

const METHOD_NAMES: Record<string, string> = {
  GET: 'Get',
  POST: 'Post',
  PUT: 'Put',
  PATCH: 'Patch',
  DELETE: 'Delete',
  HEAD: 'Head',
  OPTIONS: 'Options',
};

/** Body is sent verbatim via StringContent so the wire payload matches what the user typed. */
export function generateCSharp(req: HttpRequestSpec): string {
  const headers = req.headers.filter((h) => h.name.trim());
  const contentType = headers.find((h) => h.name.trim().toLowerCase() === 'content-type');
  const requestHeaders = headers.filter((h) => !CONTENT_HEADERS.has(h.name.trim().toLowerCase()));
  const multipart = hasRequestBody(req) ? (req.multipart ?? []) : [];
  const hasBody = req.body.length > 0 && req.method !== 'GET' && req.method !== 'HEAD';

  const out: string[] = ['using var client = new HttpClient();', ''];
  out.push(
    `using var request = new HttpRequestMessage(HttpMethod.${METHOD_NAMES[req.method]}, ${csString(req.url.trim())});`,
  );
  for (const h of requestHeaders) {
    const name = h.name.trim();
    const auth = /^(\S+)\s+(.+)$/.exec(h.value.trim());
    if (name.toLowerCase() === 'authorization' && auth) {
      out.push(
        `request.Headers.Authorization = new AuthenticationHeaderValue(${csString(auth[1])}, ${csString(auth[2])});`,
      );
    } else {
      out.push(`request.Headers.TryAddWithoutValidation(${csString(name)}, ${csString(h.value)});`);
    }
  }
  if (multipart.length > 0) {
    out.push('', 'using var form = new MultipartFormDataContent();');
    for (const f of multipart) {
      out.push(
        f.file
          ? `form.Add(new StreamContent(File.OpenRead(${csString(f.value)})), ${csString(f.name)}, Path.GetFileName(${csString(f.value)}));`
          : `form.Add(new StringContent(${csString(f.value)}), ${csString(f.name)});`,
      );
    }
    out.push('request.Content = form;');
  } else if (hasBody) {
    const mediaType = contentType ? contentType.value.split(';')[0].trim() : 'application/json';
    out.push(
      `request.Content = new StringContent(${csString(req.body)}, Encoding.UTF8, ${csString(mediaType)});`,
    );
  }
  out.push('', 'using var response = await client.SendAsync(request);');
  out.push('response.EnsureSuccessStatusCode();', '');
  out.push('var content = await response.Content.ReadAsStringAsync();');
  return out.join('\n');
}
