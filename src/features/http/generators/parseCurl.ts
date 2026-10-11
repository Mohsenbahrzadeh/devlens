import { utf8ToBase64 } from '@/lib/base64';
import { fail, ok, type Result } from '@/types/result';
import { HTTP_METHODS, type HttpMethod, type HttpRequestSpec } from '../types';

/** Splits a shell command line into words, honouring '…', "…" and backslash escapes. */
export function shellSplit(input: string): Result<string[]> {
  const text = input.replace(/\\\r?\n/g, ' ');
  const words: string[] = [];
  let cur = '';
  let started = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) return fail('Invalid cURL command', 'A single quote is never closed.');
      cur += text.slice(i + 1, end);
      started = true;
      i = end + 1;
    } else if (c === '"') {
      i++;
      started = true;
      for (; ; i++) {
        if (i >= text.length)
          return fail('Invalid cURL command', 'A double quote is never closed.');
        if (text[i] === '"') break;
        if (text[i] === '\\' && '"\\$`'.includes(text[i + 1] ?? '')) i++;
        cur += text[i];
      }
      i++;
    } else if (c === '\\' && i + 1 < text.length) {
      cur += text[i + 1];
      started = true;
      i += 2;
    } else if (/\s/.test(c)) {
      if (started) words.push(cur);
      cur = '';
      started = false;
      i++;
    } else {
      cur += c;
      started = true;
      i++;
    }
  }
  if (started) words.push(cur);
  return ok(words);
}

const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-ascii']);

/** Parses a common subset of cURL options into a request spec. Unknown flags are ignored. */
export function parseCurl(input: string): Result<HttpRequestSpec> {
  const split = shellSplit(input.trim());
  if (!split.ok) return split;
  const words = split.value;
  if (words[0] !== 'curl')
    return fail('Invalid cURL command', 'The command must start with "curl".');

  let method: string | undefined;
  let url = '';
  let head = false;
  const headers: { name: string; value: string }[] = [];
  const data: string[] = [];

  for (let i = 1; i < words.length; i++) {
    const w = words[i];
    const next = () => words[++i] ?? '';
    const eq = w.startsWith('--') ? w.indexOf('=') : -1;
    const flag = eq > 0 ? w.slice(0, eq) : w;
    const inline = eq > 0 ? w.slice(eq + 1) : undefined;
    const value = () => inline ?? next();

    if (flag === '-X' || flag === '--request') method = value().toUpperCase();
    else if (flag === '-H' || flag === '--header') {
      const h = value();
      const idx = h.indexOf(':');
      if (idx > 0) headers.push({ name: h.slice(0, idx).trim(), value: h.slice(idx + 1).trim() });
    } else if (DATA_FLAGS.has(flag) || flag === '--data-urlencode') data.push(value());
    else if (flag === '-I' || flag === '--head') head = true;
    else if (flag === '--url') url = value();
    else if (flag === '-u' || flag === '--user') {
      headers.push({ name: 'Authorization', value: `Basic ${utf8ToBase64(value())}` });
    } else if (['-A', '--user-agent'].includes(flag)) {
      headers.push({ name: 'User-Agent', value: value() });
    } else if (['-b', '--cookie'].includes(flag)) {
      headers.push({ name: 'Cookie', value: value() });
    } else if (
      ['-o', '--output', '-m', '--max-time', '-e', '--referer', '--connect-timeout'].includes(flag)
    ) {
      value();
    } else if (w.startsWith('-')) {
      // Boolean flags such as -L, -s, -k, -i, --compressed are irrelevant here.
    } else if (!url) url = w;
  }

  if (!url) return fail('Invalid cURL command', 'No URL was found in the command.');
  const finalMethod = (method ?? (head ? 'HEAD' : data.length > 0 ? 'POST' : 'GET')) as HttpMethod;
  if (!HTTP_METHODS.includes(finalMethod)) {
    return fail('Unsupported method', `"${finalMethod}" is not one of ${HTTP_METHODS.join(', ')}.`);
  }
  return ok({ method: finalMethod, url, headers, body: data.join('&') });
}
