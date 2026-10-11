import { useMemo, useState } from 'react';
import { Button } from '@/components/Button';
import { CopyButton } from '@/components/CopyButton';
import { EmptyState, ErrorMessage } from '@/components/ErrorMessage';
import { Input } from '@/components/Input';
import { TextArea } from '@/components/TextArea';
import { useCtrlEnter } from '@/hooks/useCtrlEnter';
import { parseJson, type JsonValue } from '@/lib/json';
import type { AppError } from '@/types/result';
import { diffJson, summarize, type DiffEntry, type DiffKind } from '../utils/diff';
import { diffToJson, diffToMarkdown, filterIgnored, parseIgnore } from '../utils/ignore';

const LABELS: Record<DiffKind, { text: string; sign: string; bar: string; chip: string }> = {
  changed: { text: 'Changed', sign: '~', bar: 'border-l-warn', chip: 'bg-warn/15 text-warn' },
  added: { text: 'Added', sign: '+', bar: 'border-l-good', chip: 'bg-good/15 text-good' },
  removed: { text: 'Removed', sign: '−', bar: 'border-l-bad', chip: 'bg-bad/15 text-bad' },
  unchanged: {
    text: 'Unchanged',
    sign: '=',
    bar: 'border-l-line',
    chip: 'bg-surface2 text-muted',
  },
};
const ORDER: DiffKind[] = ['changed', 'added', 'removed', 'unchanged'];
const show = (v: JsonValue | undefined) => JSON.stringify(v);
const pretty = (v: JsonValue | undefined) => (v === undefined ? '' : JSON.stringify(v, null, 2));

type View = 'list' | 'split';

function SideBySide({ e }: { e: DiffEntry }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-bad/10 p-1.5 font-mono text-fg">
        {e.kind === 'added' ? '—' : pretty(e.before)}
      </pre>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-good/10 p-1.5 font-mono text-fg">
        {e.kind === 'removed' ? '—' : pretty(e.after)}
      </pre>
    </div>
  );
}

export function JsonDiff() {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [raw, setRaw] = useState<DiffEntry[] | null>(null);
  const [errors, setErrors] = useState<{ side: string; error: AppError }[]>([]);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [ignore, setIgnore] = useState('');
  const [view, setView] = useState<View>('list');

  const compare = () => {
    const a = parseJson(left);
    const b = parseJson(right);
    const errs: { side: string; error: AppError }[] = [];
    if (!a.ok) errs.push({ side: 'Original JSON', error: a.error });
    if (!b.ok) errs.push({ side: 'New JSON', error: b.error });
    setErrors(errs);
    setRaw(a.ok && b.ok ? diffJson(a.value, b.value) : null);
  };
  useCtrlEnter(compare);

  const patterns = useMemo(() => parseIgnore(ignore), [ignore]);
  const entries = useMemo(() => (raw ? filterIgnored(raw, patterns) : null), [raw, patterns]);
  const hidden = raw && entries ? raw.length - entries.length : 0;
  const summary = entries ? summarize(entries) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <TextArea
          label="Original JSON"
          rows={8}
          value={left}
          onChange={(e) => setLeft(e.target.value)}
          placeholder="Original JSON"
        />
        <TextArea
          label="New JSON"
          rows={8}
          value={right}
          onChange={(e) => setRight(e.target.value)}
          placeholder="New JSON"
        />
      </div>
      <Input
        aria-label="Ignore paths"
        className="font-mono text-xs"
        placeholder="Ignore: updatedAt, meta.version, items[*].id, **.timestamp"
        value={ignore}
        onChange={(e) => setIgnore(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button variant="primary" icon="diff" onClick={compare}>
          Compare
        </Button>
        <Button
          icon="eraser"
          onClick={() => {
            setLeft('');
            setRight('');
            setRaw(null);
            setErrors([]);
          }}
        >
          Clear
        </Button>
        <kbd className="ml-auto rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">
          Ctrl/Cmd + Enter
        </kbd>
      </div>

      {errors.map((e) => (
        <ErrorMessage key={e.side} error={{ ...e.error, title: `${e.side}: ${e.error.title}` }} />
      ))}
      {!entries && errors.length === 0 && (
        <EmptyState icon="diff">Paste two JSON documents and press Compare.</EmptyState>
      )}

      {entries && summary && (
        <section aria-label="Diff result" className="flex flex-col gap-2">
          <div role="status" className="grid grid-cols-4 gap-2">
            {ORDER.map((k) => (
              <div key={k} className={`rounded-xl px-2 py-1.5 text-center ${LABELS[k].chip}`}>
                <div className="text-lg font-bold leading-none">{summary[k]}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wider">
                  {LABELS[k].text}
                </div>
              </div>
            ))}
          </div>
          {hidden > 0 && (
            <p className="text-[11px] text-muted">
              {hidden} difference{hidden === 1 ? '' : 's'} hidden by ignore rules.
            </p>
          )}
          {summary.added + summary.removed + summary.changed === 0 && (
            <p className="rounded-xl border border-good/30 bg-good/10 p-2.5 text-sm font-medium text-good">
              ✓ The documents are structurally identical.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Diff view" className="flex gap-1">
              {(['list', 'split'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    view === v
                      ? 'bg-accent/15 text-accent ring-1 ring-accent/40'
                      : 'text-muted hover:bg-surface2 hover:text-fg'
                  }`}
                >
                  {v === 'list' ? 'List' : 'Side by side'}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                className="accent-[rgb(var(--accent))]"
                checked={showUnchanged}
                onChange={(e) => setShowUnchanged(e.target.checked)}
              />
              Show unchanged
            </label>
            <span className="ml-auto flex gap-1.5">
              <CopyButton text={diffToMarkdown(entries)} label="Copy Markdown" />
              <CopyButton text={diffToJson(entries)} label="Copy JSON" />
            </span>
          </div>
          {ORDER.filter((k) => k !== 'unchanged' || showUnchanged).map((kind) => {
            const items = entries.filter((e) => e.kind === kind);
            if (items.length === 0) return null;
            const l = LABELS[kind];
            return (
              <div key={kind}>
                <h3 className="section-title mb-1">
                  <span className={`grid h-4 w-4 place-items-center rounded font-bold ${l.chip}`}>
                    {l.sign}
                  </span>
                  {l.text} ({items.length})
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {items.map((e) => (
                    <li
                      key={`${kind}-${e.path}`}
                      className={`card animate-rise border-l-4 ${l.bar} px-2.5 py-1.5 font-mono text-xs`}
                    >
                      <span className="font-semibold">{e.path}</span>
                      {view === 'split' && kind !== 'unchanged' ? (
                        <div className="mt-1">
                          <SideBySide e={e} />
                        </div>
                      ) : (
                        <div className="mt-0.5 break-all">
                          {kind === 'changed' && (
                            <>
                              <span className="rounded bg-bad/15 px-1 text-bad line-through decoration-bad/50">
                                {show(e.before)}
                              </span>
                              <span className="mx-1.5 text-muted">→</span>
                              <span className="rounded bg-good/15 px-1 text-good">
                                {show(e.after)}
                              </span>
                            </>
                          )}
                          {kind === 'added' && <span className="text-good">{show(e.after)}</span>}
                          {kind === 'removed' && <span className="text-bad">{show(e.before)}</span>}
                          {kind === 'unchanged' && (
                            <span className="text-muted">{show(e.after)}</span>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
