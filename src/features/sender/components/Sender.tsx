import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState, ErrorMessage } from '@/components/ErrorMessage';
import { Guide } from '@/components/Guide';
import { Icon } from '@/components/Icon';
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
import { CollectionsPane } from './CollectionsPane';
import { discoverUrls, type DiscoveredUrl } from '../utils/discover';
import { sendRequest, type SentResponse } from '../utils/network';
import { detectSignals, PAYLOAD_SETS } from '../utils/payloads';
import { analyzeRateResults, runBatch, type RateRow } from '../utils/rateLimit';
import { fuzzToMarkdown, securityHeadersToMarkdown } from '../utils/reportMarkdown';
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

export const isDestructiveMethod = (m: HttpMethod) => m === 'DELETE';

export function RequestForm({
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

export function DestructiveWarning({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/5 p-2.5 text-xs">
      <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-bad" />
      <span>{children}</span>
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

const SEND_GUIDE = {
  en: {
    what: 'Builds one HTTP request and sends it for real, straight from your browser, to the system you specify — then shows the actual status, headers, timing and body.',
    steps: [
      'Pick a method, enter the URL, add headers and (for non-GET methods) a body.',
      'Press Send or Ctrl/Cmd+Enter.',
      'Read the response: status badge, timing, headers (expand to see all), and body (copyable).',
    ],
    example:
      'Method: GET, URL: https://api.example.com/health\n→ 200 OK in 180ms, body: {"status":"ok"}',
    useCase:
      'Manually trying a single endpoint with custom headers (e.g. a bearer token) before wiring it into real code, or reproducing a bug report with an exact request.',
  },
  fa: {
    what: 'یک درخواست HTTP می‌سازد و واقعاً، مستقیم از مرورگر شما، به سامانه‌ای که مشخص کردید می‌فرستد — سپس status، هدرها، زمان و بدنه‌ی واقعی پاسخ را نشان می‌دهد.',
    steps: [
      'یک متد انتخاب کنید، URL را وارد کنید، هدر و (برای متدهای غیر GET) بدنه اضافه کنید.',
      'Send یا Ctrl/Cmd+Enter را بزنید.',
      'پاسخ را ببینید: نشان وضعیت، زمان، هدرها (برای دیدن همه باز کنید)، و بدنه (قابل کپی).',
    ],
    example:
      'متد: GET، URL: https://api.example.com/health\n→ 200 OK در ۱۸۰ میلی‌ثانیه، بدنه: {"status":"ok"}',
    useCase:
      'امتحان دستی یک اندپوینت با هدرهای سفارشی (مثل توکن bearer) پیش از نوشتن کد واقعی، یا بازتولید دقیق یک درخواست از روی یک گزارش باگ.',
  },
};

function SendPane() {
  const [method, setMethodRaw] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<HttpHeader[]>([{ name: '', value: '' }]);
  const [body, setBody] = useState('');
  const [res, setRes] = useState<SentResponse | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [sending, setSending] = useState(false);
  const [destructiveAck, setDestructiveAck] = useState(false);

  const setMethod = (m: HttpMethod) => {
    setMethodRaw(m);
    if (!isDestructiveMethod(m)) setDestructiveAck(false);
  };

  const destructive = isDestructiveMethod(method);

  const send = async () => {
    if (!url.trim()) {
      setError({ title: 'Missing URL', message: 'Enter a URL to send.' });
      return;
    }
    if (destructive && !destructiveAck) {
      setError({
        title: 'Confirm deletion',
        message: 'Check the box above to confirm you intend to send this DELETE request.',
      });
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
      <Guide en={SEND_GUIDE.en} fa={SEND_GUIDE.fa} />
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
      {destructive && (
        <DestructiveWarning>
          <span className="font-semibold">DELETE requests are usually permanent.</span> If this API
          performs a real deletion, there is no undo from inside DevLens.
          <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 font-normal">
            <input
              type="checkbox"
              className="accent-[rgb(var(--bad))]"
              checked={destructiveAck}
              onChange={(e) => setDestructiveAck(e.target.checked)}
            />
            I mean to delete this resource.
          </label>
        </DestructiveWarning>
      )}
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          icon="send"
          onClick={() => void send()}
          disabled={sending || (destructive && !destructiveAck)}
        >
          {sending ? 'Sending…' : destructive ? 'Send DELETE' : 'Send'}
        </Button>
        <kbd className="ml-auto rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
          Ctrl/Cmd + Enter
        </kbd>
      </div>
      <ResponseCard res={res} error={error} />
    </div>
  );
}

const FUZZ_GUIDE = {
  en: {
    what: `Sends one real request per value, substituting it wherever you put the ${FUZZ_MARKER} marker (URL, a header, or the body). Values come from a wordlist, a number range, or a built-in attack preset (SQL injection, XSS, path traversal, command injection, SSRF, NoSQL injection). Responses are grouped by (status, body length) so the common "nothing here" response is greyed out, and scanned for known vulnerability signals (DB errors, stack traces, reflected payloads, …) which are flagged.`,
    steps: [
      `Build the request and put ${FUZZ_MARKER} where the value should go, e.g. a URL path segment or an id.`,
      'Pick a value source: a wordlist (one value per line), a numeric range, or an attack preset.',
      'Set concurrency (how many requests run at once) and press Start.',
      'Rows highlighted in red have a flag — read it, then open that exact request in Send to confirm manually.',
    ],
    example: `URL: https://api.example.com/users/${FUZZ_MARKER}, preset: SQL injection\n→ one request per payload; a flagged row might read "DB error: MySQL syntax error" — a strong sign of SQL injection.`,
    useCase:
      'Checking whether an endpoint is vulnerable to injection, finding which numeric IDs exist (IDOR), or testing many input values quickly without writing a script.',
  },
  fa: {
    what: `به‌ازای هر مقدار یک درخواست واقعی می‌فرستد و آن را هرجا که نشانه‌ی ${FUZZ_MARKER} گذاشته باشید جایگزین می‌کند (URL، یک هدر، یا بدنه). مقادیر از یک wordlist، یک رنج عددی، یا یک preset حمله‌ی آماده (SQL injection، XSS، path traversal، command injection، SSRF، NoSQL injection) می‌آیند. پاسخ‌ها بر اساس (status، طول بدنه) گروه‌بندی می‌شوند تا پاسخ معمول «اینجا چیزی نیست» خاکستری شود، و برای نشانه‌های شناخته‌شده‌ی آسیب‌پذیری (خطای دیتابیس، stack trace، payload بازتاب‌شده، …) اسکن و پرچم‌گذاری می‌شوند.`,
    steps: [
      `درخواست را بسازید و ${FUZZ_MARKER} را جایی که مقدار باید برود بگذارید، مثلاً یک قسمت از مسیر URL یا یک id.`,
      'یک منبع مقدار انتخاب کنید: wordlist (هر خط یک مقدار)، رنج عددی، یا یک preset حمله.',
      'concurrency (تعداد درخواست‌های هم‌زمان) را تنظیم کنید و Start را بزنید.',
      'ردیف‌های قرمز یک پرچم دارند — آن را بخوانید، سپس همان درخواست دقیق را در Send باز کنید تا دستی تأیید کنید.',
    ],
    example: `URL: https://api.example.com/users/${FUZZ_MARKER}، preset: SQL injection\n→ به‌ازای هر payload یک درخواست؛ یک ردیف پرچم‌خورده ممکن است بنویسد «DB error: MySQL syntax error» — نشانه‌ی قوی SQL injection.`,
    useCase:
      'بررسی اینکه آیا یک اندپوینت در برابر injection آسیب‌پذیر است، پیدا کردن اینکه کدام idهای عددی وجود دارند (IDOR)، یا تست سریع مقادیر زیاد بدون نوشتن اسکریپت.',
  },
};

function FuzzPane({ seedUrl }: { seedUrl?: string }) {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState(seedUrl ?? '');
  const [headers, setHeaders] = useState<HttpHeader[]>([{ name: '', value: '' }]);
  const [body, setBody] = useState('');
  const [source, setSource] = useState<'list' | 'range' | 'preset'>('list');
  const [wordlist, setWordlist] = useState('');
  const [rangeStart, setRangeStart] = useState('1');
  const [rangeEnd, setRangeEnd] = useState('20');
  const [presetId, setPresetId] = useState(PAYLOAD_SETS[0].id);
  const [concurrency, setConcurrency] = useState(3);
  const [rows, setRows] = useState<FuzzRow[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [running, setRunning] = useState(false);
  const [destructiveAck, setDestructiveAck] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const setMethodChecked = (m: HttpMethod) => {
    setMethod(m);
    if (!isDestructiveMethod(m)) setDestructiveAck(false);
  };
  const destructive = isDestructiveMethod(method);

  const spec: HttpRequestSpec = { method, url, headers, body };
  const markers = countMarkers(spec);
  const preset = PAYLOAD_SETS.find((p) => p.id === presetId) ?? PAYLOAD_SETS[0];
  const values =
    source === 'list'
      ? parseWordlist(wordlist)
      : source === 'range'
        ? numericRange(Number(rangeStart), Number(rangeEnd))
        : preset.values;

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
    if (destructive && !destructiveAck) {
      setError({
        title: 'Confirm deletion',
        message: 'Check the box above to confirm you intend to send these DELETE requests.',
      });
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
              flags: detectSignals(values[i], r.value.bodyText, r.value.headers).map(
                (s) => s.label,
              ),
            } satisfies FuzzRow)
          : ({
              value: values[i],
              status: 0,
              ok: false,
              timeMs,
              bodyLength: 0,
              error: r.error.message,
              baseline: false,
              flags: [],
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
      <Guide en={FUZZ_GUIDE.en} fa={FUZZ_GUIDE.fa} />
      <RequestForm
        method={method}
        setMethod={setMethodChecked}
        url={url}
        setUrl={setUrl}
        headers={headers}
        setHeaders={setHeaders}
        body={body}
        setBody={setBody}
        urlPlaceholder={`https://api.example.com/users/${FUZZ_MARKER}`}
      />
      {destructive && (
        <DestructiveWarning>
          <span className="font-semibold">DELETE requests are usually permanent.</span> This will
          send up to {values.length} real DELETE request{values.length === 1 ? '' : 's'} — commonly
          used to test whether an endpoint deletes resources it shouldn't (IDOR). If the target
          actually deletes data, there is no undo from inside DevLens.
          <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 font-normal">
            <input
              type="checkbox"
              className="accent-[rgb(var(--bad))]"
              checked={destructiveAck}
              onChange={(e) => setDestructiveAck(e.target.checked)}
            />
            I mean to send these DELETE requests.
          </label>
        </DestructiveWarning>
      )}
      <Tabs
        tabs={[
          { id: 'list', label: 'Wordlist' },
          { id: 'range', label: 'Number range' },
          { id: 'preset', label: 'Attack preset' },
        ]}
        active={source}
        onChange={(v) => setSource(v as 'list' | 'range' | 'preset')}
        label="Value source"
        size="sm"
      />
      {source === 'list' && (
        <TextArea
          label="Values (one per line)"
          rows={4}
          value={wordlist}
          onChange={(e) => setWordlist(e.target.value)}
          placeholder={'1\n2\nadmin'}
        />
      )}
      {source === 'range' && (
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
      {source === 'preset' && (
        <div className="flex flex-col gap-1.5">
          <select
            aria-label="Attack preset"
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="field font-semibold"
          >
            {PAYLOAD_SETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label} ({p.values.length})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted">{preset.hint}</p>
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
          disabled={running || (destructive && !destructiveAck)}
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
            <div className="flex gap-2">
              <CopyButton
                text={rows
                  .map(
                    (r) =>
                      `${r.value}\t${r.status}\t${r.bodyLength}\t${r.timeMs}ms${r.baseline ? '\tbaseline' : ''}${r.flags.length ? `\t${r.flags.join('; ')}` : ''}`,
                  )
                  .join('\n')}
                label="Copy CSV"
              />
              <CopyButton text={fuzzToMarkdown(rows, FUZZ_MARKER, url)} label="Copy report" />
            </div>
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
                  <th className="py-1 pr-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={i}
                    className={`border-t border-line ${r.flags.length > 0 ? 'bg-bad/10' : r.baseline ? 'text-muted' : 'font-semibold'}`}
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
                    <td className="py-1 pr-2 text-bad">{r.flags.join(', ')}</td>
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

const RATE_LIMIT_GUIDE = {
  en: {
    what: 'Sends a burst of identical requests and measures when (if ever) the server starts throttling them — the first 429, any Retry-After header, and median/p95 latency. This is a small, bounded burst to find a threshold, not a flood — DevLens has no DDoS capability.',
    steps: [
      'Build the request you want to test (e.g. a login endpoint).',
      'Set how many requests to send and the concurrency (how many run at once).',
      'Press Start and watch the colour grid: green = ok, amber = 429, red = 5xx/failed.',
      'Check the summary for the first throttled request number and its Retry-After value.',
    ],
    example:
      '50 requests at concurrency 5 to /api/login\n→ first 429 at request #31, Retry-After: 60 — the endpoint allows ~30 requests before throttling.',
    useCase:
      'Confirming your rate limiter actually kicks in (and at what point), or checking how an endpoint behaves under light concurrent load before you ship it.',
  },
  fa: {
    what: 'یک موج از درخواست‌های یکسان می‌فرستد و اندازه می‌گیرد سرور از کجا (اگر اصلاً) شروع به محدود کردن می‌کند — اولین 429، هر هدر Retry-After، و تأخیر median/p95. این یک موج کوچک و محدود برای پیدا کردن آستانه است، نه یک سیل — DevLens هیچ قابلیت DDoS ندارد.',
    steps: [
      'درخواستی که می‌خواهید تست کنید بسازید (مثلاً یک اندپوینت لاگین).',
      'تعداد درخواست‌ها و concurrency (تعداد هم‌زمان) را تنظیم کنید.',
      'Start را بزنید و شبکه‌ی رنگی را ببینید: سبز = موفق، نارنجی = 429، قرمز = 5xx/شکست‌خورده.',
      'در خلاصه، شماره‌ی اولین درخواست محدودشده و مقدار Retry-After آن را ببینید.',
    ],
    example:
      '۵۰ درخواست با concurrency ۵ به /api/login\n→ اولین 429 در درخواست شماره‌ی ۳۱، Retry-After: ۶۰ — این اندپوینت حدود ۳۰ درخواست را پیش از محدودیت قبول می‌کند.',
    useCase:
      'اطمینان از اینکه rate limiter شما واقعاً فعال می‌شود (و از کجا)، یا بررسی رفتار یک اندپوینت زیر بار هم‌زمان سبک پیش از انتشار.',
  },
};

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
  const [destructiveAck, setDestructiveAck] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const setMethodChecked = (m: HttpMethod) => {
    setMethod(m);
    if (!isDestructiveMethod(m)) setDestructiveAck(false);
  };
  const destructive = isDestructiveMethod(method);

  const run = async () => {
    if (!url.trim()) {
      setError({ title: 'Missing URL', message: 'Enter a URL to test.' });
      return;
    }
    if (destructive && !destructiveAck) {
      setError({
        title: 'Confirm deletion',
        message: 'Check the box above to confirm you intend to send these DELETE requests.',
      });
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
      <Guide en={RATE_LIMIT_GUIDE.en} fa={RATE_LIMIT_GUIDE.fa} />
      <RequestForm
        method={method}
        setMethod={setMethodChecked}
        url={url}
        setUrl={setUrl}
        headers={headers}
        setHeaders={setHeaders}
        body={body}
        setBody={setBody}
        urlPlaceholder="https://api.example.com/login"
      />
      {destructive && (
        <DestructiveWarning>
          <span className="font-semibold">DELETE requests are usually permanent.</span> This will
          send repeated real DELETE requests to the same URL. If the target actually deletes data,
          there is no undo from inside DevLens.
          <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 font-normal">
            <input
              type="checkbox"
              className="accent-[rgb(var(--bad))]"
              checked={destructiveAck}
              onChange={(e) => setDestructiveAck(e.target.checked)}
            />
            I mean to send these DELETE requests.
          </label>
        </DestructiveWarning>
      )}
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
          disabled={running || (destructive && !destructiveAck)}
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

const SECURITY_HEADERS_GUIDE = {
  en: {
    what: 'Sends one request and audits its response headers the way securityheaders.com does: CSP, HSTS, X-Frame-Options, Referrer-Policy, cookie flags (Secure/HttpOnly/SameSite), a dangerous CORS wildcard + credentials combo, and more — entirely from headers you already received.',
    steps: [
      'Build the request (usually just a GET to your page or API root) and press "Check headers".',
      'Read the findings, grouped by severity (good / info / warn / bad).',
      'Copy the Markdown report to attach to a ticket or PR.',
    ],
    example:
      'GET https://example.com/\n→ "bad: Missing Strict-Transport-Security" — the site doesn’t force HTTPS on repeat visits.',
    useCase:
      'A pre-release security checklist, or confirming a header you just added (e.g. CSP) actually shows up in the real response.',
  },
  fa: {
    what: 'یک درخواست می‌فرستد و هدرهای پاسخ آن را مثل securityheaders.com ممیزی می‌کند: CSP، HSTS، X-Frame-Options، Referrer-Policy، فلگ‌های کوکی (Secure/HttpOnly/SameSite)، ترکیب خطرناک CORS wildcard + credentials، و موارد دیگر — کاملاً از روی هدرهایی که همین الان دریافت کردید.',
    steps: [
      'درخواست را بسازید (معمولاً فقط یک GET به صفحه یا ریشه‌ی API) و «Check headers» را بزنید.',
      'یافته‌ها را بخوانید، گروه‌بندی‌شده بر اساس شدت (good / info / warn / bad).',
      'گزارش Markdown را کپی کنید تا به یک تیکت یا PR ضمیمه کنید.',
    ],
    example:
      'GET https://example.com/\n→ «bad: Missing Strict-Transport-Security» — سایت در بازدیدهای بعدی HTTPS را اجباری نمی‌کند.',
    useCase:
      'یک چک‌لیست امنیتی پیش از انتشار، یا اطمینان از اینکه هدری که الان اضافه کردید (مثل CSP) واقعاً در پاسخ واقعی دیده می‌شود.',
  },
};

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
      <Guide en={SECURITY_HEADERS_GUIDE.en} fa={SECURITY_HEADERS_GUIDE.fa} />
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
        <Card
          title={`Findings for ${checkedUrl}`}
          icon="shield"
          actions={
            <CopyButton
              text={securityHeadersToMarkdown(checkedUrl, findings)}
              label="Copy report"
            />
          }
        >
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

const SOURCE_LABEL: Record<DiscoveredUrl['source'], string> = {
  page: 'page',
  sitemap: 'sitemap.xml',
  robots: 'robots.txt',
};

const DISCOVER_GUIDE = {
  en: {
    what: 'Crawls same-origin links starting from one URL — links found on pages, sitemap.xml, and robots.txt — up to a depth and page-count limit. Nothing is tested automatically; you review the list and pick which URLs to send to Fuzz.',
    steps: [
      'Enter a full start URL (with https://), set a crawl depth and a max-pages limit.',
      'Press Discover and wait for the list to fill in, each row tagged by where it was found.',
      'Click "Test in Fuzz" on any URL to open it there with {{FUZZ}} ready to place.',
    ],
    example:
      'Start: https://example.com/, depth 2\n→ finds /about, /api/docs (from a page link), /admin (from robots.txt) — you decide which, if any, to test further.',
    useCase:
      'Mapping out an application’s pages/endpoints before deciding what to test, especially ones not linked from the obvious entry points (found via sitemap.xml or robots.txt instead).',
  },
  fa: {
    what: 'لینک‌های هم‌دامنه را از یک URL شروع می‌کند و کراول می‌کند — لینک‌های پیدا شده روی صفحات، sitemap.xml، و robots.txt — تا یک حد عمق و تعداد صفحه‌ی مشخص. هیچ‌چیز خودکار تست نمی‌شود؛ شما لیست را بازبینی می‌کنید و تصمیم می‌گیرید کدام URLها به Fuzz فرستاده شوند.',
    steps: [
      'یک URL شروع کامل (با https://) وارد کنید، عمق کراول و حداکثر تعداد صفحه را تنظیم کنید.',
      'Discover را بزنید و منتظر پر شدن لیست بمانید، هر ردیف با منبعی که پیدا شده برچسب‌گذاری شده.',
      'روی «Test in Fuzz» برای هر URL کلیک کنید تا آن را آنجا با {{FUZZ}} آماده باز کند.',
    ],
    example:
      'شروع: https://example.com/، عمق ۲\n→ /about، /api/docs (از یک لینک صفحه)، /admin (از robots.txt) پیدا می‌شود — شما تصمیم می‌گیرید کدام‌ها، اگر اصلاً، بیشتر تست شوند.',
    useCase:
      'نقشه‌برداری از صفحات/اندپوینت‌های یک اپلیکیشن پیش از تصمیم‌گیری درباره‌ی چیزی که باید تست شود، مخصوصاً آن‌هایی که از نقاط ورود واضح لینک نشده‌اند (و از sitemap.xml یا robots.txt پیدا شده‌اند).',
  },
};

function DiscoverPane({ onTestInFuzz }: { onTestInFuzz: (url: string) => void }) {
  const [start, setStart] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [maxPages, setMaxPages] = useState(50);
  const [urls, setUrls] = useState<DiscoveredUrl[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    let base: URL;
    try {
      base = new URL(start);
    } catch {
      setError({
        title: 'Invalid URL',
        message: 'Enter a full URL, including the scheme (https://…).',
      });
      return;
    }
    setError(null);
    setUrls(null);
    setRunning(true);
    const fetchText = async (u: string): Promise<string | null> => {
      const r = await sendRequest({ method: 'GET', url: u, headers: [], body: '' });
      return r.ok && r.value.status < 400 ? r.value.bodyText : null;
    };
    const found = await discoverUrls(
      base.href,
      Math.max(0, Math.min(5, maxDepth)),
      Math.max(1, Math.min(200, maxPages)),
      fetchText,
    );
    setUrls(found);
    setRunning(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <Guide en={DISCOVER_GUIDE.en} fa={DISCOVER_GUIDE.fa} />
      <Input
        aria-label="Start URL"
        placeholder="https://api.example.com/"
        value={start}
        onChange={(e) => setStart(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Depth
          <Input
            aria-label="Crawl depth"
            type="number"
            min={0}
            max={5}
            value={maxDepth}
            onChange={(e) => setMaxDepth(Number(e.target.value))}
            className="!w-16"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Max pages
          <Input
            aria-label="Max pages"
            type="number"
            min={1}
            max={200}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            className="!w-20"
          />
        </label>
        <Button
          variant="primary"
          icon="search"
          onClick={() => void run()}
          disabled={running}
          className="ml-auto"
        >
          {running ? 'Discovering…' : 'Discover'}
        </Button>
      </div>
      {error && <ErrorMessage error={error} />}
      {!urls && !running && (
        <EmptyState icon="search">
          Enter a URL and press Discover to find its other pages.
        </EmptyState>
      )}
      {urls && (
        <Card
          title={`${urls.length} URL${urls.length === 1 ? '' : 's'} found`}
          icon="search"
          actions={<CopyButton text={urls.map((u) => u.url).join('\n')} label="Copy all" />}
        >
          <div className="max-h-96 overflow-auto">
            <ul className="flex flex-col gap-1">
              {urls.map((u, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface2/50 px-2 py-1"
                >
                  <span className="shrink-0 rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {SOURCE_LABEL[u.source]}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs" title={u.url}>
                    {u.url}
                  </span>
                  <Button className="!px-2 !py-0.5 text-xs" onClick={() => onTestInFuzz(u.url)}>
                    Test in Fuzz
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          {urls.length >= Math.min(maxPages, 200) && (
            <p className="mt-2 text-[11px] text-muted">
              Stopped at the page limit; raise it to find more.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

const SUB_TABS = [
  { id: 'send', label: 'Send', icon: 'send' as const },
  { id: 'fuzz', label: 'Fuzz', icon: 'sparkles' as const },
  { id: 'rate', label: 'Rate limit', icon: 'clock' as const },
  { id: 'headers', label: 'Security headers', icon: 'shield' as const },
  { id: 'discover', label: 'Discover', icon: 'search' as const },
  { id: 'collections', label: 'Collections', icon: 'folder' as const },
];

const SENDER_GUIDE = {
  en: {
    what: 'The only tool that sends real network requests — for APIs and systems you own or are explicitly authorized to test. It has six parts: Send (one request), Fuzz (one request per value, with built-in SQLi/XSS/path-traversal/SSRF/NoSQLi probes), Rate limit (a burst to find the throttling point — not a DDoS tool), Security headers (CSP/HSTS/cookie/CORS audit), Discover (find same-origin links to review before testing), and Collections (save requests with assertions and run them together).',
    steps: [
      'Accept the one-time authorization notice — only point Sender at systems you’re allowed to test.',
      'Send: build a request and see the real response.',
      'Fuzz: put {{FUZZ}} in the URL/header/body and try a wordlist, number range, or an attack preset; flagged rows show a likely vulnerability signal.',
      'Rate limit: send a burst of identical requests to see when the server starts throttling (429, Retry-After).',
      'Security headers: send one request and get a CSP/HSTS/cookie/CORS audit like securityheaders.com.',
      'Discover: crawl same-origin links from a start URL, then pick which ones to send to Fuzz.',
      'Collections: save a set of requests with assertions (status/header/body/JSON-path/time), pick an environment for {{var}} values, and run the whole set for a quick regression check.',
    ],
    example:
      'Fuzz: URL = https://api.example.com/users/{{FUZZ}}, preset = SQL injection\n→ sends one request per payload, flags any response with a SQL error message or an evaluated template expression.',
    useCase:
      'Checking your own API for an IDOR or missing input validation, finding where your rate limiter kicks in, auditing security headers before a release, or re-running a known-good set of requests as a smoke test after a deploy.',
  },
  fa: {
    what: 'تنها ابزاری که درخواست واقعی شبکه می‌فرستد — برای APIها و سامانه‌هایی که مالکشان هستید یا صریحاً مجاز به تست آن‌ها هستید. شش بخش دارد: Send (یک درخواست)، Fuzz (یک درخواست به‌ازای هر مقدار، با پروب‌های آماده SQLi/XSS/path-traversal/SSRF/NoSQLi)، Rate limit (یک موج درخواست برای پیدا کردن نقطه محدودیت — نه ابزار DDoS)، Security headers (ممیزی CSP/HSTS/کوکی/CORS)، Discover (پیدا کردن لینک‌های هم‌دامنه برای بازبینی پیش از تست) و Collections (ذخیره درخواست‌ها با assertion و اجرای همه با هم).',
    steps: [
      'اعلان تأیید یک‌باره را قبول کنید — Sender را فقط روی سامانه‌هایی اجرا کنید که مجاز به تست آن‌ها هستید.',
      'Send: یک درخواست بسازید و پاسخ واقعی را ببینید.',
      'Fuzz: {{FUZZ}} را در URL/هدر/بدنه بگذارید و یک wordlist، رنج عددی یا preset حمله را امتحان کنید؛ ردیف‌های پرچم‌خورده احتمالاً یک نشانه آسیب‌پذیری دارند.',
      'Rate limit: یک موج درخواست‌های یکسان بفرستید تا ببینید سرور از کجا محدودیت اعمال می‌کند (429، Retry-After).',
      'Security headers: یک درخواست بفرستید و یک ممیزی CSP/HSTS/کوکی/CORS مثل securityheaders.com بگیرید.',
      'Discover: لینک‌های هم‌دامنه را از یک URL شروع کراول کنید، سپس انتخاب کنید کدام‌ها به Fuzz فرستاده شوند.',
      'Collections: مجموعه‌ای از درخواست‌ها را با assertion (status/header/body/JSON-path/زمان) ذخیره کنید، یک environment برای مقادیر {{var}} انتخاب کنید و کل مجموعه را برای یک چک سریع رگرسیون اجرا کنید.',
    ],
    example:
      'Fuzz: URL = https://api.example.com/users/{{FUZZ}}، preset = SQL injection\n→ به‌ازای هر payload یک درخواست می‌فرستد و هر پاسخی که پیام خطای SQL یا یک عبارت template ارزیابی‌شده داشته باشد را پرچم می‌زند.',
    useCase:
      'بررسی API خودتان برای IDOR یا اعتبارسنجی ورودی ناقص، پیدا کردن جایی که rate limiter شما فعال می‌شود، ممیزی هدرهای امنیتی پیش از ریلیز، یا اجرای دوباره یک مجموعه درخواست سالم به‌عنوان smoke test بعد از دیپلوی.',
  },
};

export function Sender() {
  const [sub, setSub] = useState('send');
  const [fuzzSeed, setFuzzSeed] = useState<{ url: string; nonce: number } | undefined>(undefined);
  return (
    <AuthorizationGate>
      <div className="flex flex-col gap-3">
        <Guide en={SENDER_GUIDE.en} fa={SENDER_GUIDE.fa} />
        <Tabs tabs={SUB_TABS} active={sub} onChange={setSub} label="Sender tools" size="sm" />
        <div role="tabpanel" id={`panel-${sub}`} aria-labelledby={`tab-${sub}`}>
          {sub === 'send' && <SendPane />}
          {sub === 'fuzz' && <FuzzPane key={fuzzSeed?.nonce ?? 'plain'} seedUrl={fuzzSeed?.url} />}
          {sub === 'rate' && <RateLimitPane />}
          {sub === 'headers' && <SecurityHeadersPane />}
          {sub === 'discover' && (
            <DiscoverPane
              onTestInFuzz={(url) => {
                setFuzzSeed({ url, nonce: Date.now() });
                setSub('fuzz');
              }}
            />
          )}
          {sub === 'collections' && <CollectionsPane />}
        </div>
      </div>
    </AuthorizationGate>
  );
}
