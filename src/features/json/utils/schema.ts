import { isObject, type JsonValue } from '@/lib/json';

/** Language-neutral type inferred from JSON samples; emitters below render it per language. */
export type S =
  | { k: 'string' | 'int' | 'float' | 'bool' | 'any'; nullable: boolean }
  | { k: 'list'; item: S; nullable: boolean }
  | { k: 'obj'; name: string; nullable: boolean };

export interface Field {
  key: string;
  type: S;
  optional: boolean;
}

export interface Schema {
  root: S;
  /** Object definitions in creation order (parents before children). */
  objects: Map<string, Field[]>;
}

const pascal = (s: string): string => {
  const p = s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ?? '').toUpperCase());
  const name = p.charAt(0).toUpperCase() + p.slice(1);
  if (!name) return 'Item';
  return /^[A-Za-z_]/.test(name) ? name : `N${name}`;
};
const singular = (s: string) => (s.endsWith('ies') ? `${s.slice(0, -3)}y` : s.replace(/s$/, ''));

export function inferSchema(value: JsonValue, rootName = 'Root'): Schema {
  const objects = new Map<string, Field[]>();

  const unique = (base: string) => {
    const root = pascal(base);
    let name = root;
    for (let n = 2; objects.has(name); n++) name = `${root}${n}`;
    return name;
  };

  const infer = (samples: JsonValue[], name: string): S => {
    const present = samples.filter((s) => s !== null);
    const nullable = present.length < samples.length;
    if (present.length === 0) return { k: 'any', nullable: true };
    const kinds = new Set(
      present.map((s) => (Array.isArray(s) ? 'array' : isObject(s) ? 'object' : typeof s)),
    );
    if (kinds.size > 1) return { k: 'any', nullable: true };
    const kind = [...kinds][0];
    if (kind === 'string') return { k: 'string', nullable };
    if (kind === 'boolean') return { k: 'bool', nullable };
    if (kind === 'number') {
      return { k: (present as number[]).every(Number.isInteger) ? 'int' : 'float', nullable };
    }
    if (kind === 'array') {
      const itemName = singular(name) === name ? `${name}Item` : singular(name);
      return { k: 'list', item: infer((present as JsonValue[][]).flat(), itemName), nullable };
    }
    const objs = present as { [key: string]: JsonValue }[];
    const objName = unique(name);
    const fields: Field[] = [];
    objects.set(objName, fields);
    for (const key of new Set(objs.flatMap((o) => Object.keys(o)))) {
      const withKey = objs.filter((o) => key in o);
      fields.push({
        key,
        type: infer(
          withKey.map((o) => o[key]),
          pascal(key),
        ),
        optional: withKey.length < objs.length,
      });
    }
    return { k: 'obj', name: objName, nullable };
  };

  return { root: infer([value], rootName), objects };
}

/* ---------- identifiers ---------- */

const camel = (key: string): string => {
  const p = pascal(key);
  return p.charAt(0).toLowerCase() + p.slice(1);
};
const snake = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^(\d)/, '_$1');

const PY_KEYWORDS = new Set(
  'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(
    ' ',
  ),
);
const JAVA_KEYWORDS = new Set(
  'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while record var'.split(
    ' ',
  ),
);

function topLevelOrder(schema: Schema): string[] {
  return [...schema.objects.keys()];
}

function rootLine(
  schema: Schema,
  render: (t: S) => string,
  make: (name: string, expr: string) => string,
) {
  const r = schema.root;
  return r.k === 'obj' ? '' : make('Root', render(r));
}

/* ---------- Zod ---------- */

export function toZod(value: JsonValue, rootName = 'Root'): string {
  const schema = inferSchema(value, rootName);
  const z = (t: S): string => {
    let base: string;
    if (t.k === 'string') base = 'z.string()';
    else if (t.k === 'int') base = 'z.number().int()';
    else if (t.k === 'float') base = 'z.number()';
    else if (t.k === 'bool') base = 'z.boolean()';
    else if (t.k === 'list') base = `z.array(${z(t.item)})`;
    else if (t.k === 'obj') base = `${t.name}Schema`;
    else base = 'z.unknown()';
    return t.nullable && t.k !== 'any' ? `${base}.nullable()` : base;
  };
  const blocks = [...schema.objects].reverse().map(([name, fields]) => {
    const body = fields
      .map((f) => {
        const key = /^[A-Za-z_$][\w$]*$/.test(f.key) ? f.key : JSON.stringify(f.key);
        return `  ${key}: ${z(f.type)}${f.optional ? '.optional()' : ''},`;
      })
      .join('\n');
    return `export const ${name}Schema = z.object({\n${body}\n});\nexport type ${name} = z.infer<typeof ${name}Schema>;`;
  });
  const extra = rootLine(
    schema,
    z,
    (n, e) => `export const ${n}Schema = ${e};\nexport type ${n} = z.infer<typeof ${n}Schema>;`,
  );
  return ["import { z } from 'zod';", '', ...blocks, ...(extra ? [extra] : [])]
    .join('\n\n')
    .replace("zod';\n\n\n", "zod';\n\n");
}

/* ---------- Pydantic ---------- */

export function toPydantic(value: JsonValue, rootName = 'Root'): string {
  const schema = inferSchema(value, rootName);
  let usesAny = false;
  let usesField = false;
  let usesOptional = false;
  const py = (t: S): string => {
    let base: string;
    if (t.k === 'string') base = 'str';
    else if (t.k === 'int') base = 'int';
    else if (t.k === 'float') base = 'float';
    else if (t.k === 'bool') base = 'bool';
    else if (t.k === 'list') base = `list[${py(t.item)}]`;
    else if (t.k === 'obj') base = t.name;
    else {
      usesAny = true;
      base = 'Any';
    }
    if (t.nullable && t.k !== 'any') {
      usesOptional = true;
      return `Optional[${base}]`;
    }
    return base;
  };
  const classes = topLevelOrder(schema).map((name) => {
    const fields = schema.objects.get(name) ?? [];
    const taken = new Set<string>();
    const lines = fields.map((f) => {
      let attr = snake(f.key) || 'value';
      if (PY_KEYWORDS.has(attr)) attr += '_';
      while (taken.has(attr)) attr += '_';
      taken.add(attr);
      const needsAlias = attr !== f.key;
      if (needsAlias) usesField = true;
      let type = py(f.type);
      if (f.optional && !type.startsWith('Optional[') && type !== 'Any') {
        usesOptional = true;
        type = `Optional[${type}]`;
      }
      const defaultValue = f.optional ? 'None' : null;
      const alias = needsAlias ? `alias=${JSON.stringify(f.key)}` : null;
      let rhs = '';
      if (alias && defaultValue) rhs = ` = Field(default=None, ${alias})`;
      else if (alias) rhs = ` = Field(${alias})`;
      else if (defaultValue) rhs = ' = None';
      return `    ${attr}: ${type}${rhs}`;
    });
    return `class ${name}(BaseModel):\n${lines.length ? lines.join('\n') : '    pass'}`;
  });
  const typing = [usesAny && 'Any', usesOptional && 'Optional'].filter(Boolean).join(', ');
  const imports = [
    'from __future__ import annotations',
    '',
    ...(typing ? [`from typing import ${typing}`] : []),
    `from pydantic import BaseModel${usesField ? ', Field' : ''}`,
  ];
  const extra = rootLine(schema, py, (n, e) => `${n} = ${e}`);
  return [imports.join('\n'), ...classes, ...(extra ? [extra] : [])].join('\n\n\n');
}

/* ---------- Java records (Jackson) ---------- */

export function toJava(value: JsonValue, rootName = 'Root'): string {
  const schema = inferSchema(value, rootName);
  let usesList = false;
  let usesJson = false;
  const boxed = (t: S) => t.nullable;
  const java = (t: S): string => {
    if (t.k === 'string') return 'String';
    if (t.k === 'int') return boxed(t) ? 'Integer' : 'int';
    if (t.k === 'float') return boxed(t) ? 'Double' : 'double';
    if (t.k === 'bool') return boxed(t) ? 'Boolean' : 'boolean';
    if (t.k === 'list') {
      usesList = true;
      const inner = java(t.item);
      const wrapper: Record<string, string> = {
        int: 'Integer',
        double: 'Double',
        boolean: 'Boolean',
      };
      return `List<${wrapper[inner] ?? inner}>`;
    }
    if (t.k === 'obj') return t.name;
    return 'Object';
  };
  const records = topLevelOrder(schema).map((name, i) => {
    const fields = schema.objects.get(name) ?? [];
    const taken = new Set<string>();
    const params = fields.map((f) => {
      let n = camel(f.key);
      if (JAVA_KEYWORDS.has(n)) n += 'Value';
      while (taken.has(n)) n += '_';
      taken.add(n);
      const type = f.optional ? java({ ...f.type, nullable: true }) : java(f.type);
      const ann = n !== f.key ? `@JsonProperty(${JSON.stringify(f.key)}) ` : '';
      if (ann) usesJson = true;
      return `    ${ann}${type} ${n}`;
    });
    const mod = i === 0 ? 'public ' : '';
    return `${mod}record ${name}(${params.length ? `\n${params.join(',\n')}\n` : ''}) {}`;
  });
  const imports: string[] = [];
  if (usesList) imports.push('import java.util.List;');
  if (usesJson) imports.push('import com.fasterxml.jackson.annotation.JsonProperty;');
  return [...(imports.length ? [imports.join('\n')] : []), ...records].join('\n\n');
}

/* ---------- Go structs ---------- */

export function toGo(value: JsonValue, rootName = 'Root'): string {
  const schema = inferSchema(value, rootName);
  const go = (t: S, optional = false): string => {
    let base: string;
    if (t.k === 'string') base = 'string';
    else if (t.k === 'int') base = 'int64';
    else if (t.k === 'float') base = 'float64';
    else if (t.k === 'bool') base = 'bool';
    else if (t.k === 'list') return `[]${go(t.item)}`;
    else if (t.k === 'obj') base = t.name;
    else return 'any';
    return t.nullable || optional ? `*${base}` : base;
  };
  const structs = topLevelOrder(schema).map((name) => {
    const fields = schema.objects.get(name) ?? [];
    const taken = new Set<string>();
    const rows = fields.map((f) => {
      let n = pascal(f.key);
      while (taken.has(n)) n += '_';
      taken.add(n);
      return [
        n,
        go(f.type, f.optional),
        `\`json:"${f.key}${f.optional ? ',omitempty' : ''}"\``,
      ] as const;
    });
    const w0 = Math.max(0, ...rows.map((r) => r[0].length));
    const w1 = Math.max(0, ...rows.map((r) => r[1].length));
    const body = rows.map((r) => `\t${r[0].padEnd(w0)} ${r[1].padEnd(w1)} ${r[2]}`).join('\n');
    return `type ${name} struct {\n${body}\n}`;
  });
  return structs.join('\n\n');
}
