import { useMemo, useState } from 'react';
import type { ToolProps } from '@/app/seed';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CodeBlock } from '@/components/CodeBlock';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState, ErrorMessage } from '@/components/ErrorMessage';
import { Icon } from '@/components/Icon';
import { Input } from '@/components/Input';
import { JsonTree } from '@/components/JsonTree';
import { Tabs } from '@/components/Tabs';
import { TextArea } from '@/components/TextArea';
import { useCtrlEnter } from '@/hooks/useCtrlEnter';
import { formatJson, minifyJson, parseJson, searchJson } from '@/lib/json';
import type { AppError } from '@/types/result';
import { queryJsonPath } from '../utils/jsonpath';
import { xmlToJson } from '../utils/xml';
import { CONVERTERS as TARGETS } from '../utils/converters';
import { repairJson } from '@/lib/repair';

type View = 'tree' | 'query' | 'convert';
const VIEWS = [
  { id: 'tree', label: 'Tree', icon: 'code' as const },
  { id: 'query', label: 'JSONPath', icon: 'search' as const },
  { id: 'convert', label: 'Convert', icon: 'sparkles' as const },
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

  const [repairNote, setRepairNote] = useState<string[] | null>(null);
  const repair = useMemo(
    () => (parsed && !parsed.ok && !looksLikeXml ? repairJson(input) : null),
    [parsed, looksLikeXml, input],
  );
  const applyRepair = () => {
    if (repair?.ok) {
      setInput(JSON.stringify(JSON.parse(repair.value.json), null, 2));
      setRepairNote(repair.value.fixes);
    }
  };

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
          setRepairNote(null);
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
      {repair?.ok && (
        <div
          role="status"
          className="animate-rise flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 p-2.5 text-xs"
        >
          <Icon name="sparkles" size={14} className="text-accent" />
          <span className="min-w-0 flex-1">
            This can be repaired automatically: {repair.value.fixes.join('; ') || 'minor fixes'}.
          </span>
          <Button variant="primary" onClick={applyRepair}>
            Repair JSON
          </Button>
        </div>
      )}
      {repairNote && parsed?.ok && (
        <p role="status" className="text-xs text-good">
          ✓ Repaired: {repairNote.join('; ') || 'no changes needed'}.
        </p>
      )}
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
