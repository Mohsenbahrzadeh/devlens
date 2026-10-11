import { isObject, parseJson, type JsonValue } from '@/lib/json';
import { fail, ok, type Result } from '@/types/result';
import type { HttpRequestSpec } from '../types';
import { csString } from './csharp';

export interface CodeSection {
  title: string;
  language: 'csharp';
  code: string;
}

/* ---------- naming helpers ---------- */

const pascal = (s: string): string => {
  const p = s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ?? '').toUpperCase());
  const name = p.charAt(0).toUpperCase() + p.slice(1);
  if (!name) return '';
  return /^[A-Za-z_]/.test(name) ? name : `N${name}`;
};
const singular = (s: string) => (s.endsWith('ies') ? `${s.slice(0, -3)}y` : s.replace(/s$/, ''));

/** Mirrors System.Text.Json's JsonNamingPolicy.CamelCase, used by HttpClient JSON helpers. */
export function camelCase(s: string): string {
  if (!s || !/[A-Z]/.test(s[0])) return s;
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    if (i === 1 && !/[A-Z]/.test(chars[i])) break;
    const hasNext = i + 1 < chars.length;
    if (i > 0 && hasNext && !/[A-Z]/.test(chars[i + 1])) {
      if (chars[i + 1] === ' ') chars[i] = chars[i].toLowerCase();
      break;
    }
    chars[i] = chars[i].toLowerCase();
  }
  return chars.join('');
}

/* ---------- type inference ---------- */

type Prim = 'string' | 'int' | 'long' | 'double' | 'bool' | 'DateTimeOffset' | 'Guid';
type T =
  | { kind: 'prim'; cs: Prim; nullable: boolean }
  | { kind: 'record'; name: string; nullable: boolean }
  | { kind: 'list'; item: T; nullable: boolean }
  | { kind: 'any'; nullable: boolean };

interface Prop {
  key: string;
  name: string;
  type: T;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class Models {
  private used = new Set<string>();
  readonly records = new Map<string, Prop[]>();

  unique(base: string): string {
    const root = pascal(base) || 'Item';
    let name = root;
    for (let n = 2; this.used.has(name); n++) name = `${root}${n}`;
    this.used.add(name);
    return name;
  }

  infer(samples: JsonValue[], name: string): T {
    const present = samples.filter((s) => s !== null);
    const nullable = present.length < samples.length;
    if (present.length === 0) return { kind: 'any', nullable: true };

    const kinds = new Set(
      present.map((s) => (Array.isArray(s) ? 'array' : isObject(s) ? 'object' : typeof s)),
    );
    if (kinds.size > 1) return { kind: 'any', nullable: true };
    const kind = [...kinds][0];

    if (kind === 'string') {
      const strings = present as string[];
      if (strings.every((s) => ISO_DATE.test(s)))
        return { kind: 'prim', cs: 'DateTimeOffset', nullable };
      if (strings.every((s) => GUID.test(s))) return { kind: 'prim', cs: 'Guid', nullable };
      return { kind: 'prim', cs: 'string', nullable };
    }
    if (kind === 'boolean') return { kind: 'prim', cs: 'bool', nullable };
    if (kind === 'number') {
      const nums = present as number[];
      if (!nums.every(Number.isInteger)) return { kind: 'prim', cs: 'double', nullable };
      if (nums.every((n) => Math.abs(n) <= 2147483647))
        return { kind: 'prim', cs: 'int', nullable };
      if (nums.every(Number.isSafeInteger)) return { kind: 'prim', cs: 'long', nullable };
      return { kind: 'prim', cs: 'double', nullable };
    }
    if (kind === 'array') {
      const items = (present as JsonValue[][]).flat();
      const itemName = singular(name) === name ? `${name}Item` : singular(name);
      return { kind: 'list', item: this.infer(items, itemName), nullable };
    }

    const objects = present as { [key: string]: JsonValue }[];
    const recordName = this.unique(name);
    const props: Prop[] = [];
    this.records.set(recordName, props);
    const taken = new Set<string>();
    for (const key of new Set(objects.flatMap((o) => Object.keys(o)))) {
      const withKey = objects.filter((o) => key in o);
      let propName = pascal(key) || 'Value';
      if (propName === recordName) propName += 'Value';
      for (let n = 2; taken.has(propName); n++) propName = `${pascal(key) || 'Value'}${n}`;
      taken.add(propName);
      const type = this.infer(
        withKey.map((o) => o[key]),
        propName,
      );
      props.push({
        key,
        name: propName,
        type: { ...type, nullable: type.nullable || withKey.length < objects.length },
      });
    }
    return { kind: 'record', name: recordName, nullable };
  }

  render(): string {
    const needsAttr = [...this.records.values()].some((props) =>
      props.some((p) => camelCase(p.name) !== p.key),
    );
    const decls = [...this.records].map(([name, props]) => {
      if (props.length === 0) return `public sealed record ${name}();`;
      const params = props.map((p) => {
        const attr =
          camelCase(p.name) !== p.key ? `[property: JsonPropertyName(${csString(p.key)})] ` : '';
        return `    ${attr}${csType(p.type)} ${p.name}`;
      });
      return `public sealed record ${name}(\n${params.join(',\n')});`;
    });
    const header = needsAttr ? 'using System.Text.Json.Serialization;\n\n' : '';
    return header + decls.join('\n\n');
  }
}

export function csType(t: T): string {
  const base =
    t.kind === 'prim'
      ? t.cs
      : t.kind === 'record'
        ? t.name
        : t.kind === 'list'
          ? `List<${csType(t.item)}>`
          : 'object';
  return t.nullable ? `${base}?` : base;
}

/* ---------- value initializers ---------- */

const indentBy = (s: string, n: number) =>
  s
    .split('\n')
    .map((l, i) => (i === 0 || l === '' ? l : ' '.repeat(n) + l))
    .join('\n');

function initializer(value: JsonValue | undefined, t: T, models: Models): string {
  if (value === undefined || value === null) return 'null';
  switch (t.kind) {
    case 'prim':
      if (t.cs === 'string') return csString(String(value));
      if (t.cs === 'DateTimeOffset') return `DateTimeOffset.Parse(${csString(String(value))})`;
      if (t.cs === 'Guid') return `Guid.Parse(${csString(String(value))})`;
      if (t.cs === 'bool') return String(value);
      if (t.cs === 'long') return `${String(value)}L`;
      if (t.cs === 'double') return Number.isInteger(value) ? `${String(value)}.0` : String(value);
      return String(value);
    case 'list': {
      const items = (value as JsonValue[]).map((v) => initializer(v, t.item, models));
      if (items.length === 0) return '[]';
      const flat = `[${items.join(', ')}]`;
      if (!flat.includes('\n') && flat.length <= 60) return flat;
      return `[\n${items.map((i) => `    ${indentBy(i, 4)}`).join(',\n')}\n]`;
    }
    case 'record': {
      const props = models.records.get(t.name) ?? [];
      const obj = value as { [key: string]: JsonValue };
      const args = props.map((p) => `${p.name}: ${initializer(obj[p.key], p.type, models)}`);
      const inline = `new ${t.name}(${args.join(', ')})`;
      if (!inline.includes('\n') && inline.length <= 72) return inline;
      return `new ${t.name}(\n${args.map((a) => `    ${indentBy(a, 4)}`).join(',\n')})`;
    }
    default:
      return typeof value === 'object' ? 'null /* mixed JSON value */' : JSON.stringify(value);
  }
}

/* ---------- request analysis ---------- */

function resourceName(url: string): string {
  const path = url
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    .split(/[?#]/)[0];
  const segments = path
    .split('/')
    .filter(Boolean)
    .filter((s) => !/^\d+$/.test(s) && !GUID.test(s) && !/^[{:]/.test(s));
  return pascal(segments.at(-1) ?? '') || 'Api';
}

const METHOD_NAMES: Record<string, string> = {
  GET: 'Get',
  POST: 'Post',
  PUT: 'Put',
  PATCH: 'Patch',
  DELETE: 'Delete',
  HEAD: 'Head',
  OPTIONS: 'Options',
};

const CONTENT_HEADERS = new Set(['content-type', 'content-length']);

/**
 * Generates C# input/output models (records) plus a typed HttpClient wrapper and a usage example.
 * `responseSample` is optional JSON; without it the client returns the raw response string.
 */
export function generateTypedCSharp(
  req: HttpRequestSpec,
  responseSample: string,
): Result<CodeSection[]> {
  if ((req.multipart?.length ?? 0) > 0) {
    return fail(
      'Multipart bodies are not supported here',
      'Use the plain C# output for multipart/form-data requests.',
    );
  }
  const resource = resourceName(req.url);
  const models = new Models();

  const hasBody = req.body.trim().length > 0 && req.method !== 'GET' && req.method !== 'HEAD';
  let requestType: T | undefined;
  let requestValue: JsonValue | undefined;
  if (hasBody) {
    const parsed = parseJson(req.body);
    if (parsed.ok) {
      requestValue = parsed.value;
      requestType = models.infer([parsed.value], `${resource}Request`);
    }
  }

  let responseType: T | undefined;
  if (responseSample.trim()) {
    const parsed = parseJson(responseSample);
    if (!parsed.ok) {
      return fail(
        `Sample response: ${parsed.error.title}`,
        parsed.error.message,
        parsed.error.details,
      );
    }
    responseType = models.infer([parsed.value], `${resource}Response`);
  }

  const headers = req.headers.filter((h) => h.name.trim());
  const contentType = headers
    .find((h) => h.name.trim().toLowerCase() === 'content-type')
    ?.value.split(';')[0]
    .trim();
  const auth = headers.find((h) => h.name.trim().toLowerCase() === 'authorization');
  const authMatch = auth ? /^(\S+)\s+(.+)$/.exec(auth.value.trim()) : null;
  const extra = headers.filter((h) => {
    const n = h.name.trim().toLowerCase();
    return !CONTENT_HEADERS.has(n) && !(authMatch && n === 'authorization');
  });

  const clientName = `${resource}Client`;
  const methodName = `${METHOD_NAMES[req.method]}${resource}Async`;
  const returnType = responseType ? `${csType({ ...responseType, nullable: true })}` : 'string';
  const bodyKind = requestType ? 'json' : hasBody ? 'raw' : 'none';

  const params: string[] = [];
  if (bodyKind === 'json' && requestType) params.push(`${csType(requestType)} request`);
  if (bodyKind === 'raw') params.push('string body');
  if (authMatch) params.push('string accessToken');
  params.push('CancellationToken cancellationToken = default');

  const usings = ['System.Net.Http.Headers', 'System.Net.Http.Json'];
  if (bodyKind === 'raw') usings.push('System.Text');
  usings.sort();

  const body: string[] = [
    `using var message = new HttpRequestMessage(HttpMethod.${METHOD_NAMES[req.method]}, ${csString(req.url.trim())});`,
  ];
  if (authMatch) {
    body.push(
      `message.Headers.Authorization = new AuthenticationHeaderValue(${csString(authMatch[1])}, accessToken);`,
    );
  }
  for (const h of extra) {
    body.push(
      `message.Headers.TryAddWithoutValidation(${csString(h.name.trim())}, ${csString(h.value)});`,
    );
  }
  if (bodyKind === 'json') {
    body.push(
      contentType && contentType !== 'application/json'
        ? `message.Content = JsonContent.Create(request, new MediaTypeHeaderValue(${csString(contentType)}));`
        : 'message.Content = JsonContent.Create(request);',
    );
  } else if (bodyKind === 'raw') {
    body.push(
      `message.Content = new StringContent(body, Encoding.UTF8, ${csString(contentType ?? 'text/plain')});`,
    );
  }
  body.push(
    '',
    'using var response = await http.SendAsync(message, cancellationToken);',
    'response.EnsureSuccessStatusCode();',
    '',
    responseType
      ? `return await response.Content.ReadFromJsonAsync<${csType(responseType)}>(cancellationToken);`
      : 'return await response.Content.ReadAsStringAsync(cancellationToken);',
  );

  const client = [
    ...usings.map((u) => `using ${u};`),
    '',
    `public sealed class ${clientName}(HttpClient http)`,
    '{',
    `    public async Task<${returnType}> ${methodName}(`,
    `        ${params.join(',\n        ')})`,
    '    {',
    ...body.map((l) => (l ? `        ${l}` : '')),
    '    }',
    '}',
  ].join('\n');

  const args: string[] = [];
  if (bodyKind === 'json' && requestType) {
    args.push(initializer(requestValue, requestType, models));
  }
  if (bodyKind === 'raw') args.push(csString(req.body));
  if (authMatch) args.push(`accessToken: ${csString(authMatch[2])}`);
  const call =
    args.length === 0
      ? `await client.${methodName}()`
      : args.length === 1 && !args[0].includes('\n')
        ? `await client.${methodName}(${args[0]})`
        : `await client.${methodName}(\n${args.map((a) => `    ${indentBy(a, 4)}`).join(',\n')})`;

  const usage = [
    'using var http = new HttpClient();',
    `var client = new ${clientName}(http);`,
    `// In ASP.NET Core prefer: services.AddHttpClient<${clientName}>();`,
    '',
    `var result = ${call};`,
    '',
    'Console.WriteLine(result);',
  ].join('\n');

  const sections: CodeSection[] = [];
  if (models.records.size > 0) {
    sections.push({
      title: 'Models (input / output)',
      language: 'csharp',
      code: models.render(),
    });
  }
  sections.push({ title: 'API client', language: 'csharp', code: client });
  sections.push({ title: 'Usage example', language: 'csharp', code: usage });
  return ok(sections);
}

/** Generates C# records from any JSON sample (used by the JSON → C# converter). */
export function jsonToCSharpModels(value: JsonValue, rootName = 'Root'): string {
  const models = new Models();
  const root = models.infer([value], rootName);
  const code = models.render();
  return root.kind === 'record' ? code : `// Root type: ${csType(root)}\n\n${code}`.trimEnd();
}
