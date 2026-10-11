import { isObject, type JsonValue } from '@/lib/json';

type Obj = { [key: string]: JsonValue };

const pascal = (s: string): string => {
  const p = s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ?? '').toUpperCase());
  const name = p.charAt(0).toUpperCase() + p.slice(1);
  return /^[A-Za-z_]/.test(name) ? name : `T${name}`;
};
const singular = (s: string) => (s.endsWith('ies') ? `${s.slice(0, -3)}y` : s.replace(/s$/, ''));
const propKey = (k: string) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k));

/** Infers TypeScript interfaces from a JSON sample. Array items of objects are merged. */
export function jsonToTypeScript(root: JsonValue, rootName = 'Root'): string {
  const interfaces: string[] = [];
  const used = new Set<string>();

  const uniqueName = (base: string) => {
    let name = pascal(base) || 'Item';
    for (let n = 2; used.has(name); n++) name = `${pascal(base)}${n}`;
    used.add(name);
    return name;
  };

  const infer = (samples: JsonValue[], name: string): string => {
    if (samples.length === 0) return 'unknown';
    const parts = new Set<string>();
    const objects: Obj[] = [];
    const items: JsonValue[] = [];
    let sawArray = false;
    for (const s of samples) {
      if (s === null) parts.add('null');
      else if (Array.isArray(s)) {
        sawArray = true;
        items.push(...s);
      } else if (isObject(s)) objects.push(s);
      else parts.add(typeof s);
    }
    if (objects.length > 0) {
      const iface = uniqueName(name);
      const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))];
      const fields = keys.map((k) => {
        const withKey = objects.filter((o) => k in o);
        const type = infer(
          withKey.map((o) => o[k]),
          `${iface}${pascal(k)}`,
        );
        return `  ${propKey(k)}${withKey.length < objects.length ? '?' : ''}: ${type};`;
      });
      interfaces.push(`export interface ${iface} {\n${fields.join('\n')}\n}`);
      parts.add(iface);
    }
    if (sawArray) {
      const elem = infer(items, singular(name));
      parts.add(elem.includes(' | ') ? `(${elem})[]` : `${elem}[]`);
    }
    return [...parts].join(' | ');
  };

  const rootType = infer([root], rootName);
  if (interfaces.length === 0 || !interfaces.at(-1)!.startsWith(`export interface ${rootType} `)) {
    interfaces.push(`export type ${pascal(rootName)} = ${rootType};`);
  }
  return interfaces.join('\n\n');
}
