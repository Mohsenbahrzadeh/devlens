import { useMemo, useState } from 'react';
import type { ToolProps } from '@/app/seed';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState, ErrorMessage } from '@/components/ErrorMessage';
import { Input } from '@/components/Input';
import { Tabs } from '@/components/Tabs';
import { TextArea } from '@/components/TextArea';
import { useCtrlEnter } from '@/hooks/useCtrlEnter';
import { base64ToUtf8, utf8ToBase64 } from '@/lib/base64';
import { ok, type AppError, type Result } from '@/types/result';
import { HASH_ALGS, digestText, hmacText, type DigestResult, type HashAlg } from '../utils/hash';
import { CHARSETS, randomString, ulid, uuidV4, uuidV7, type Charset } from '../utils/ids';
import { buildQuery, parseQuery } from '../utils/query';
import { testRegex } from '../utils/regex';
import { searchStatusCodes } from '../utils/statusCodes';
import { convertTimestamp } from '../utils/timestamp';
import { urlDecode, urlEncode } from '../utils/url';
import { inspectUuid } from '../utils/uuid';

interface TransformProps {
  title: string;
  encodeLabel: string;
  decodeLabel: string;
  encode: (s: string) => Result<string>;
  decode: (s: string) => Result<string>;
  initial?: string;
}

function Transform({
  title,
  encodeLabel,
  decodeLabel,
  encode,
  decode,
  initial = '',
}: TransformProps) {
  const [input, setInput] = useState(initial);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<AppError | null>(null);

  const run = (fn: (s: string) => Result<string>) => {
    const r = fn(input);
    if (r.ok) {
      setOutput(r.value);
      setError(null);
    } else {
      setOutput('');
      setError(r.error);
    }
  };
  useCtrlEnter(() => run(encode));

  return (
    <div className="flex flex-col gap-3">
      <TextArea
        label={`${title} input`}
        rows={5}
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => run(encode)}>
          {encodeLabel}
        </Button>
        <Button variant="primary" onClick={() => run(decode)}>
          {decodeLabel}
        </Button>
        <Button
          icon="eraser"
          onClick={() => {
            setInput('');
            setOutput('');
            setError(null);
          }}
        >
          Clear
        </Button>
      </div>
      {error && <ErrorMessage error={error} />}
      <TextArea label="Output" rows={5} readOnly value={output} />
      <div>
        <CopyButton text={output} disabled={!output} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <dt className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 break-all font-mono text-xs">{value}</dd>
      <CopyButton text={value} />
    </div>
  );
}

function Timestamp({ initial = '' }: { initial?: string }) {
  const [input, setInput] = useState(initial);
  const result = input.trim() ? convertTimestamp(input) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          aria-label="Unix timestamp"
          placeholder="Unix timestamp (seconds or milliseconds)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <Button icon="clock" onClick={() => setInput(String(Math.floor(Date.now() / 1000)))}>
          Now
        </Button>
      </div>
      {!result && <EmptyState icon="clock">Enter a Unix timestamp to convert it.</EmptyState>}
      {result && !result.ok && <ErrorMessage error={result.error} />}
      {result?.ok && (
        <Card title={`Detected: ${result.value.unit}`} icon="clock">
          <dl className="divide-y divide-line">
            <Row label="UTC" value={result.value.utc} />
            <Row label="Local" value={result.value.local} />
            <Row label="ISO 8601" value={result.value.iso} />
          </dl>
        </Card>
      )}
    </div>
  );
}

function Uuid({ initial = '' }: { initial?: string }) {
  const [input, setInput] = useState(initial);
  const result = input.trim() ? inspectUuid(input) : null;
  return (
    <div className="flex flex-col gap-3">
      <Input
        aria-label="UUID"
        className="font-mono text-xs"
        placeholder="01994f4e-0000-7000-8000-000000000000"
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />
      {!result && (
        <EmptyState icon="key">Paste a UUID to inspect its version and variant.</EmptyState>
      )}
      {result && !result.ok && <ErrorMessage error={result.error} />}
      {result?.ok && (
        <Card title="UUID details" icon="key">
          <dl className="divide-y divide-line">
            <Row label="Normalized" value={result.value.normalized} />
            <Row
              label="Version"
              value={String(result.value.version ?? 'Unknown (non-RFC variant)')}
            />
            <Row label="Variant" value={result.value.variant} />
            {result.value.details.map((d) => (
              <Row key={d.label} label={d.label} value={d.value} />
            ))}
          </dl>
        </Card>
      )}
    </div>
  );
}

function QueryString({ initial = '' }: { initial?: string }) {
  const [mode, setMode] = useState('parse');
  const [input, setInput] = useState(initial);
  const [rows, setRows] = useState([{ key: '', value: '' }]);
  const result = input.trim() ? parseQuery(input) : null;
  const built = buildQuery(rows);
  return (
    <div className="flex flex-col gap-3">
      <Tabs
        tabs={[
          { id: 'parse', label: 'Parse' },
          { id: 'build', label: 'Build' },
        ]}
        active={mode}
        onChange={setMode}
        label="Query string tools"
        size="sm"
      />
      {mode === 'parse' ? (
        <>
          <TextArea
            label="URL or query string"
            rows={3}
            placeholder="https://example.com/search?q=hello+world&page=2"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          {!result && (
            <EmptyState icon="search">Paste a URL to see its decoded query parameters.</EmptyState>
          )}
          {result && !result.ok && <ErrorMessage error={result.error} />}
          {result?.ok && (
            <Card title="Parameters" icon="search" flush>
              {result.value.base && (
                <p className="break-all border-b border-line px-3 py-2 font-mono text-xs text-muted">
                  {result.value.base}
                </p>
              )}
              {result.value.params.length === 0 ? (
                <p className="p-3 text-muted">No query parameters found.</p>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted">
                      <th className="px-3 py-1.5 font-semibold">Key</th>
                      <th className="px-3 py-1.5 font-semibold">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.value.params.map((p, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="px-3 py-1.5 font-mono text-xs font-semibold text-accent">
                          {p.key}
                        </td>
                        <td className="break-all px-3 py-1.5 font-mono text-xs">{p.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex gap-1.5">
                <Input
                  aria-label={`Parameter ${i + 1} key`}
                  placeholder="key"
                  value={r.key}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                  }
                />
                <Input
                  aria-label={`Parameter ${i + 1} value`}
                  placeholder="value"
                  value={r.value}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                />
                <Button
                  variant="ghost"
                  aria-label={`Remove parameter ${i + 1}`}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                >
                  ✕
                </Button>
              </div>
            ))}
            <div>
              <Button icon="plus" onClick={() => setRows([...rows, { key: '', value: '' }])}>
                Add parameter
              </Button>
            </div>
          </div>
          <Card
            title="Query string"
            icon="search"
            actions={<CopyButton text={built} disabled={!built} />}
          >
            <p className="break-all font-mono text-xs">{built || 'Add parameters above.'}</p>
          </Card>
        </>
      )}
    </div>
  );
}

function Hash() {
  const [input, setInput] = useState('');
  const [alg, setAlg] = useState<HashAlg>('SHA-256');
  const [key, setKey] = useState('');
  const [out, setOut] = useState<DigestResult | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  const run = async (hmac: boolean) => {
    if (hmac) {
      const r = await hmacText(alg, key, input);
      setOut(r.ok ? r.value : null);
      setError(r.ok ? null : r.error);
    } else {
      setOut(await digestText(alg, input));
      setError(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <TextArea label="Text" rows={4} value={input} onChange={(e) => setInput(e.target.value)} />
      <div className="flex gap-2">
        <select
          aria-label="Algorithm"
          value={alg}
          onChange={(e) => setAlg(e.target.value as HashAlg)}
          className="field w-32 shrink-0 font-mono"
        >
          {HASH_ALGS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <Input
          type="password"
          aria-label="HMAC key"
          autoComplete="off"
          placeholder="HMAC key (for HMAC only)"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => void run(false)}>
          Hash
        </Button>
        <Button variant="primary" onClick={() => void run(true)}>
          HMAC
        </Button>
      </div>
      {error && <ErrorMessage error={error} />}
      {out && (
        <Card title="Result" icon="shield">
          <dl className="divide-y divide-line">
            <Row label="Hex" value={out.hex} />
            <Row label="Base64" value={out.base64} />
          </dl>
        </Card>
      )}
    </div>
  );
}

function Generate() {
  const [count, setCount] = useState(5);
  const [kind, setKind] = useState<'uuid4' | 'uuid7' | 'ulid' | 'random'>('uuid7');
  const [length, setLength] = useState(32);
  const [charset, setCharset] = useState<Charset>('alphanumeric');
  const generateValues = (k: typeof kind, c: number, len: number, set: Charset) => {
    const n = Math.min(Math.max(c, 1), 50);
    const one = () =>
      k === 'uuid4'
        ? uuidV4()
        : k === 'uuid7'
          ? uuidV7()
          : k === 'ulid'
            ? ulid()
            : randomString(Math.min(Math.max(len, 1), 256), set);
    return Array.from({ length: n }, one);
  };
  const [values, setValues] = useState<string[]>(() =>
    generateValues('uuid7', 5, 32, 'alphanumeric'),
  );
  const make = () => setValues(generateValues(kind, count, length, charset));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Type"
          value={kind}
          onChange={(e) => setKind(e.target.value as typeof kind)}
          className="field w-44 font-semibold"
        >
          <option value="uuid7">UUID v7 (time-ordered)</option>
          <option value="uuid4">UUID v4 (random)</option>
          <option value="ulid">ULID</option>
          <option value="random">Random string</option>
        </select>
        <Input
          type="number"
          aria-label="How many"
          className="!w-20"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        {kind === 'random' && (
          <>
            <Input
              type="number"
              aria-label="Length"
              className="!w-20"
              min={1}
              max={256}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
            />
            <select
              aria-label="Characters"
              value={charset}
              onChange={(e) => setCharset(e.target.value as Charset)}
              className="field w-36"
            >
              {(Object.keys(CHARSETS) as Charset[]).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </>
        )}
        <Button variant="primary" icon="sparkles" onClick={make}>
          Generate
        </Button>
      </div>
      <p className="text-[11px] text-muted">
        Generated with the browser’s cryptographic random number generator. Nothing is sent
        anywhere.
      </p>
      {values.length > 0 && (
        <Card
          title={`${values.length} value${values.length === 1 ? '' : 's'}`}
          icon="key"
          actions={<CopyButton text={values.join('\n')} label="Copy all" />}
        >
          <ul className="divide-y divide-line">
            {values.map((v, i) => (
              <li key={`${v}-${i}`} className="flex items-center gap-2 py-1">
                <span className="min-w-0 flex-1 break-all font-mono text-xs">{v}</span>
                <CopyButton text={v} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Regex() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState('');
  const result = useMemo(
    () => (pattern ? testRegex(pattern, flags, text) : null),
    [pattern, flags, text],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          aria-label="Pattern"
          className="font-mono text-xs"
          placeholder="Regular expression, e.g. (?<id>\d+)"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
        />
        <Input
          aria-label="Flags"
          className="!w-20 font-mono text-xs"
          placeholder="flags"
          value={flags}
          onChange={(e) => setFlags(e.target.value)}
        />
      </div>
      <TextArea
        label="Sample text"
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-[11px] text-muted">
        JavaScript regular expressions. Very complex patterns can be slow; the sample is limited to
        100,000 characters.
      </p>
      {!result && (
        <EmptyState icon="search">Enter a pattern and sample text to see matches.</EmptyState>
      )}
      {result && !result.ok && <ErrorMessage error={result.error} />}
      {result?.ok && (
        <Card
          title={`${result.value.matches.length}${result.value.truncated ? '+' : ''} match${
            result.value.matches.length === 1 ? '' : 'es'
          }`}
          icon="search"
        >
          {result.value.matches.length === 0 ? (
            <p className="text-muted">No matches.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {result.value.matches.map((m, i) => (
                <li key={i} className="rounded-lg bg-surface2/60 px-2 py-1 font-mono text-xs">
                  <span className="text-muted">@{m.index}</span>{' '}
                  <span className="rounded bg-warn/20 px-1">{m.text || '(empty)'}</span>
                  {m.groups.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-muted">
                      {m.groups.map((g, gi) => (
                        <span key={gi} className="mr-2">
                          ${gi + 1}={g === undefined ? 'undefined' : JSON.stringify(g)}
                        </span>
                      ))}
                      {Object.entries(m.named).map(([k, v]) => (
                        <span key={k} className="mr-2 text-accent">
                          {k}={JSON.stringify(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function StatusCodes() {
  const [q, setQ] = useState('');
  const list = useMemo(() => searchStatusCodes(q), [q]);
  const tone = (c: number) =>
    c < 300 ? 'text-good' : c < 400 ? 'text-accent' : c < 500 ? 'text-warn' : 'text-bad';
  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        aria-label="Search status codes"
        placeholder="Search: 404, teapot, 5xx, rate limit..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {list.length === 0 ? (
        <EmptyState icon="search">No status code matches your search.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((s) => (
            <li key={s.code} className="card flex items-start gap-3 px-3 py-1.5">
              <span className={`w-10 shrink-0 font-mono text-sm font-bold ${tone(s.code)}`}>
                {s.code}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold">{s.name}</span>
                <span className="block text-xs text-muted">{s.meaning}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const SUB_TABS = [
  { id: 'base64', label: 'Base64' },
  { id: 'url', label: 'URL' },
  { id: 'query', label: 'Query' },
  { id: 'timestamp', label: 'Time' },
  { id: 'uuid', label: 'UUID' },
  { id: 'generate', label: 'Generate' },
  { id: 'hash', label: 'Hash' },
  { id: 'regex', label: 'Regex' },
  { id: 'codes', label: 'Status codes' },
];

export function Tools({ seed, sub: initialSub }: ToolProps) {
  const [sub, setSub] = useState(
    SUB_TABS.some((t) => t.id === initialSub) ? (initialSub as string) : 'base64',
  );
  return (
    <div className="flex flex-col gap-3">
      <Tabs tabs={SUB_TABS} active={sub} onChange={setSub} label="Developer tools" size="sm" />
      <div role="tabpanel" id={`panel-${sub}`} aria-labelledby={`tab-${sub}`}>
        {sub === 'base64' && (
          <Transform
            key="b64"
            title="Base64"
            encodeLabel="Encode"
            decodeLabel="Decode"
            encode={(s) => ok(utf8ToBase64(s))}
            decode={base64ToUtf8}
            initial={initialSub === 'base64' ? seed : ''}
          />
        )}
        {sub === 'url' && (
          <Transform
            key="url"
            title="URL"
            encodeLabel="Encode URI Component"
            decodeLabel="Decode URI Component"
            encode={(s) => ok(urlEncode(s))}
            decode={urlDecode}
            initial={initialSub === 'url' ? seed : ''}
          />
        )}
        {sub === 'query' && <QueryString initial={initialSub === 'query' ? seed : ''} />}
        {sub === 'timestamp' && <Timestamp initial={initialSub === 'timestamp' ? seed : ''} />}
        {sub === 'uuid' && <Uuid initial={initialSub === 'uuid' ? seed : ''} />}
        {sub === 'generate' && <Generate />}
        {sub === 'hash' && <Hash />}
        {sub === 'regex' && <Regex />}
        {sub === 'codes' && <StatusCodes />}
      </div>
    </div>
  );
}
