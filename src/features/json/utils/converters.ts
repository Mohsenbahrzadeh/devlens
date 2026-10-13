import { jsonToCSharpModels } from '@/features/http/generators/csharpClient';
import type { JsonValue } from '@/lib/json';
import { ok, type Result } from '@/types/result';
import { jsonToCsv } from './csv';
import { toGo, toJava, toPydantic, toZod } from './schema';
import { jsonToTypeScript } from './typescript';
import { jsonToXml } from './xml';
import { toYaml } from './yaml';

export type ConverterLanguage =
  'typescript' | 'csharp' | 'python' | 'java' | 'go' | 'yaml' | 'xml' | 'text';

export interface Converter {
  id: string;
  label: string;
  lang: ConverterLanguage;
  run: (value: JsonValue) => Result<string>;
}

/** Every "JSON → something" conversion, shared by the JSON tab and the DevTools panel. */
export const CONVERTERS: Converter[] = [
  {
    id: 'ts',
    label: 'TypeScript interfaces',
    lang: 'typescript',
    run: (v) => ok(jsonToTypeScript(v)),
  },
  { id: 'zod', label: 'Zod schema', lang: 'typescript', run: (v) => ok(toZod(v)) },
  { id: 'cs', label: 'C# records', lang: 'csharp', run: (v) => ok(jsonToCSharpModels(v)) },
  { id: 'py', label: 'Python (Pydantic)', lang: 'python', run: (v) => ok(toPydantic(v)) },
  { id: 'java', label: 'Java records', lang: 'java', run: (v) => ok(toJava(v)) },
  { id: 'go', label: 'Go structs', lang: 'go', run: (v) => ok(toGo(v)) },
  { id: 'yaml', label: 'YAML', lang: 'yaml', run: (v) => ok(toYaml(v)) },
  { id: 'csv', label: 'CSV', lang: 'text', run: jsonToCsv },
  { id: 'xml', label: 'XML', lang: 'xml', run: (v) => ok(jsonToXml(v)) },
];
