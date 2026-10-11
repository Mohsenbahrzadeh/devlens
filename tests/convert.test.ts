import { describe, expect, it } from 'vitest';
import type { JsonValue } from '@/lib/json';
import { toGo, toJava, toPydantic, toZod } from '@/features/json/utils/schema';
import { toYaml } from '@/features/json/utils/yaml';
import { jsonToCsv } from '@/features/json/utils/csv';
import { jsonToXml } from '@/features/json/utils/xml';

const sample: JsonValue = {
  id: 1,
  userName: 'a',
  price: 9.5,
  active: true,
  note: null,
  tags: ['x'],
  address: { city: 'Berlin' },
  items: [{ sku: 'A', qty: 2 }, { sku: 'B' }],
  'created-at': '2026-01-01',
};

describe('toZod', () => {
  const out = toZod(sample);
  it('declares schemas children-first with inferred types', () => {
    expect(out.startsWith("import { z } from 'zod';")).toBe(true);
    expect(out).toContain('export const RootSchema = z.object({');
    expect(out.indexOf('AddressSchema')).toBeLessThan(out.indexOf('RootSchema'));
    expect(out).toContain('id: z.number().int(),');
    expect(out).toContain('price: z.number(),');
    expect(out).toContain('active: z.boolean(),');
    expect(out).toContain('note: z.unknown(),');
    expect(out).toContain('tags: z.array(z.string()),');
    expect(out).toContain('address: AddressSchema,');
    expect(out).toContain('qty: z.number().int().optional(),');
    expect(out).toContain('"created-at": z.string(),');
    expect(out).toContain('export type Root = z.infer<typeof RootSchema>;');
  });
  it('handles primitives at the root', () => {
    expect(toZod('x')).toContain('export const RootSchema = z.string();');
  });
});

describe('toPydantic', () => {
  const out = toPydantic(sample);
  it('creates BaseModel classes with aliases and optionals', () => {
    expect(out).toContain('from pydantic import BaseModel, Field');
    expect(out).toContain('from typing import Any, Optional');
    expect(out).toContain('class Root(BaseModel):');
    expect(out).toContain('    user_name: str = Field(alias="userName")');
    expect(out).toContain('    id: int');
    expect(out).toContain('    price: float');
    expect(out).toContain('    active: bool');
    expect(out).toContain('    note: Any');
    expect(out).toContain('    tags: list[str]');
    expect(out).toContain('    address: Address');
    expect(out).toContain('    items: list[Item]');
    expect(out).toContain('    qty: Optional[int] = None');
    expect(out).toContain('    created_at: str = Field(alias="created-at")');
  });
  it('escapes Python keywords', () => {
    expect(toPydantic({ class: 1 })).toContain('class_: int = Field(alias="class")');
  });
});

describe('toJava', () => {
  const out = toJava(sample);
  it('creates records with Jackson annotations for renamed keys', () => {
    expect(out).toContain('import java.util.List;');
    expect(out).toContain('import com.fasterxml.jackson.annotation.JsonProperty;');
    expect(out).toContain('public record Root(');
    expect(out).toContain('    int id');
    expect(out).toContain('    double price');
    expect(out).toContain('    boolean active');
    expect(out).toContain('    Object note');
    expect(out).toContain('    List<String> tags');
    expect(out).toContain('    Address address');
    expect(out).toContain('    List<Item> items');
    expect(out).toContain('    Integer qty');
    expect(out).toContain('@JsonProperty("created-at") String createdAt');
  });
  it('avoids Java keywords', () => {
    expect(toJava({ class: 'x' })).toContain('String classValue');
  });
});

describe('toGo', () => {
  const out = toGo(sample);
  it('creates json-tagged structs with pointer optionals', () => {
    expect(out).toContain('type Root struct {');
    expect(out).toMatch(/Id\s+int64\s+`json:"id"`/);
    expect(out).toMatch(/UserName\s+string\s+`json:"userName"`/);
    expect(out).toMatch(/Price\s+float64\s+`json:"price"`/);
    expect(out).toMatch(/Note\s+any\s+`json:"note"`/);
    expect(out).toMatch(/Tags\s+\[\]string\s+`json:"tags"`/);
    expect(out).toMatch(/Items\s+\[\]Item\s+`json:"items"`/);
    expect(out).toMatch(/Qty\s+\*int64\s+`json:"qty,omitempty"`/);
  });
});

describe('toYaml', () => {
  it('serialises nested structures', () => {
    const out = toYaml({
      name: 'a',
      n: 1,
      ok: true,
      none: null,
      list: [1, { a: 1, b: [2] }],
      o: {},
      e: [],
    });
    expect(out).toBe(
      [
        'name: a',
        'n: 1',
        'ok: true',
        'none: null',
        'list:',
        '- 1',
        '- a: 1',
        '  b:',
        '  - 2',
        'o: {}',
        'e: []',
        '',
      ].join('\n'),
    );
  });
  it('quotes ambiguous strings', () => {
    const out = toYaml({
      a: 'true',
      b: '123',
      c: '',
      d: 'x: y',
      e: ' pad',
      f: 'line\nbreak',
      g: '#c',
      h: 'plain',
    });
    expect(out).toContain('a: "true"');
    expect(out).toContain('b: "123"');
    expect(out).toContain('c: ""');
    expect(out).toContain('d: "x: y"');
    expect(out).toContain('e: " pad"');
    expect(out).toContain('f: "line\\nbreak"');
    expect(out).toContain('g: "#c"');
    expect(out).toContain('h: plain');
  });
  it('handles root arrays and nested arrays of arrays', () => {
    expect(toYaml([1, [2, 3]])).toBe('- 1\n- - 2\n  - 3\n');
  });
});

describe('jsonToCsv', () => {
  it('flattens nested objects and escapes cells', () => {
    const r = jsonToCsv([
      { id: 1, name: 'a,b', addr: { city: 'X' } },
      { id: 2, name: 'say "hi"', extra: [1, 2] },
    ]);
    expect(r.ok && r.value).toBe('id,name,addr.city,extra\n1,"a,b",X,\n2,"say ""hi""",,"[1,2]"\n');
  });
  it('accepts a single object and rejects non-objects', () => {
    expect(jsonToCsv({ a: 1 }).ok).toBe(true);
    expect(jsonToCsv([1, 2]).ok).toBe(false);
    expect(jsonToCsv([]).ok).toBe(false);
  });
});

describe('jsonToXml', () => {
  it('writes elements, arrays, nulls and escapes text', () => {
    const out = jsonToXml({ a: 1, b: ['x', 'y'], c: { d: '<&>' }, e: null }, 'doc');
    expect(out).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<doc>',
        '  <a>1</a>',
        '  <b>x</b>',
        '  <b>y</b>',
        '  <c>',
        '    <d>&lt;&amp;&gt;</d>',
        '  </c>',
        '  <e/>',
        '</doc>',
        '',
      ].join('\n'),
    );
  });
  it('emits attributes and sanitises names', () => {
    const out = jsonToXml({ item: { '@id': '7', '#text': 'hi' }, '1bad key': 1 });
    expect(out).toContain('<item id="7">hi</item>');
    expect(out).toContain('<_1bad_key>1</_1bad_key>');
  });
  it('wraps root arrays', () => {
    expect(jsonToXml([1, 2])).toContain('<item>1</item>');
  });
});
