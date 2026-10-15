import { useRef, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState, ErrorMessage } from '@/components/ErrorMessage';
import { Input } from '@/components/Input';
import { StatusBadge, type BadgeTone } from '@/components/StatusBadge';
import { Tabs } from '@/components/Tabs';
import { TextArea } from '@/components/TextArea';
import { useCtrlEnter } from '@/hooks/useCtrlEnter';
import {
  HTTP_METHODS,
  type HttpHeader,
  type HttpMethod,
  type HttpRequestSpec,
} from '@/features/http/types';
import type { AppError } from '@/types/result';
import { AuthorizationGate } from './AuthorizationGate';
import {
  countMarkers,
  FUZZ_MARKER,
  injectFuzzValue,
  markBaseline,
  numericRange,
  parseWordlist,
  type FuzzRow,
} from '../utils/fuzz';
import { sendRequest, type SentResponse } from '../utils/network';
import { analyzeRateResults, runBatch, type RateRow } from '../utils/rateLimit';
import {
  analyzeSecurityHeaders,
  summarize,
  type Finding,
  type Severity,
} from '../utils/securityHeaders';

const SEVERITY_TONE: Record<Severity, BadgeTone> = {
  good: 'good',
  info: 'info',
  warn: 'warn',
  bad: 'bad',
};
const METHOD_TONE: Record<HttpMethod, string> = {
  GET: 'text-good',
  POST: 'text-accent',
  PUT: 'text-warn',
  PATCH: 'text-accent2',
  DELETE: 'text-bad',
  HEAD: 'text-muted',
  OPTIONS: 'text-muted',
};
const statusTone = (s: number): BadgeTone =>
  s === 0 ? 'bad' : s >= 500 ? 'bad' : s >= 400 ? 'warn' : s >= 300 ? 'info' : 'good';

function RequestForm({
  method,
  setMethod,
  url,
  setUrl,
  headers,
  setHeaders,
  body,
  setBody,
  urlPlaceholder,
}: {
  method: HttpMethod;
  setMethod: (m: HttpMethod) => void;
  url: string;
  setUrl: (u: string) => void;
  headers: HttpHeader[];
  setHeaders: (h: HttpHeader[]) => void;
  body: string;
  setBody: (b: string) => void;
  urlPlaceholder: string;
}) {
  const update = (i: number, patch: Partial<HttpHeader>) =>
    setHeaders(headers.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <select
          aria-label="HTTP method"
          value={method}
          onChange={(e) => setMethod(e.target.value as HttpMethod)}
          className={`field w-28 shrink-0 font-mono font-bold ${METHOD_TONE[method]}`}
        >
          {HTTP_METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <Input
          aria-label="URL"
          placeholder={urlPlaceholder}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        {headers.map((h, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              aria-label={`Header ${i + 1} name`}
              placeholder="Name"
              value={h.name}
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <Input
              aria-label={`Header ${i + 1} value`}
              placeholder="Value"
              value={h.value}
              onChange={(e) => update(i, { value: e.target.value })}
            />
            <Button
              variant="ghost"
              aria-label={`Remove header ${i + 1}`}
              onClick={() => setHeaders(headers.filter((_, idx) => idx !== i))}
            >
              <span aria-hidden="true">✕</span>
            </Button>
          </div>
        ))}
        <div>
          <Button icon="plus" onClick={() => setHeaders([...headers, { name: '', value: '' }])}>
            Add header
          </Button>
        </div>
      </div>
      {method !== 'GET' && method !== 'HEAD' && (
        <TextArea
          label="Body"
          rows={4}
          placeholder="Request body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      )}
    </div>
  );
}

function ResponseCard({ res, error }: { res: SentResponse | null; error: AppError | null }) {
  if (error) return <ErrorMessage error={error} />;
  if (!res) return <EmptyState icon="send">Send a request to see the response here.</EmptyState>;
  return (
    <Card
      title="Response"
      icon="download"
      actions={<CopyButton text={res.bodyText} label="Copy body" disabled={!res.bodyText} />}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={statusTone(res.status)}>
            {`${res.status} ${res.statusText}`.trim()}
          </StatusBadge>
          <span className="text-xs text-muted">{res.timeMs} ms</span>
          {res.redirected && (
            <span className="text-xs text-muted">redirected to {res.finalUrl}</span>
          )}
        </div>
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-muted">
            {res.headers.length} response header{res.headers.length === 1 ? '' : 's'}
          </summary>
          <dl className="mt-2 divide-y divide-line">
            {res.headers.map((h, i) => (
              <div key={i} className="grid grid-cols-[minmax(110px,30%)_1fr] gap-2 py-1">
                <dt className="break-all font-mono text-xs font-semibold text-accent">{h.name}</dt>
                <dd className="break-all font-mono text-xs">{h.value}</dd>
              </div>
            ))}
          </dl>
        </details>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface2 p-2 font-mono text-xs">
          {res.bodyText || '(empty body)'}
        </pre>
        {res.bodyTruncated && (
          <p className="text-[11px] text-muted">Truncated to 2,000,000 characters.</p>
        )}
        <p className="text-[11px] text-muted">
          Set-Cookie headers are not shown: browsers hide them from JavaScript (including
          extensions) for security, even with host permission.
        </p>
      </div>
    </Card>
  );
}

function SendPane() {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<HttpHeader[]>([{ name: '', value: '' }]);
  const [body, setBody] = useState('');
  const [res, setRes] = useState<SentResponse | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!url.trim()) {
      setError({ title: 'Missing URL', message: 'Enter a URL to send.' });
      return;
    }
    setSending(true);
    const r = await sendRequest({ method, url, headers, body });
    setSending(false);
    if (r.ok) {
      setRes(r.value);
      setError(null);
    } else {
      setRes(null);
      setError(r.error);
    }
  };
  useCtrlEnter(() => void send());

  return (
    <div className="flex flex-col gap-3">
      <RequestForm
        method={method}
        setMethod={setMethod}
        url={url}
        setUrl={setUrl}
        headers={headers}
        setHeaders={setHeaders}
        body={body}
        setBody={setBody}
        urlPlaceholder="https://api.example.com/orders"
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" icon="send" onClick={() => void send()} disabled={sending}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
        <kbd className="ml-auto rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
          Ctrl/Cmd + Enter
        </kbd>
      </div>
      <ResponseCard res={res} error={error} />
    </div>
  );
}

function FuzzPane() {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<HttpHeader[]>([{ name: '', value: '' }]);
  const [body, setBody] = useState('');
  const [source, setSource] = useState<'list' | 'range'>('list');
  const [wordlist, setWordlist] = useState('');
  const [rangeStart, setRangeStart] = useState('1');
  const [rangeEnd, setRangeEnd] = useState('20');
  const [concurrency, setConcurrency] = useState(3);
  const [rows, setRows] = useState<FuzzRow[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const spec: HttpRequestSpec = { method, url, headers, body };
  const markers = countMarkers(spec);
  const values =
    source === 'list'
      ? parseWordlist(wordlist)
      : numericRange(Number(rangeStart), Number(rangeEnd));

  const run = async () => {
    if (markers === 0) {
      setError({
        title: `No ${FUZZ_MARKER} found`,
        message: `Put ${FUZZ_MARKER} in the URL, a header or the body where the value should go.`,
      });
      return;
    }
    if (values.length === 0) {
      setError({ title: 'No values', message: 'Add at least one value to try.' });
      return;
    }
    setError(null);
    setRows([]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const results: FuzzRow[] = [];
    for await (const row of runBatch(
      values.length,
      Math.max(1, Math.min(10, concurrency)),
      async (i) => {
        const started = performance.now();
        const r = await sendRequest(injectFuzzValue(spec, values[i]));
        const timeMs = Math.round(performance.now() - started);
        return r.ok
          ? ({
              value: values[i],
              status: r.value.status,
              ok: r.value.status < 400,
              timeMs,
              bodyLength: r.value.bodyText.length,
              baseline: false,
            } satisfies FuzzRow)
          : ({
              value: values[i],
              status: 0,
              ok: false,
              timeMs,
              bodyLength: 0,
              error: r.error.message,
              baseline: false,
            } satisfies FuzzRow);
      },
      controller.signal,
    )) {
      results.push(row);
      setRows(markBaseline([...results]));
    }
    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Put <code className="rounded bg-surface2 px-1 font-mono">{FUZZ_MARKER}</code> anywhere in
        the URL, a header or the body; DevLens sends one request per value, substituting it there.
      </p>
      <RequestForm
        method={method}
        setMethod={setMethod}
        url={url}
        setUrl={setUrl}
        headers={headers}
        setHeaders={setHeaders}
        body={body}
        setBody={setBody}
        urlPlaceholder={`https://api.example.com/users/${FUZZ_MARKER}`}
      />
      <Tabs
        tabs={[
          { id: 'list', label: 'Wordlist' },
          { id: 'range', label: 'Number range' },
        ]}
        active={source}
        onChange={(v) => setSource(v as 'list' | 'range')}
        label="Value source"
        size="sm"
      />
      {source === 'list' ? (
        <TextArea
          label="Values (one per line)"
          rows={4}
          value={wordlist}
          onChange={(e) => setWordlist(e.target.value)}
          placeholder={'1\n2\nadmin'}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Input
            aria-label="Range start"
            type="number"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            className="!w-24"
          />
          <span className="text-muted">to</span>
          <Input
            aria-label="Range end"
            type="number"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="!w-24"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Concurrency
          <Input
            aria-label="Concurrency"
            type="number"
            min={1}
            max={10}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="!w-16"
          />
        </label>
        <span className="text-xs text-muted">
          {values.length} value{values.length === 1 ? '' : 's'} queued
        </span>
        <Button
          variant="primary"
          icon="sparkles"
          onClick={() => void run()}
          disabled={running}
          className="ml-auto"
        >
          {running ? 'Running…' : 'Start'}
        </Button>
        {running && (
          <Button icon="x" onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        )}
      </div>
      {error && <ErrorMessage error={error} />}
      {rows.length > 0 && (
        <Card
          title={`Results (${rows.length}/${values.length})`}
          icon="search"
          actions={
            <CopyButton
              text={rows
                .map(
                  (r) =>
                    `${r.value}\t${r.status}\t${r.bodyLength}\t${r.timeMs}ms${r.baseline ? '\tbaseline' : ''}`,
                )
                .join('\n')}
              label="Copy CSV"
            />
          }
        >
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1 pr-2">Value</th>
                  <th className="py-1 pr-2">Status</th>
                  <th className="py-1 pr-2">Length</th>
                  <th className="py-1 pr-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-t border-line ${r.baseline ? 'text-muted' : 'font-semibold'}`}
                    title={r.error}
                  >
                    <td className="max-w-[160px] truncate py-1 pr-2 font-mono">{r.value}</td>
                    <td
                      className={`py-1 pr-2 font-mono ${r.status === 0 ? 'text-bad' : r.status >= 400 ? 'text-warn' : 'text-good'}`}
                    >
                      {r.status || 'err'}
                    </td>
                    <td className="py-1 pr-2 font-mono">{r.bodyLength}</td>
                    <td className="py-1 pr-2 font-mono">{r.timeMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Rows in grey share the most common status and body length (the likely "nothing here"
            response); different-looking rows are worth a closer look.
          </p>
        </Card>
      )}
    </div>
  );
}

function RateLimitPane() {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<HttpHeader[]>([{ name: '', value: '' }]);
  const [body, setBody] = useState('');
  const [count, setCount] = useState(20);
  const [concurrency, setConcurrency] = useState(5);
  const [rows, setRows] = useState<RateRow[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    if (!url.trim()) {
      setError({ title: 'Missing URL', message: 'Enter a URL to test.' });
      return;
    }
    setError(null);
    setRows([]);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const n = Math.max(1, Math.min(200, count));
    const results: RateRow[] = [];
    for await (const row of runBatch(
      n,
      Math.max(1, Math.min(20, concurrency)),
      async (i) => {
        const started = performance.now();
        const r = await sendRequest({ method, url, headers, body });
        const timeMs = Math.round(performance.now() - started);
        return r.ok
          ? ({
              index: i,
              status: r.value.status,
              ok: r.value.status < 400,
              timeMs,
              retryAfter: r.value.headers.find((h) => h.name.toLowerCase() === 'retry-after')
                ?.value,
            } satisfies RateRow)
          : ({ index: i, status: 0, ok: false, timeMs, error: r.error.message } satisfies RateRow);
      },
      controller.signal,
    )) {
      results.push(row);
      setRows([...results].sort((a, b) => a.index - b.index));
    }
    setRunning(false);
  };

  const stats = rows.length > 0 ? analyzeRateResults(rows) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Sends the same request repeatedly to see when (if ever) the server starts throttling it.
      </p>
      <RequestForm
        method={method}
        setMethod={setMethod}
        url={url}
        setUrl={setUrl}
        headers={headers}
        setHeaders={setHeaders}
        body={body}
        setBody={setBody}
        urlPlaceholder="https://api.example.com/login"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Requests
          <Input
            aria-label="Request count"
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="!w-20"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Concurrency
          <Input
            aria-label="Concurrency"
            type="number"
            min={1}
            max={20}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="!w-16"
          />
        </label>
        <Button
          variant="primary"
          icon="clock"
          onClick={() => void run()}
          disabled={running}
          className="ml-auto"
        >
          {running ? 'Running…' : 'Start'}
        </Button>
        {running && (
          <Button icon="x" onClick={() => abortRef.current?.abort()}>
            Stop
          </Button>
        )}
      </div>
      {error && <ErrorMessage error={error} />}
      {stats && (
        <Card title="Summary" icon="clock">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted">Succeeded</dt>
              <dd className="font-mono text-sm font-bold text-good">
                {stats.succeeded}/{stats.total}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted">Throttled (429)</dt>
              <dd className="font-mono text-sm font-bold">{stats.throttledCount}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted">Median</dt>
              <dd className="font-mono text-sm font-bold">{stats.medianMs} ms</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted">p95</dt>
              <dd className="font-mono text-sm font-bold">{stats.p95Ms} ms</dd>
            </div>
          </div>
          {stats.firstThrottledAt !== undefined && (
            <p className="mt-2 text-xs">
              First throttled response at request #{stats.firstThrottledAt + 1}
              {rows.find((r) => r.index === stats.firstThrottledAt)?.retryAfter &&
                ` — Retry-After: ${rows.find((r) => r.index === stats.firstThrottledAt)?.retryAfter}`}
            </p>
          )}
        </Card>
      )}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {rows.map((r) => (
            <span
              key={r.index}
              title={`#${r.index + 1}: ${r.status || 'error'} · ${r.timeMs} ms${r.error ? ` · ${r.error}` : ''}`}
              className={`h-5 w-5 rounded ${r.status === 429 ? 'bg-warn' : r.status === 0 || r.status >= 500 ? 'bg-bad' : r.status >= 400 ? 'bg-warn/60' : 'bg-good'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SecurityHeadersPane() {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<HttpHeader[]>([{ name: '', value: '' }]);
  const [body, setBody] = useState('');
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [checkedUrl, setCheckedUrl] = useState('');
  const [error, setError] = useState<AppError | null>(null);
  const [checking, setChecking] = useState(false);

  const check = async () => {
    if (!url.trim()) {
      setError({ title: 'Missing URL', message: 'Enter a URL to check.' });
      return;
    }
    setChecking(true);
    const r = await sendRequest({ method, url, headers, body });
    setChecking(false);
    if (r.ok) {
      setFindings(analyzeSecurityHeaders(url, r.value.headers));
      setCheckedUrl(url);
      setError(null);
    } else {
      setFindings(null);
      setError(r.error);
    }
  };

  const bySeverity = findings ? summarize(findings) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted">
        Sends a request and audits the response headers, the way securityheaders.com does.
      </p>
      <RequestForm
        method={method}
        setMethod={setMethod}
        url={url}
        setUrl={setUrl}
        headers={headers}
        setHeaders={setHeaders}
        body={body}
        setBody={setBody}
        urlPlaceholder="https://api.example.com/"
      />
      <div>
        <Button variant="primary" icon="shield" onClick={() => void check()} disabled={checking}>
          {checking ? 'Checking…' : 'Check headers'}
        </Button>
      </div>
      {error && <ErrorMessage error={error} />}
      {!findings && !error && (
        <EmptyState icon="shield">Send a request to audit its response headers.</EmptyState>
      )}
      {findings && bySeverity && (
        <Card title={`Findings for ${checkedUrl}`} icon="shield">
          <div className="mb-3 flex gap-2 text-xs">
            <span className="rounded-full bg-good/15 px-2 py-0.5 font-semibold text-good">
              {bySeverity.good} good
            </span>
            <span className="rounded-full bg-warn/15 px-2 py-0.5 font-semibold text-warn">
              {bySeverity.warn} warn
            </span>
            <span className="rounded-full bg-bad/15 px-2 py-0.5 font-semibold text-bad">
              {bySeverity.bad} bad
            </span>
            <span className="rounded-full bg-surface2 px-2 py-0.5 font-semibold text-muted">
              {bySeverity.info} info
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {findings.map((f) => (
              <li key={f.id} className="flex items-start gap-2 text-xs">
                <StatusBadge tone={SEVERITY_TONE[f.severity]}>{f.severity}</StatusBadge>
                <span>
                  <b className="font-semibold">{f.title}</b>
                  <span className="block text-muted">{f.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-[11px] text-muted">
        Set-Cookie flags cannot be audited here (hidden from JavaScript); use the Journey tab on a
        captured request instead, which reads them from the raw HAR.
      </p>
    </div>
  );
}

const SUB_TABS = [
  { id: 'send', label: 'Send', icon: 'send' as const },
  { id: 'fuzz', label: 'Fuzz', icon: 'sparkles' as const },
  { id: 'rate', label: 'Rate limit', icon: 'clock' as const },
  { id: 'headers', label: 'Security headers', icon: 'shield' as const },
];

export function Sender() {
  const [sub, setSub] = useState('send');
  return (
    <AuthorizationGate>
      <div className="flex flex-col gap-3">
        <Tabs tabs={SUB_TABS} active={sub} onChange={setSub} label="Sender tools" size="sm" />
        <div role="tabpanel" id={`panel-${sub}`} aria-labelledby={`tab-${sub}`}>
          {sub === 'send' && <SendPane />}
          {sub === 'fuzz' && <FuzzPane />}
          {sub === 'rate' && <RateLimitPane />}
          {sub === 'headers' && <SecurityHeadersPane />}
        </div>
      </div>
    </AuthorizationGate>
  );
}
