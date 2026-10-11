import { isObject, parseJson, type JsonValue } from '@/lib/json';
import { fail, ok, type Result } from '@/types/result';
import { HTTP_METHODS, type HttpMethod, type HttpRequestSpec } from '../types';

type Obj = { [key: string]: JsonValue };

export interface OpenApiOperation {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  tag: string;
  queryParams: { name: string; required: boolean }[];
  contentType?: string;
  bodyExample?: JsonValue;
}

export interface OpenApiDoc {
  title: string;
  version: string;
  servers: string[];
  operations: OpenApiOperation[];
}

const asObj = (v: JsonValue | undefined): Obj | undefined =>
  v !== undefined && isObject(v) ? v : undefined;

function resolveRef(root: Obj, ref: string): Obj | undefined {
  if (!ref.startsWith('#/')) return undefined;
  let cur: JsonValue | undefined = root;
  for (const part of ref.slice(2).split('/')) {
    cur = asObj(cur)?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return asObj(cur);
}

/** Builds an example value for a JSON Schema (uses `example`, `default`, `enum`, then the type). */
export function exampleFromSchema(schema: Obj | undefined, root: Obj, depth = 0): JsonValue {
  if (!schema || depth > 6) return null;
  if (typeof schema.$ref === 'string') {
    return exampleFromSchema(resolveRef(root, schema.$ref), root, depth + 1);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  for (const key of ['allOf', 'oneOf', 'anyOf'] as const) {
    const list = schema[key];
    if (Array.isArray(list) && list.length > 0) {
      if (key === 'allOf') {
        const merged: Obj = {};
        for (const part of list) {
          const ex = exampleFromSchema(asObj(part), root, depth + 1);
          if (isObject(ex)) Object.assign(merged, ex);
        }
        return merged;
      }
      return exampleFromSchema(asObj(list[0]), root, depth + 1);
    }
  }
  const type = schema.type ?? (schema.properties ? 'object' : undefined);
  switch (type) {
    case 'string':
      switch (schema.format) {
        case 'date-time':
          return '2026-01-01T00:00:00Z';
        case 'date':
          return '2026-01-01';
        case 'uuid':
          return '00000000-0000-4000-8000-000000000000';
        case 'email':
          return 'user@example.com';
        case 'uri':
          return 'https://example.com';
        default:
          return 'string';
      }
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [exampleFromSchema(asObj(schema.items), root, depth + 1)];
    case 'object': {
      const out: Obj = {};
      const props = asObj(schema.properties) ?? {};
      for (const [k, v] of Object.entries(props))
        out[k] = exampleFromSchema(asObj(v), root, depth + 1);
      return out;
    }
    default:
      return null;
  }
}

/** Reads an OpenAPI 3.x / Swagger 2 document given as JSON (YAML is not supported). */
export function parseOpenApi(text: string): Result<OpenApiDoc> {
  if (!text.trim()) return fail('Empty input', 'Paste an OpenAPI document (JSON).');
  if (!text.trimStart().startsWith('{')) {
    return fail('JSON required', 'Paste the OpenAPI document as JSON. YAML is not supported yet.');
  }
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  const doc = asObj(parsed.value);
  const paths = asObj(doc?.paths);
  if (!doc || !paths || !(doc.openapi || doc.swagger)) {
    return fail(
      'Not an OpenAPI document',
      'Expected "openapi" (or "swagger") and "paths" at the top level.',
    );
  }
  const info = asObj(doc.info);
  const servers = Array.isArray(doc.servers)
    ? doc.servers.map((s) => String(asObj(s)?.url ?? '')).filter(Boolean)
    : doc.host
      ? [
          `${Array.isArray(doc.schemes) ? String(doc.schemes[0]) : 'https'}://${String(doc.host)}${String(doc.basePath ?? '')}`,
        ]
      : [];

  const operations: OpenApiOperation[] = [];
  for (const [path, item] of Object.entries(paths)) {
    const pathItem = asObj(item);
    if (!pathItem) continue;
    const shared = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];
    for (const method of HTTP_METHODS) {
      const op = asObj(pathItem[method.toLowerCase()]);
      if (!op) continue;
      const params = [...shared, ...(Array.isArray(op.parameters) ? op.parameters : [])]
        .map((p) => {
          const o = asObj(p);
          return typeof o?.$ref === 'string' ? resolveRef(doc, o.$ref) : o;
        })
        .filter((p): p is Obj => p !== undefined);

      let contentType: string | undefined;
      let bodyExample: JsonValue | undefined;
      const bodyContent = asObj(
        asObj(
          typeof asObj(op.requestBody)?.$ref === 'string'
            ? resolveRef(doc, String(asObj(op.requestBody)?.$ref))
            : asObj(op.requestBody),
        )?.content,
      );
      if (bodyContent) {
        contentType =
          Object.keys(bodyContent).find((c) => c.includes('json')) ?? Object.keys(bodyContent)[0];
        const media = asObj(bodyContent[contentType]);
        bodyExample =
          media?.example !== undefined
            ? media.example
            : exampleFromSchema(asObj(media?.schema), doc);
      } else {
        const bodyParam = params.find((p) => p.in === 'body');
        if (bodyParam) {
          contentType = 'application/json';
          bodyExample = exampleFromSchema(asObj(bodyParam.schema), doc);
        }
      }
      operations.push({
        id: `${method} ${path}`,
        method,
        path,
        summary: String(op.summary ?? op.operationId ?? ''),
        tag: Array.isArray(op.tags) && op.tags.length > 0 ? String(op.tags[0]) : '',
        queryParams: params
          .filter((p) => p.in === 'query' && typeof p.name === 'string')
          .map((p) => ({ name: String(p.name), required: p.required === true })),
        contentType,
        bodyExample,
      });
    }
  }
  if (operations.length === 0)
    return fail('No operations found', 'The document has no HTTP operations under "paths".');
  return ok({
    title: String(info?.title ?? 'API'),
    version: String(info?.version ?? ''),
    servers,
    operations,
  });
}

export function operationToRequest(op: OpenApiOperation, server: string): HttpRequestSpec {
  const query = op.queryParams
    .filter((q) => q.required)
    .map((q) => `${encodeURIComponent(q.name)}=`);
  const url = `${server.replace(/\/$/, '')}${op.path}${query.length ? `?${query.join('&')}` : ''}`;
  const hasBody = op.bodyExample !== undefined && op.method !== 'GET' && op.method !== 'HEAD';
  return {
    method: op.method,
    url,
    headers: hasBody && op.contentType ? [{ name: 'Content-Type', value: op.contentType }] : [],
    body: hasBody ? JSON.stringify(op.bodyExample, null, 2) : '',
  };
}
