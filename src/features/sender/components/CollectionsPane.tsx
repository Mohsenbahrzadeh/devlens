import { useEffect, useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState, ErrorMessage } from '@/components/ErrorMessage';
import { Guide } from '@/components/Guide';
import { Input } from '@/components/Input';
import { StatusBadge, type BadgeTone } from '@/components/StatusBadge';
import type { HttpHeader, HttpMethod } from '@/features/http/types';
import type { AppError } from '@/types/result';
import {
  loadActiveEnvironmentId,
  loadCollections,
  loadEnvironments,
  storeActiveEnvironmentId,
  storeCollections,
  storeEnvironments,
} from '@/lib/storage';
import { evaluateAssertions, type Assertion } from '../utils/assertions';
import {
  allPassed,
  emptyCollection,
  emptyRequest,
  summarizeRun,
  type Collection,
  type CollectionRequest,
  type RunResult,
} from '../utils/collections';
import { applyEnvironment, emptyEnvironment, type Environment } from '../utils/environments';
import { sendRequest } from '../utils/network';
import { collectionRunToMarkdown } from '../utils/reportMarkdown';
import { DestructiveWarning, isDestructiveMethod, RequestForm } from './Sender';

const ASSERTION_KINDS: Assertion['kind'][] = [
  'status',
  'header',
  'body-contains',
  'json-path',
  'max-time',
];

function defaultAssertion(kind: Assertion['kind']): Assertion {
  switch (kind) {
    case 'status':
      return { kind: 'status', op: 'eq', value: 200 };
    case 'header':
      return { kind: 'header', name: '', op: 'exists' };
    case 'body-contains':
      return { kind: 'body-contains', text: '' };
    case 'json-path':
      return { kind: 'json-path', path: '$.', op: 'exists' };
    case 'max-time':
      return { kind: 'max-time', ms: 1000 };
  }
}

function AssertionEditor({
  assertions,
  setAssertions,
}: {
  assertions: Assertion[];
  setAssertions: (a: Assertion[]) => void;
}) {
  const update = (i: number, a: Assertion) =>
    setAssertions(assertions.map((x, idx) => (idx === i ? a : x)));
  const remove = (i: number) => setAssertions(assertions.filter((_, idx) => idx !== i));

  return (
    <div className="flex flex-col gap-1.5">
      {assertions.map((a, i) => (
        <div
          key={i}
          className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface2/50 p-1.5"
        >
          <select
            aria-label={`Assertion ${i + 1} kind`}
            value={a.kind}
            onChange={(e) => update(i, defaultAssertion(e.target.value as Assertion['kind']))}
            className="field !w-auto text-xs"
          >
            {ASSERTION_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          {a.kind === 'status' && (
            <>
              <select
                aria-label="Status operator"
                value={a.op}
                onChange={(e) => update(i, { ...a, op: e.target.value as typeof a.op })}
                className="field !w-auto text-xs"
              >
                <option value="eq">==</option>
                <option value="lt">&lt;</option>
                <option value="gte">&gt;=</option>
              </select>
              <Input
                aria-label="Status value"
                type="number"
                value={a.value}
                onChange={(e) => update(i, { ...a, value: Number(e.target.value) })}
                className="!w-20"
              />
            </>
          )}
          {a.kind === 'header' && (
            <>
              <Input
                aria-label="Header name"
                placeholder="Header name"
                value={a.name}
                onChange={(e) => update(i, { ...a, name: e.target.value })}
                className="!w-32"
              />
              <select
                aria-label="Header operator"
                value={a.op}
                onChange={(e) => update(i, { ...a, op: e.target.value as typeof a.op })}
                className="field !w-auto text-xs"
              >
                <option value="exists">exists</option>
                <option value="eq">==</option>
                <option value="contains">contains</option>
              </select>
              {a.op !== 'exists' && (
                <Input
                  aria-label="Header value"
                  placeholder="Value"
                  value={a.value ?? ''}
                  onChange={(e) => update(i, { ...a, value: e.target.value })}
                  className="!w-32"
                />
              )}
            </>
          )}
          {a.kind === 'body-contains' && (
            <Input
              aria-label="Body text"
              placeholder="Text the body must contain"
              value={a.text}
              onChange={(e) => update(i, { ...a, text: e.target.value })}
              className="!w-56"
            />
          )}
          {a.kind === 'json-path' && (
            <>
              <Input
                aria-label="JSON path"
                placeholder="$.data.id"
                value={a.path}
                onChange={(e) => update(i, { ...a, path: e.target.value })}
                className="!w-32"
              />
              <select
                aria-label="JSON path operator"
                value={a.op}
                onChange={(e) => update(i, { ...a, op: e.target.value as typeof a.op })}
                className="field !w-auto text-xs"
              >
                <option value="exists">exists</option>
                <option value="eq">==</option>
              </select>
              {a.op === 'eq' && (
                <Input
                  aria-label="JSON path value"
                  placeholder="Value"
                  value={a.value ?? ''}
                  onChange={(e) => update(i, { ...a, value: e.target.value })}
                  className="!w-32"
                />
              )}
            </>
          )}
          {a.kind === 'max-time' && (
            <Input
              aria-label="Max time in milliseconds"
              type="number"
              value={a.ms}
              onChange={(e) => update(i, { ...a, ms: Number(e.target.value) })}
              className="!w-24"
            />
          )}
          <Button
            variant="ghost"
            aria-label={`Remove assertion ${i + 1}`}
            onClick={() => remove(i)}
            className="ml-auto"
          >
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
      ))}
      <div>
        <Button
          icon="plus"
          onClick={() => setAssertions([...assertions, defaultAssertion('status')])}
        >
          Add assertion
        </Button>
      </div>
    </div>
  );
}

function EnvironmentEditor({
  env,
  onChange,
}: {
  env: Environment;
  onChange: (e: Environment) => void;
}) {
  const entries = Object.entries(env.variables);
  const setVar = (key: string, value: string) =>
    onChange({ ...env, variables: { ...env.variables, [key]: value } });
  const renameVar = (oldKey: string, newKey: string) => {
    if (!newKey || newKey === oldKey) return;
    const { [oldKey]: v, ...rest } = env.variables;
    onChange({ ...env, variables: { ...rest, [newKey]: v ?? '' } });
  };
  const removeVar = (key: string) => {
    const rest = { ...env.variables };
    delete rest[key];
    onChange({ ...env, variables: rest });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        aria-label="Environment name"
        value={env.name}
        onChange={(e) => onChange({ ...env, name: e.target.value })}
      />
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <Input
            aria-label="Variable name"
            value={k}
            onChange={(e) => renameVar(k, e.target.value)}
          />
          <Input
            aria-label="Variable value"
            value={v}
            onChange={(e) => setVar(k, e.target.value)}
          />
          <Button variant="ghost" aria-label={`Remove variable ${k}`} onClick={() => removeVar(k)}>
            <span aria-hidden="true">✕</span>
          </Button>
        </div>
      ))}
      <div>
        <Button icon="plus" onClick={() => setVar(`var${entries.length + 1}`, '')}>
          Add variable
        </Button>
      </div>
    </div>
  );
}

function RequestEditor({
  request,
  onChange,
  onRemove,
}: {
  request: CollectionRequest;
  onChange: (r: CollectionRequest) => void;
  onRemove: () => void;
}) {
  return (
    <Card
      title={request.name || 'Untitled request'}
      icon="send"
      actions={
        <Button variant="ghost" aria-label="Remove request" onClick={onRemove}>
          <span aria-hidden="true">✕</span>
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <Input
          aria-label="Request name"
          placeholder="Request name"
          value={request.name}
          onChange={(e) => onChange({ ...request, name: e.target.value })}
        />
        <RequestForm
          method={request.method}
          setMethod={(m: HttpMethod) => onChange({ ...request, method: m })}
          url={request.url}
          setUrl={(u: string) => onChange({ ...request, url: u })}
          headers={request.headers}
          setHeaders={(h: HttpHeader[]) => onChange({ ...request, headers: h })}
          body={request.body}
          setBody={(b: string) => onChange({ ...request, body: b })}
          urlPlaceholder="https://api.example.com/orders/{{orderId}}"
        />
        <p className="text-[11px] text-muted">
          Use <code className="rounded bg-surface2 px-1 font-mono">{'{{varName}}'}</code> for values
          that come from the active environment.
        </p>
        <AssertionEditor
          assertions={request.assertions}
          setAssertions={(a) => onChange({ ...request, assertions: a })}
        />
      </div>
    </Card>
  );
}

const statusTone = (s: number): BadgeTone =>
  s === 0 ? 'bad' : s >= 500 ? 'bad' : s >= 400 ? 'warn' : s >= 300 ? 'info' : 'good';

const COLLECTIONS_GUIDE = {
  en: {
    what: 'Saves a named set of requests, each with its own assertions (status code, a response header, body contains, a JSON-path value, or max response time), and runs the whole set in one go — a lightweight regression check for your own endpoints. Environments hold {{varName}} values (e.g. a host or a token) that get filled into every request’s URL, headers and body when you run.',
    steps: [
      'Create an environment and add variables (e.g. host = api.example.com, token = ...), or skip this if you don’t need variables.',
      'Create a collection, add requests, and use {{varName}} anywhere you want a variable substituted.',
      'Add assertions to each request (e.g. status == 200, or $.data.id exists).',
      'Pick the active environment and press "Run all"; see a pass/fail summary per request and copy a Markdown report.',
    ],
    example:
      'Request: GET https://{{host}}/orders/1, assertion: status == 200\nEnvironment: host = api.example.com\n→ Run all sends GET https://api.example.com/orders/1 and checks the assertion.',
    useCase:
      'A quick smoke test after a deploy ("do these 10 endpoints still return what they should?"), or re-checking a set of known-good requests across different environments (staging vs. production) just by switching which environment is active.',
  },
  fa: {
    what: 'مجموعه‌ای نام‌دار از درخواست‌ها را ذخیره می‌کند، هرکدام با assertion خودشان (کد status، یک هدر پاسخ، شامل‌بودن بدنه، یک مقدار JSON-path، یا حداکثر زمان پاسخ)، و کل مجموعه را یک‌جا اجرا می‌کند — یک چک سبک رگرسیون برای اندپوینت‌های خودتان. Environmentها مقادیر {{varName}} (مثل یک host یا token) را نگه می‌دارند که هنگام اجرا در URL، هدرها و بدنه‌ی هر درخواست جایگذاری می‌شوند.',
    steps: [
      'یک environment بسازید و متغیر اضافه کنید (مثلاً host = api.example.com، token = ...)، یا اگر نیازی به متغیر ندارید این مرحله را رد کنید.',
      'یک collection بسازید، درخواست اضافه کنید، و هرجا می‌خواهید یک متغیر جایگذاری شود از {{varName}} استفاده کنید.',
      'به هر درخواست assertion اضافه کنید (مثلاً status == 200، یا $.data.id وجود دارد).',
      'environment فعال را انتخاب کنید و «Run all» را بزنید؛ خلاصه‌ی موفق/ناموفق هر درخواست را ببینید و گزارش Markdown را کپی کنید.',
    ],
    example:
      'درخواست: GET https://{{host}}/orders/1، assertion: status == 200\nEnvironment: host = api.example.com\n→ Run all یک GET به https://api.example.com/orders/1 می‌فرستد و assertion را بررسی می‌کند.',
    useCase:
      'یک smoke test سریع بعد از دیپلوی («آیا این ۱۰ اندپوینت هنوز چیزی که باید را برمی‌گردانند؟»)، یا بررسی دوباره‌ی مجموعه‌ای از درخواست‌های سالم روی محیط‌های مختلف (staging در مقابل production) فقط با عوض کردن environment فعال.',
  },
};

export function CollectionsPane() {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [environments, setEnvironments] = useState<Environment[] | null>(null);
  const [activeEnvId, setActiveEnvId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<RunResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [destructiveAck, setDestructiveAck] = useState(false);

  useEffect(() => {
    void (async () => {
      const [c, e, a] = await Promise.all([
        loadCollections(),
        loadEnvironments(),
        loadActiveEnvironmentId(),
      ]);
      setCollections(c);
      setEnvironments(e);
      setActiveEnvId(a);
    })();
  }, []);

  if (collections === null || environments === null) {
    return <EmptyState icon="folder">Loading collections…</EmptyState>;
  }

  const setAndStoreCollections = (c: Collection[]) => {
    setCollections(c);
    void storeCollections(c);
  };
  const setAndStoreEnvironments = (e: Environment[]) => {
    setEnvironments(e);
    void storeEnvironments(e);
  };
  const setAndStoreActiveEnvId = (id: string | null) => {
    setActiveEnvId(id);
    void storeActiveEnvironmentId(id);
  };

  const selected = collections.find((c) => c.id === selectedId) ?? null;
  const activeEnv = environments.find((e) => e.id === activeEnvId) ?? null;

  const updateSelected = (c: Collection) =>
    setAndStoreCollections(collections.map((x) => (x.id === c.id ? c : x)));

  const hasDestructive = selected?.requests.some((r) => isDestructiveMethod(r.method)) ?? false;

  const run = async () => {
    if (!selected || selected.requests.length === 0) return;
    if (hasDestructive && !destructiveAck) {
      setError({
        title: 'Confirm deletion',
        message: 'Check the box above to confirm — this collection includes DELETE requests.',
      });
      return;
    }
    setRunning(true);
    setError(null);
    setResults(null);
    const vars = activeEnv?.variables ?? {};
    const out: RunResult[] = [];
    for (const req of selected.requests) {
      const spec = applyEnvironment(
        { method: req.method, url: req.url, headers: req.headers, body: req.body },
        vars,
      );
      const started = performance.now();
      const r = await sendRequest(spec);
      const timeMs = Math.round(performance.now() - started);
      if (r.ok) {
        out.push({
          request: req,
          status: r.value.status,
          timeMs,
          assertionResults: evaluateAssertions(req.assertions, r.value),
        });
      } else {
        out.push({ request: req, status: 0, timeMs, error: r.error.message, assertionResults: [] });
      }
    }
    setResults(out);
    setRunning(false);
  };

  const summary = results ? summarizeRun(results) : null;

  return (
    <div className="flex flex-col gap-3">
      <Guide en={COLLECTIONS_GUIDE.en} fa={COLLECTIONS_GUIDE.fa} />

      <Card title="Environment" icon="settings">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <select
              aria-label="Active environment"
              value={activeEnvId ?? ''}
              onChange={(e) => setAndStoreActiveEnvId(e.target.value || null)}
              className="field font-semibold"
            >
              <option value="">(none)</option>
              {environments.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <Button
              icon="plus"
              onClick={() => {
                const e = emptyEnvironment();
                setAndStoreEnvironments([...environments, e]);
                setAndStoreActiveEnvId(e.id);
              }}
            >
              New
            </Button>
            {activeEnv && (
              <Button
                variant="ghost"
                onClick={() => {
                  setAndStoreEnvironments(environments.filter((e) => e.id !== activeEnv.id));
                  setAndStoreActiveEnvId(null);
                }}
              >
                Delete
              </Button>
            )}
          </div>
          {activeEnv && (
            <EnvironmentEditor
              env={activeEnv}
              onChange={(e) =>
                setAndStoreEnvironments(environments.map((x) => (x.id === e.id ? e : x)))
              }
            />
          )}
        </div>
      </Card>

      <Card title="Collections" icon="folder">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <select
              aria-label="Collection"
              value={selectedId ?? ''}
              onChange={(e) => {
                setSelectedId(e.target.value || null);
                setResults(null);
                setDestructiveAck(false);
              }}
              className="field font-semibold"
            >
              <option value="">(select a collection)</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.requests.length})
                </option>
              ))}
            </select>
            <Button
              icon="plus"
              onClick={() => {
                const c = emptyCollection();
                setAndStoreCollections([...collections, c]);
                setSelectedId(c.id);
                setDestructiveAck(false);
              }}
            >
              New collection
            </Button>
            {selected && (
              <Button
                variant="ghost"
                onClick={() => {
                  setAndStoreCollections(collections.filter((c) => c.id !== selected.id));
                  setSelectedId(null);
                  setResults(null);
                  setDestructiveAck(false);
                }}
              >
                Delete
              </Button>
            )}
          </div>

          {!selected && (
            <EmptyState icon="folder">Create or select a collection to add requests.</EmptyState>
          )}

          {selected && (
            <div className="flex flex-col gap-2">
              <Input
                aria-label="Collection name"
                value={selected.name}
                onChange={(e) => updateSelected({ ...selected, name: e.target.value })}
              />
              {selected.requests.map((req) => (
                <RequestEditor
                  key={req.id}
                  request={req}
                  onChange={(r) =>
                    updateSelected({
                      ...selected,
                      requests: selected.requests.map((x) => (x.id === r.id ? r : x)),
                    })
                  }
                  onRemove={() =>
                    updateSelected({
                      ...selected,
                      requests: selected.requests.filter((x) => x.id !== req.id),
                    })
                  }
                />
              ))}
              <div className="flex items-center gap-2">
                <Button
                  icon="plus"
                  onClick={() =>
                    updateSelected({
                      ...selected,
                      requests: [...selected.requests, emptyRequest()],
                    })
                  }
                >
                  Add request
                </Button>
                <Button
                  variant="primary"
                  icon="send"
                  onClick={() => void run()}
                  disabled={
                    running || selected.requests.length === 0 || (hasDestructive && !destructiveAck)
                  }
                  className="ml-auto"
                >
                  {running ? 'Running…' : 'Run all'}
                </Button>
              </div>
              {hasDestructive && (
                <DestructiveWarning>
                  <span className="font-semibold">This collection includes DELETE requests.</span>{' '}
                  If the target actually deletes data, there is no undo from inside DevLens.
                  <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 font-normal">
                    <input
                      type="checkbox"
                      className="accent-[rgb(var(--bad))]"
                      checked={destructiveAck}
                      onChange={(e) => setDestructiveAck(e.target.checked)}
                    />
                    I mean to run the DELETE requests in this collection.
                  </label>
                </DestructiveWarning>
              )}
            </div>
          )}
        </div>
      </Card>

      {error && <ErrorMessage error={error} />}

      {results && summary && selected && (
        <Card
          title={`Run results: ${summary.passed}/${summary.requests} passed`}
          icon="check"
          actions={
            <CopyButton
              text={collectionRunToMarkdown(selected.name, results)}
              label="Copy report"
            />
          }
        >
          <ul className="flex flex-col gap-2">
            {results.map((r, i) => (
              <li key={i} className="rounded-lg border border-line bg-surface2/50 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <StatusBadge tone={r.error ? 'bad' : statusTone(r.status)}>
                    {r.error ? 'error' : String(r.status)}
                  </StatusBadge>
                  <span className="font-semibold">{r.request.name}</span>
                  <span className="text-muted">{r.timeMs} ms</span>
                  {!r.error && (
                    <StatusBadge tone={allPassed(r.assertionResults) ? 'good' : 'bad'}>
                      {allPassed(r.assertionResults) ? 'pass' : 'fail'}
                    </StatusBadge>
                  )}
                </div>
                {r.error && <p className="mt-1 text-bad">{r.error}</p>}
                {r.assertionResults.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {r.assertionResults.map((a, j) => (
                      <li key={j} className={a.pass ? 'text-muted' : 'text-bad'}>
                        {a.pass ? '✓' : '✗'} {a.message}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
