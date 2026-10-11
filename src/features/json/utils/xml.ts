import { isObject, type JsonValue } from '@/lib/json';
import { fail, ok, type Result } from '@/types/result';

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const tagName = (key: string): string => {
  const t = key.replace(/[^A-Za-z0-9_.-]/g, '_');
  return /^[A-Za-z_]/.test(t) ? t : `_${t}`;
};

function element(name: string, value: JsonValue, indent: string): string[] {
  const tag = tagName(name);
  if (Array.isArray(value)) {
    return value.flatMap((item) => element(name, item, indent));
  }
  if (isObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) return [`${indent}<${tag}/>`];
    const attrs = entries.filter(
      ([k, v]) => k.startsWith('@') && !isObject(v) && !Array.isArray(v),
    );
    const children = entries.filter(([k]) => !k.startsWith('@') || !attrs.some(([a]) => a === k));
    const attrText = attrs
      .map(([k, v]) => ` ${tagName(k.slice(1))}="${escapeXml(String(v ?? ''))}"`)
      .join('');
    const text = children.find(([k]) => k === '#text');
    const elems = children.filter(([k]) => k !== '#text');
    if (elems.length === 0) {
      return [
        text
          ? `${indent}<${tag}${attrText}>${escapeXml(String(text[1] ?? ''))}</${tag}>`
          : `${indent}<${tag}${attrText}/>`,
      ];
    }
    return [
      `${indent}<${tag}${attrText}>`,
      ...elems.flatMap(([k, v]) => element(k, v, `${indent}  `)),
      `${indent}</${tag}>`,
    ];
  }
  if (value === null) return [`${indent}<${tag}/>`];
  return [`${indent}<${tag}>${escapeXml(String(value))}</${tag}>`];
}

export function jsonToXml(value: JsonValue, rootName = 'root'): string {
  const body =
    Array.isArray(value) || !isObject(value)
      ? element(rootName, Array.isArray(value) ? { item: value } : value, '')
      : element(rootName, value, '');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body.join('\n')}\n`;
}

function nodeToJson(el: Element): JsonValue {
  const out: { [key: string]: JsonValue } = {};
  for (const attr of Array.from(el.attributes)) out[`@${attr.name}`] = attr.value;
  const children = Array.from(el.children);
  const text = Array.from(el.childNodes)
    .filter((n) => n.nodeType === 3)
    .map((n) => n.textContent ?? '')
    .join('')
    .trim();
  if (children.length === 0 && Object.keys(out).length === 0) return text;
  for (const child of children) {
    const v = nodeToJson(child);
    const existing = out[child.tagName];
    if (existing === undefined) out[child.tagName] = v;
    else if (Array.isArray(existing)) existing.push(v);
    else out[child.tagName] = [existing, v];
  }
  if (text && children.length > 0) out['#text'] = text;
  else if (text) out['#text'] = text;
  return out;
}

/** Parses XML with the browser's DOMParser (attributes become `@name`, mixed text `#text`). */
export function xmlToJson(xml: string): Result<JsonValue> {
  if (!xml.trim()) return fail('Empty input', 'Paste some XML to convert.');
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, 'application/xml');
  } catch (e) {
    return fail('Invalid XML', 'The document is not well-formed XML.', String(e));
  }
  const err = doc.querySelector('parsererror');
  if (err) {
    return fail(
      'Invalid XML',
      'The document is not well-formed XML.',
      err.textContent ?? undefined,
    );
  }
  const root = doc.documentElement;
  return ok({ [root.tagName]: nodeToJson(root) });
}
