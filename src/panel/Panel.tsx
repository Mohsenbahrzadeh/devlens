import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CodeBlock, type Language } from '@/components/CodeBlock';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState } from '@/components/ErrorMessage';
import { Icon, Logo } from '@/components/Icon';
import { Input } from '@/components/Input';
import { JsonTree } from '@/components/JsonTree';
import { StatusBadge } from '@/components/StatusBadge';
import { Tabs } from '@/components/Tabs';
import { maskForSharing } from '@/features/collections/redact';
import { generateCSharp } from '@/features/http/generators/csharp';
import { generateTypedCSharp } from '@/features/http/generators/csharpClient';
import { generateCurl } from '@/features/http/generators/curl';
import { generateFetch } from '@/features/http/generators/fetch';
import { generatePython } from '@/features/http/generators/python';
import { findBearerToken, harToSpec } from '@/features/http/utils/har';
import { reviewToken } from '@/features/jwt/utils/security';
import { KNOWN_CLAIMS, decodeJwt, getTimeInfo } from '@/features/jwt/utils/token';
import { useTheme } from '@/hooks/useTheme';
import { CONVERTERS } from '@/features/json/utils/converters';
import { parseJson } from '@/lib/json';
import { ErrorMessage } from '@/components/ErrorMessage';

interface Header {
  name: string;
  value: string;
}

/** The part of a HAR entry (from chrome.devtools.network) that this panel uses. */
interface NetEntry {
  startedDateTime: string;
  time: number;
  _resourceType?: string;
  request: {
    method: string;
    url: string;
    headers: Header[];
    postData?: { mimeType?: string; text?: string };
  };
  response: {
    status: number;
    statusText: string;
    headers: Header[];
    content: { mimeType?: string; size?: number };
  };
  getContent: (cb: (content: string | null, encoding: string) => void) => void;
}

interface Row {
  id: number;
  entry: NetEntry;
}

const MAX_ROWS = 500;
const MAX_BODY = 200_000;

const statusTone = (s: number) =>
  s >= 500 ? 'bad' : s >= 400 ? 'warn' : s >= 300 ? 'info' : 'good';
const isApi = (e: NetEntry) =>
  ['xhr', 'fetch'].includes(e._resourceType ?? '') ||
  /json|xml|graphql|text\/plain/i.test(e.response.content.mimeType ?? '');

function HeaderTable({ headers }: { headers: Header[] }) {
  if (headers.length === 0) return <p className="text-xs text-muted">No headers.</p>;
  return (
    <dl className="divide-y divide-line">
      {headers.map((h, i) => (
        <div key={i} className="grid grid-cols-[minmax(110px,30%)_1fr] gap-2 py-1">
          <dt className="break-all font-mono text-xs font-semibold text-accent">{h.name}</dt>
          <dd className="break-all font-mono text-xs">{h.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Body({ text, title }: { text: string; title: string }) {
  const trimmed = text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text;
  const json = useMemo(() => (/^\s*[{[]/.test(trimmed) ? parseJson(trimmed) : null), [trimmed]);
  if (!text) return <p className="text-xs text-muted">Empty body.</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="section-title">{title}</span>
        <CopyButton text={trimmed} />
      </div>
      {json?.ok ? (
        <div className="rounded-lg border border-line p-2">
          <JsonTree value={json.value} />
        </div>
      ) : (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface2 p-2 font-mono text-xs">
          {trimmed}
        </pre>
      )}
      {text.length > MAX_BODY && (
        <p className="text-[11px] text-muted">Truncated to 200,000 characters.</p>
      )}
    </div>
  );
}

function JwtView({ token }: { token: string }) {
  const decoded = decodeJwt(token);
  if (!decoded.ok) return <p className="text-xs text-muted">{decoded.error.message}</p>;
  const time = getTimeInfo(decoded.value.payload);
  const notes = reviewToken(decoded.value.header, decoded.value.payload);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-muted">Decoded locally. The signature is not verified here.</p>
      <div className="flex flex-wrap items-center gap-2">
        {time.exp &&
          (time.exp.status === 'valid' ? (
            <StatusBadge tone="good">Valid</StatusBadge>
          ) : (
            <StatusBadge tone="bad">Expired</StatusBadge>
          ))}
        {time.exp && (
          <span className="font-mono text-xs">
            {time.exp.status === 'valid' ? 'expires' : 'expired'} {time.exp.date} (
            {time.exp.relative})
          </span>
        )}
      </div>
      {notes
        .filter((n) => n.level === 'warn')
        .map((n) => (
          <p key={n.text} className="text-xs text-warn">
            ⚠ {n.text}
          </p>
        ))}
      <Card title="Header" icon="code">
        <JsonTree value={decoded.value.header} />
      </Card>
      <Card title="Payload" icon="code">
        <JsonTree value={decoded.value.payload} hints={KNOWN_CLAIMS} />
      </Card>
    </div>
  );
}

const GENERATORS: { id: string; label: string; lang: Language }[] = [
  { id: 'curl', label: 'cURL', lang: 'bash' },
  { id: 'csharp', label: 'C#', lang: 'csharp' },
  { id: 'fetch', label: 'JavaScript', lang: 'javascript' },
  { id: 'python', label: 'Python', lang: 'python' },
];

function MaskToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
      <input
        type="checkbox"
        className="accent-[rgb(var(--accent))]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      Mask secrets (Authorization, cookies, tokens, passwords) — safe to paste into a ticket
    </label>
  );
}

const MODEL_TARGETS = [{ id: 'client', label: 'C# models + typed client + usage' }, ...CONVERTERS];

function ModelsView({ response, spec }: { response: string; spec: ReturnType<typeof harToSpec> }) {
  const [target, setTarget] = useState('client');
  const parsed = useMemo(() => parseJson(response.slice(0, MAX_BODY)), [response]);
  const output = useMemo(() => {
    if (!parsed.ok) return null;
    if (target === 'client') return generateTypedCSharp(spec, response);
    const c = CONVERTERS.find((x) => x.id === target) ?? CONVERTERS[0];
    const r = c.run(parsed.value);
    return r.ok
      ? ({ ok: true, value: [{ title: c.label, language: c.lang, code: r.value }] } as const)
      : r;
  }, [parsed, target, spec, response]);

  if (!response) return <p className="text-xs text-muted">Waiting for the response body…</p>;
  if (!parsed.ok) {
    return (
      <p className="text-xs text-muted">
        This response is not JSON, so models cannot be generated. ({parsed.error.message})
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted">
        Generated from the real response of this request, locally in DevTools.
      </p>
      <select
        aria-label="Generate"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="field font-semibold"
      >
        {MODEL_TARGETS.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      {output && !output.ok && <ErrorMessage error={output.error} />}
      {output?.ok &&
        output.value.map((section) => (
          <CodeBlock
            key={section.title}
            code={section.code}
            language={section.language}
            title={section.title}
            maxHeight={420}
          />
        ))}
    </div>
  );
}

function Detail({ entry }: { entry: NetEntry }) {
  const [tab, setTab] = useState('request');
  const [gen, setGen] = useState('curl');
  const [response, setResponse] = useState<string | null>(null);

  useEffect(() => {
    entry.getContent((content, encoding) => {
      setResponse(encoding === 'base64' ? '(binary content)' : (content ?? ''));
    });
  }, [entry]);

  const [mask, setMask] = useState(false);
  const rawSpec = useMemo(() => harToSpec(entry.request), [entry]);
  const spec = useMemo(() => (mask ? maskForSharing(rawSpec) : rawSpec), [mask, rawSpec]);
  const token = findBearerToken(entry.request.headers);
  const code = useMemo(() => {
    if (gen === 'csharp') return generateCSharp(spec);
    if (gen === 'fetch') return generateFetch(spec);
    if (gen === 'python') return generatePython(spec);
    return generateCurl(spec);
  }, [gen, spec]);

  const tabs = [
    { id: 'request', label: 'Request' },
    { id: 'response', label: 'Response' },
    ...(token ? [{ id: 'jwt', label: 'JWT' }] : []),
    { id: 'models', label: 'Models' },
    { id: 'code', label: 'Copy as…' },
  ];

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-accent">{entry.request.method}</span>
          <StatusBadge tone={statusTone(entry.response.status)}>
            {`${entry.response.status} ${entry.response.statusText}`.trim() || 'pending'}
          </StatusBadge>
          <span className="text-xs text-muted">{Math.round(entry.time)} ms</span>
        </div>
        <p className="mt-1 break-all font-mono text-xs">{entry.request.url}</p>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} label="Request details" size="sm" />
      {tab === 'request' && (
        <div className="flex flex-col gap-3">
          <Card title="Request headers" icon="send">
            <HeaderTable headers={entry.request.headers} />
          </Card>
          {entry.request.postData?.text && (
            <Card title="Request body" icon="code">
              <Body
                title={entry.request.postData.mimeType ?? 'body'}
                text={entry.request.postData.text}
              />
            </Card>
          )}
        </div>
      )}
      {tab === 'response' && (
        <div className="flex flex-col gap-3">
          <Card title="Response headers" icon="download">
            <HeaderTable headers={entry.response.headers} />
          </Card>
          <Card title="Response body" icon="code">
            {response === null ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : (
              <Body title={entry.response.content.mimeType ?? 'body'} text={response} />
            )}
          </Card>
        </div>
      )}
      {tab === 'jwt' && token && <JwtView token={token} />}
      {tab === 'models' && (
        <div className="flex flex-col gap-2">
          <MaskToggle checked={mask} onChange={setMask} />
          <ModelsView response={response ?? ''} spec={spec} />
        </div>
      )}
      {tab === 'code' && (
        <div className="flex flex-col gap-2">
          <Tabs tabs={GENERATORS} active={gen} onChange={setGen} label="Language" size="sm" />
          <MaskToggle checked={mask} onChange={setMask} />
          <CodeBlock
            code={code}
            language={GENERATORS.find((g) => g.id === gen)?.lang ?? 'bash'}
            maxHeight={420}
          />
          <p className="text-[11px] text-muted">
            Headers such as Authorization are included exactly as sent. Review before sharing.
          </p>
        </div>
      )}
    </div>
  );
}

export function Panel() {
  useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [apiOnly, setApiOnly] = useState(true);
  const [preserve, setPreserve] = useState(false);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.devtools?.network) return;
    let next = 1;
    const onFinished = (req: unknown) => {
      const entry = req as NetEntry;
      setRows((r) => [...r, { id: next++, entry }].slice(-MAX_ROWS));
    };
    chrome.devtools.network.onRequestFinished.addListener(onFinished);
    return () => chrome.devtools.network.onRequestFinished.removeListener(onFinished);
  }, []);

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.devtools?.network || preserve) return;
    const onNavigated = () => {
      setRows([]);
      setSelected(null);
    };
    chrome.devtools.network.onNavigated.addListener(onNavigated);
    return () => chrome.devtools.network.onNavigated.removeListener(onNavigated);
  }, [preserve]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!apiOnly || isApi(r.entry)) &&
        (!q ||
          `${r.entry.request.method} ${r.entry.request.url} ${r.entry.response.status}`
            .toLowerCase()
            .includes(q)),
    );
  }, [rows, filter, apiOnly]);

  const current = rows.find((r) => r.id === selected)?.entry;

  return (
    <div className="flex h-screen flex-col gap-3 p-3">
      <header className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2">
          <Logo size={24} />
          <span className="text-base font-extrabold">
            Dev
            <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
              Lens
            </span>
          </span>
        </span>
        <div className="relative min-w-[200px] flex-1">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            aria-label="Filter requests"
            className="!pl-8"
            placeholder="Filter by URL, method or status…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            className="accent-[rgb(var(--accent))]"
            checked={apiOnly}
            onChange={(e) => setApiOnly(e.target.checked)}
          />
          API calls only (XHR / fetch / JSON)
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            className="accent-[rgb(var(--accent))]"
            checked={preserve}
            onChange={(e) => setPreserve(e.target.checked)}
          />
          Preserve log
        </label>
        <Button
          icon="eraser"
          onClick={() => {
            setRows([]);
            setSelected(null);
          }}
        >
          Clear
        </Button>
        <span className="flex items-center gap-1 text-[11px] text-muted">
          <Icon name="shield" size={11} className="text-good" /> Everything stays in this DevTools
          window
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="card flex max-h-72 min-h-0 flex-col overflow-hidden lg:max-h-none lg:w-[42%]">
          {visible.length === 0 ? (
            <div className="p-4">
              <EmptyState icon="send">
                {rows.length === 0
                  ? 'Reload the page or trigger a request. Finished requests appear here.'
                  : 'No requests match the current filters.'}
              </EmptyState>
            </div>
          ) : (
            <ul role="listbox" aria-label="Requests" className="min-h-0 flex-1 overflow-y-auto">
              {[...visible].reverse().map((r) => (
                <li key={r.id} role="option" aria-selected={r.id === selected}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.id)}
                    className={`flex w-full items-center gap-2 border-b border-line px-2.5 py-1.5 text-left hover:bg-surface2 ${
                      r.id === selected ? 'bg-accent/10' : ''
                    }`}
                  >
                    <span className="w-12 shrink-0 font-mono text-[10px] font-bold text-accent">
                      {r.entry.request.method}
                    </span>
                    <span
                      className={`w-8 shrink-0 font-mono text-xs font-bold ${
                        r.entry.response.status >= 400 ? 'text-bad' : 'text-good'
                      }`}
                    >
                      {r.entry.response.status || '—'}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate font-mono text-xs"
                      title={r.entry.request.url}
                    >
                      {r.entry.request.url.replace(/^https?:\/\//, '')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {current ? (
            <Detail key={selected} entry={current} />
          ) : (
            <EmptyState icon="search">
              Select a request to inspect it, decode its JWT or copy it as code.
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
