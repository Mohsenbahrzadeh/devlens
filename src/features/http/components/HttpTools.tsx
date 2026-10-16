import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { CodeBlock, type Language } from '@/components/CodeBlock';
import { ErrorMessage } from '@/components/ErrorMessage';
import { Guide } from '@/components/Guide';
import { Icon } from '@/components/Icon';
import { Input } from '@/components/Input';
import { Tabs } from '@/components/Tabs';
import { TextArea } from '@/components/TextArea';
import { maskForSharing } from '@/features/collections/redact';
import { SavedRequests } from '@/features/collections/SavedRequests';
import { useCtrlEnter } from '@/hooks/useCtrlEnter';
import { loadPrefs } from '@/lib/storage';
import type { AppError } from '@/types/result';
import { generateCSharp } from '../generators/csharp';
import { generateTypedCSharp } from '../generators/csharpClient';
import { generateCurl } from '../generators/curl';
import { generateFetch } from '../generators/fetch';
import { generateHttpFile } from '../generators/httpFile';
import { parseCurl } from '../generators/parseCurl';
import { generatePython } from '../generators/python';
import {
  HTTP_METHODS,
  type HttpHeader,
  type HttpMethod,
  type HttpRequestSpec,
  type MultipartField,
} from '../types';
import {
  buildRequest,
  emptyBodyState,
  type BodyMode,
  type BodyState,
  type KeyValue,
} from '../utils/bodyModes';
import { formatGraphQL } from '../utils/graphql';
import { operationToRequest, parseOpenApi, type OpenApiDoc } from '../utils/openapi';
import { parseRawHttp } from '../utils/rawHttp';

export type Target = 'curl' | 'csharp' | 'csharpTyped' | 'fetch' | 'python' | 'httpFile';
interface Section {
  title: string;
  lang: Language;
  code: string;
}

const TARGETS: Record<
  Target,
  { label: string; short: string; lang: Language; run: (r: HttpRequestSpec) => string }
> = {
  curl: { label: 'cURL', short: 'cURL', lang: 'bash', run: generateCurl },
  csharp: { label: 'C# (HttpClient)', short: 'C#', lang: 'csharp', run: generateCSharp },
  // Rendered by `generateTypedCSharp` (several sections); `run` is only a fallback.
  csharpTyped: {
    label: 'C# models + client',
    short: 'C# models',
    lang: 'csharp',
    run: generateCSharp,
  },
  fetch: {
    label: 'JavaScript (fetch)',
    short: 'JavaScript',
    lang: 'javascript',
    run: generateFetch,
  },
  python: { label: 'Python (requests)', short: 'Python', lang: 'python', run: generatePython },
  httpFile: { label: '.http file', short: '.http', lang: 'text', run: generateHttpFile },
};
export const TARGET_IDS = Object.keys(TARGETS) as Target[];
export const TARGET_LABELS = Object.fromEntries(
  TARGET_IDS.map((t) => [t, TARGETS[t].label]),
) as Record<Target, string>;

const METHOD_TONE: Record<HttpMethod, string> = {
  GET: 'text-good',
  POST: 'text-accent',
  PUT: 'text-warn',
  PATCH: 'text-accent2',
  DELETE: 'text-bad',
  HEAD: 'text-muted',
  OPTIONS: 'text-muted',
};

const BODY_TABS = [
  { id: 'raw', label: 'Raw' },
  { id: 'form', label: 'Form' },
  { id: 'multipart', label: 'Multipart' },
  { id: 'graphql', label: 'GraphQL' },
];
const IMPORT_TABS = [
  { id: 'curl', label: 'cURL' },
  { id: 'raw', label: 'Raw HTTP' },
  { id: 'openapi', label: 'OpenAPI' },
];

function Rows({
  label,
  rows,
  onChange,
  fileToggle,
}: {
  label: string;
  rows: (KeyValue & { file?: boolean })[];
  onChange: (rows: (KeyValue & { file?: boolean })[]) => void;
  fileToggle?: boolean;
}) {
  const update = (i: number, patch: Partial<KeyValue & { file?: boolean }>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1.5">
          <Input
            aria-label={`${label} ${i + 1} name`}
            placeholder="Name"
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <Input
            aria-label={`${label} ${i + 1} value`}
            placeholder={r.file ? 'File path, e.g. C:\\files\\a.png' : 'Value'}
            value={r.value}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          {fileToggle && (
            <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-muted">
              <input
                type="checkbox"
                className="accent-[rgb(var(--accent))]"
                checked={!!r.file}
                onChange={(e) => update(i, { file: e.target.checked })}
              />
              File
            </label>
          )}
          <Button
            variant="ghost"
            aria-label={`Remove ${label} ${i + 1}`}
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
          >
            <Icon name="x" size={14} />
          </Button>
        </div>
      ))}
      <div>
        <Button icon="plus" onClick={() => onChange([...rows, { name: '', value: '' }])}>
          Add {label.toLowerCase()}
        </Button>
      </div>
    </div>
  );
}

const HTTP_GUIDE = {
  en: {
    what: 'Builds a request (headers, raw/form/multipart/GraphQL body) and generates ready-to-paste code for it in cURL, C# (including typed models from a sample response), JavaScript fetch, Python requests, or a .http file — no network call is made here, this only generates text.',
    steps: [
      'Set the method, URL, headers and body (or import one from a cURL command, raw HTTP text, or an OpenAPI document).',
      'Optionally paste a sample JSON response so the C# generator can build typed request/response models.',
      'Click "Generate" for the language you need; turn on "Mask secrets" before pasting the result into a ticket or chat.',
    ],
    example:
      "URL: https://api.example.com/orders, Method: POST, Body: {\"id\":1}\n→ Generate cURL → curl -X POST 'https://api.example.com/orders' -H 'Content-Type: application/json' -d '{\"id\":1}'",
    useCase:
      'Turning a request you just tested into code for your app, generating a typed C# client straight from an API’s sample response, or converting a cURL command a teammate sent you into Python.',
  },
  fa: {
    what: 'یک درخواست (هدرها، بدنه raw/form/multipart/GraphQL) می‌سازد و کد آماده برای آن در cURL، C# (شامل مدل‌های تایپ‌شده از روی یک نمونه پاسخ)، JavaScript fetch، Python requests یا یک فایل .http تولید می‌کند — اینجا هیچ درخواستی واقعاً ارسال نمی‌شود، فقط کد تولید می‌شود.',
    steps: [
      'متد، URL، هدرها و بدنه را تنظیم کنید (یا از یک دستور cURL، متن خام HTTP یا یک سند OpenAPI وارد کنید).',
      'در صورت تمایل یک نمونه پاسخ JSON پیست کنید تا تولیدکننده C# مدل‌های تایپ‌شده درخواست/پاسخ بسازد.',
      'روی «Generate» برای زبان موردنظرتان بزنید؛ پیش از پیست کردن نتیجه در تیکت یا چت، «Mask secrets» را روشن کنید.',
    ],
    example:
      "URL: https://api.example.com/orders، متد: POST، بدنه: {\"id\":1}\n→ Generate cURL → curl -X POST 'https://api.example.com/orders' -H 'Content-Type: application/json' -d '{\"id\":1}'",
    useCase:
      'تبدیل درخواستی که الان تست کردید به کد برای اپلیکیشن‌تان، ساختن یک کلاینت تایپ‌شده C# مستقیم از روی نمونه پاسخ یک API، یا تبدیل یک دستور cURL که یک همکار فرستاده به Python.',
  },
};

export function HttpTools() {
  const [method, setMethod] = useState<HttpMethod>('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<HttpHeader[]>([{ name: '', value: '' }]);
  const [body, setBody] = useState<BodyState>(emptyBodyState);
  const [response, setResponse] = useState('');
  const [target, setTarget] = useState<Target>('curl');
  const [sections, setSections] = useState<Section[]>([]);
  const [error, setError] = useState<AppError | null>(null);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [mask, setMask] = useState(false);
  const outgoing = (s: HttpRequestSpec) => (mask ? maskForSharing(s) : s);

  useEffect(() => {
    void loadPrefs().then((p) => {
      if (p.defaultTarget && TARGET_IDS.includes(p.defaultTarget as Target)) {
        setTarget(p.defaultTarget as Target);
      }
      setSavedEnabled(p.savedEnabled === true);
    });
  }, []);

  const patchBody = (patch: Partial<BodyState>) => setBody((b) => ({ ...b, ...patch }));

  const spec = (): { ok: true; spec: HttpRequestSpec } | { ok: false; error: AppError } => {
    if (!url.trim())
      return {
        ok: false,
        error: { title: 'Missing URL', message: 'Enter a URL to generate code.' },
      };
    const r = buildRequest({ method, url, headers }, body);
    return r.ok ? { ok: true, spec: r.value } : { ok: false, error: r.error };
  };

  const generate = (t: Target = target) => {
    setTarget(t);
    const built = spec();
    if (!built.ok) {
      setSections([]);
      setError(built.error);
      return;
    }
    if (t === 'csharpTyped') {
      const r = generateTypedCSharp(outgoing(built.spec), response);
      if (!r.ok) {
        setSections([]);
        setError(r.error);
        return;
      }
      setError(null);
      setSections(r.value.map((s) => ({ title: s.title, lang: s.language, code: s.code })));
      return;
    }
    setError(null);
    setSections([
      {
        title: TARGETS[t].label,
        lang: TARGETS[t].lang,
        code: TARGETS[t].run(outgoing(built.spec)),
      },
    ]);
  };
  useCtrlEnter(() => generate());

  /* ---- importing ---- */
  const [importTab, setImportTab] = useState('curl');
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<AppError | null>(null);
  const [openApi, setOpenApi] = useState<OpenApiDoc | null>(null);
  const [server, setServer] = useState('');
  const [opFilter, setOpFilter] = useState('');

  const applySpec = (s: HttpRequestSpec) => {
    setMethod(s.method);
    setUrl(s.url);
    setHeaders(s.headers.length > 0 ? s.headers : [{ name: '', value: '' }]);
    setBody({ ...emptyBodyState, raw: s.body });
    setSections([]);
    setError(null);
  };

  const runImport = () => {
    setImportError(null);
    if (importTab === 'openapi') {
      const r = parseOpenApi(importText);
      if (!r.ok) {
        setImportError(r.error);
        setOpenApi(null);
        return;
      }
      setOpenApi(r.value);
      setServer(r.value.servers[0] ?? 'https://api.example.com');
      return;
    }
    const r = importTab === 'raw' ? parseRawHttp(importText) : parseCurl(importText);
    if (!r.ok) setImportError(r.error);
    else applySpec(r.value);
  };

  const filteredOps = useMemo(() => {
    if (!openApi) return [];
    const q = opFilter.trim().toLowerCase();
    return openApi.operations
      .filter((o) => !q || `${o.method} ${o.path} ${o.summary} ${o.tag}`.toLowerCase().includes(q))
      .slice(0, 60);
  }, [openApi, opFilter]);

  const updateHeader = (i: number, patch: Partial<HttpHeader>) =>
    setHeaders(headers.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));

  const [gqlError, setGqlError] = useState<AppError | null>(null);
  const prettyGql = () => {
    const r = formatGraphQL(body.gqlQuery);
    if (r.ok) {
      patchBody({ gqlQuery: r.value.trimEnd() });
      setGqlError(null);
    } else setGqlError(r.error);
  };

  return (
    <div className="flex flex-col gap-3">
      <Guide en={HTTP_GUIDE.en} fa={HTTP_GUIDE.fa} />
      <details className="card group overflow-hidden">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] font-semibold hover:bg-surface2/60">
          <Icon name="download" size={14} className="text-accent" />
          Import request
          <span className="text-[11px] font-normal text-muted">cURL · raw HTTP · OpenAPI</span>
          <Icon
            name="chevron"
            size={14}
            className="ml-auto text-muted transition-transform group-open:rotate-90"
          />
        </summary>
        <div className="flex flex-col gap-2 border-t border-line p-3">
          <Tabs
            tabs={IMPORT_TABS}
            active={importTab}
            onChange={(t) => {
              setImportTab(t);
              setImportError(null);
            }}
            label="Import source"
            size="sm"
          />
          <TextArea
            label={
              importTab === 'openapi'
                ? 'OpenAPI document (JSON)'
                : importTab === 'raw'
                  ? 'Raw HTTP request'
                  : 'cURL command'
            }
            rows={4}
            placeholder={
              importTab === 'openapi'
                ? '{ "openapi": "3.0.0", "paths": { ... } }'
                : importTab === 'raw'
                  ? 'POST /orders HTTP/1.1\nHost: api.example.com\nContent-Type: application/json\n\n{"a":1}'
                  : "curl -X POST 'https://api.example.com' -H 'Accept: application/json'"
            }
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div>
            <Button icon="download" onClick={runImport}>
              {importTab === 'openapi' ? 'Load endpoints' : 'Import'}
            </Button>
          </div>
          {importError && <ErrorMessage error={importError} />}
          {openApi && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted">
                <b className="text-fg">{openApi.title}</b> {openApi.version} ·{' '}
                {openApi.operations.length} endpoints
              </p>
              <Input
                aria-label="Server URL"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="Server URL"
              />
              <Input
                aria-label="Filter endpoints"
                value={opFilter}
                onChange={(e) => setOpFilter(e.target.value)}
                placeholder="Filter endpoints..."
              />
              <ul className="flex max-h-48 flex-col gap-1 overflow-auto">
                {filteredOps.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => applySpec(operationToRequest(o, server))}
                      className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface2/50 px-2 py-1 text-left hover:border-accent/50"
                    >
                      <span
                        className={`w-14 shrink-0 font-mono text-[10px] font-bold ${METHOD_TONE[o.method]}`}
                      >
                        {o.method}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{o.path}</span>
                      <span className="hidden max-w-[120px] truncate text-[11px] text-muted sm:inline">
                        {o.summary}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>

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
          placeholder="https://api.example.com/orders"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="section-title mb-1.5">Headers</legend>
        {headers.map((h, i) => (
          <div key={i} className="flex gap-1.5">
            <Input
              aria-label={`Header ${i + 1} name`}
              placeholder="Name"
              value={h.name}
              onChange={(e) => updateHeader(i, { name: e.target.value })}
            />
            <Input
              aria-label={`Header ${i + 1} value`}
              placeholder="Value"
              value={h.value}
              onChange={(e) => updateHeader(i, { value: e.target.value })}
            />
            <Button
              variant="ghost"
              aria-label={`Remove header ${i + 1}`}
              onClick={() => setHeaders(headers.filter((_, idx) => idx !== i))}
            >
              <Icon name="x" size={14} />
            </Button>
          </div>
        ))}
        <div>
          <Button icon="plus" onClick={() => setHeaders([...headers, { name: '', value: '' }])}>
            Add header
          </Button>
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <Tabs
          tabs={BODY_TABS}
          active={body.mode}
          onChange={(m) => patchBody({ mode: m as BodyMode })}
          label="Body type"
          size="sm"
        />
        {body.mode === 'raw' && (
          <TextArea
            label="Body"
            rows={5}
            placeholder="Request body"
            value={body.raw}
            onChange={(e) => patchBody({ raw: e.target.value })}
          />
        )}
        {body.mode === 'form' && (
          <Rows label="Field" rows={body.form} onChange={(form) => patchBody({ form })} />
        )}
        {body.mode === 'multipart' && (
          <Rows
            label="Part"
            fileToggle
            rows={body.multipart}
            onChange={(rows) => patchBody({ multipart: rows as MultipartField[] })}
          />
        )}
        {body.mode === 'graphql' && (
          <div className="flex flex-col gap-2">
            <TextArea
              label="Query / mutation"
              rows={6}
              placeholder="query { viewer { id name } }"
              value={body.gqlQuery}
              onChange={(e) => patchBody({ gqlQuery: e.target.value })}
            />
            <div>
              <Button icon="sparkles" onClick={prettyGql}>
                Format query
              </Button>
            </div>
            {gqlError && <ErrorMessage error={gqlError} />}
            <TextArea
              label="Variables (JSON)"
              rows={3}
              placeholder='{"id": 1}'
              value={body.gqlVariables}
              onChange={(e) => patchBody({ gqlVariables: e.target.value })}
            />
            <p className="text-[11px] text-muted">
              Sent as a JSON body {'{ "query", "variables" }'} with Content-Type application/json.
            </p>
          </div>
        )}
      </div>

      <TextArea
        label="Sample response (JSON, optional — used for C# output models)"
        rows={4}
        placeholder='{"id": 1, "status": "created"}'
        value={response}
        onChange={(e) => setResponse(e.target.value)}
      />

      <div className="flex flex-wrap items-center gap-2">
        {TARGET_IDS.map((t) => (
          <Button key={t} variant="primary" icon="send" onClick={() => generate(t)}>
            Generate {TARGETS[t].short}
          </Button>
        ))}
        <kbd className="ml-auto rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
          Ctrl/Cmd + Enter
        </kbd>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          className="accent-[rgb(var(--accent))]"
          checked={mask}
          onChange={(e) => setMask(e.target.checked)}
        />
        Mask secrets in the output (Authorization, cookies, tokens, passwords) — safe to paste into
        a ticket
      </label>

      {error && <ErrorMessage error={error} />}
      {sections.map((s) => (
        <CodeBlock key={s.title} code={s.code} language={s.lang} title={s.title} maxHeight={340} />
      ))}

      {savedEnabled && (
        <SavedRequests
          getSpec={() => {
            const b = spec();
            return b.ok ? b.spec : null;
          }}
          onLoad={(r) => {
            applySpec({ method: r.method, url: r.url, headers: r.headers, body: r.body });
          }}
        />
      )}
    </div>
  );
}
