import { useMemo, useState } from 'react';
import type { ToolProps } from '@/app/seed';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CodeBlock, type Language } from '@/components/CodeBlock';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState, ErrorMessage } from '@/components/ErrorMessage';
import { Icon } from '@/components/Icon';
import { Input } from '@/components/Input';
import { JsonTree } from '@/components/JsonTree';
import { Tabs } from '@/components/Tabs';
import { TextArea } from '@/components/TextArea';
import { useCtrlEnter } from '@/hooks/useCtrlEnter';
import { jsonToCSharpModels } from '@/features/http/generators/csharpClient';
import { formatJson, minifyJson, parseJson, searchJson, type JsonValue } from '@/lib/json';
import { ok, type AppError, type Result } from '@/types/result';
import { jsonToCsv } from '../utils/csv';
import { queryJsonPath } from '../utils/jsonpath';
import { toGo, toJava, toPydantic, toZod } from '../utils/schema';
import { jsonToTypeScript } from '../utils/typescript';
import { jsonToXml, xmlToJson } from '../utils/xml';
import { toYaml } from '../utils/yaml';

type View = 'tree' | 'query' | 'convert';
const VIEWS = [
  { id: 'tree', label: 'Tree', icon: 'code' as const },
  { id: 'query', label: 'JSONPath', icon: 'search' as const },
  { id: 'convert', label: 'Convert', icon: 'sparkles' as const },
];

interface Target {
  id: string;
  label: string;
  lang: Language;
  run: (v: JsonValue) => Result<string>;
}

const TARGETS: Target[] = [
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

export function JsonViewer({ seed }: ToolProps) {
  const [input, setInput] = useState(seed ?? '');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('tree');
  const [path, setPath] = useState('');
  const [targetId, setTargetId] = useState('ts');

  const parsed = useMemo(() => (input.trim() ? parseJson(input) : null), [input]);
  const matches = useMemo(
    () => (parsed?.ok ? searchJson(parsed.value, query) : undefined),
    [parsed, query],
  );
  const queryResult = useMemo(
    () => (parsed?.ok && path.trim() ? queryJsonPath(parsed.value, path) : null),
    [parsed, path],
  );
  const queryText = queryResult?.ok
    ? queryResult.value.map((v) => JSON.stringify(v, null, 2)).join('\n')
    : '';
  const target = TARGETS.find((t) => t.id === targetId) ?? TARGETS[0];
  const converted = useMemo(
    () => (parsed?.ok && view === 'convert' ? target.run(parsed.value) : null),
    [parsed, view, target],
  );

  const [xmlError, setXmlError] = useState<AppError | null>(null);
  const importXml = () => {
    const r = xmlToJson(input);
    if (r.ok) {
      setInput(JSON.stringify(r.value, null, 2));
      setXmlError(null);
    } else {
      setXmlError(r.error);
    }
  };

  const format = () => {
    const r = formatJson(input);
    if (r.ok) setInput(r.value);
  };
  const minify = () => {
    const r = minifyJson(input);
    if (r.ok) setInput(r.value);
  };
  useCtrlEnter(format);

  const looksLikeXml = input.trimStart().startsWith('<');

  return (
    <div className="flex flex-col gap-3">
      <TextArea
        label="JSON"
        rows={7}
        placeholder="Paste JSON here (or XML to convert it to JSON)..."
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setXmlError(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon="sparkles" onClick={format} disabled={!parsed?.ok}>
          Format
        </Button>
        <Button onClick={minify} disabled={!parsed?.ok}>
          Minify
        </Button>
        {looksLikeXml && (
          <Button icon="download" onClick={importXml}>
            XML → JSON
          </Button>
        )}
        <Button
          icon="eraser"
          onClick={() => {
            setInput('');
            setQuery('');
            setPath('');
            setXmlError(null);
          }}
        >
          Clear
        </Button>
        <CopyButton text={input} label="Copy JSON" disabled={!parsed?.ok} className="ml-auto" />
      </div>

      {xmlError && <ErrorMessage error={xmlError} />}
      {parsed && !parsed.ok && !looksLikeXml && <ErrorMessage error={parsed.error} />}
      {!parsed && (
        <EmptyState icon="code">Paste JSON above to browse, query and convert it.</EmptyState>
      )}

      {parsed?.ok && (
        <Tabs
          tabs={VIEWS}
          active={view}
          onChange={(v) => setView(v as View)}
          label="JSON views"
          size="sm"
        />
      )}

      {parsed?.ok && view === 'query' && (
        <div className="flex flex-col gap-2">
          <Input
            aria-label="JSONPath expression"
            className="font-mono text-xs"
            placeholder="$.users[*].name   (supports .key [n] [*] .* ..key)"
            value={path}
            onChange={(e) => setPath(e.target.value)}
          />
          {queryResult && !queryResult.ok && <ErrorMessage error={queryResult.error} />}
          {queryResult?.ok && (
            <>
              <p role="status" className="text-xs text-muted">
                {queryResult.value.length} result{queryResult.value.length === 1 ? '' : 's'}
              </p>
              {queryResult.value.length > 0 && (
                <CodeBlock code={queryText} language="json" title="Result" />
              )}
            </>
          )}
          {!queryResult && (
            <EmptyState icon="search">Type a JSONPath such as $.items[0].</EmptyState>
          )}
        </div>
      )}

      {parsed?.ok && view === 'convert' && (
        <div className="flex flex-col gap-2">
          <select
            aria-label="Convert to"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="field font-semibold"
          >
            {TARGETS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {converted && !converted.ok && <ErrorMessage error={converted.error} />}
          {converted?.ok && (
            <CodeBlock
              code={converted.value}
              language={target.lang}
              title={target.label}
              maxHeight={340}
            />
          )}
        </div>
      )}

      {parsed?.ok && view === 'tree' && (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Icon
              name="search"
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              type="search"
              aria-label="Search keys and values"
              className="!pl-8"
              placeholder="Search keys and values..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query.trim() && (
            <p role="status" className="text-xs text-muted">
              {matches?.size ?? 0} match{matches?.size === 1 ? '' : 'es'}
            </p>
          )}
          <Card title="JSON tree" icon="code">
            <JsonTree value={parsed.value} matches={matches} />
          </Card>
        </div>
      )}
    </div>
  );
}
