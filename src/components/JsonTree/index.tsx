import { useState } from 'react';
import { isObject, stringifyValue, type JsonValue } from '@/lib/json';
import { copyText } from '@/lib/clipboard';
import { Icon } from '../Icon';

interface Props {
  value: JsonValue;
  /** Paths (see `searchJson`) to highlight; ancestors of matches are auto-expanded. */
  matches?: Set<string>;
  /** Optional claim descriptions shown next to top-level keys. */
  hints?: Record<string, string>;
}

const valueClass = (v: JsonValue): string => {
  if (typeof v === 'string') return 'text-emerald-700 dark:text-emerald-300';
  if (typeof v === 'number') return 'text-sky-700 dark:text-sky-300';
  if (typeof v === 'boolean') return 'text-accent2';
  return 'italic text-muted';
};

const hasMatchBelow = (path: string, matches?: Set<string>): boolean => {
  if (!matches) return false;
  for (const m of matches) {
    if (m !== path && (m.startsWith(path + '.') || m.startsWith(path + '['))) return true;
  }
  return false;
};

function Node({
  name,
  value,
  path,
  depth,
  matches,
  hints,
}: {
  name?: string;
  value: JsonValue;
  path: string;
  depth: number;
  matches?: Set<string>;
  hints?: Record<string, string>;
}) {
  const container = Array.isArray(value) || isObject(value);
  const [userOpen, setUserOpen] = useState<boolean | undefined>(undefined);
  const forced = hasMatchBelow(path, matches);
  const open = userOpen ?? (forced || depth < 2);
  const [copied, setCopied] = useState(false);
  const hit = matches?.has(path);

  const copy = async () => {
    if (await copyText(stringifyValue(value))) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  const entries: [string, JsonValue][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : isObject(value)
      ? Object.entries(value)
      : [];
  const summary = Array.isArray(value) ? `[ ${value.length} ]` : `{ ${entries.length} }`;
  const hint = depth === 1 ? hints?.[name ?? ''] : undefined;

  return (
    <li role="treeitem" aria-expanded={container ? open : undefined} className="font-mono text-xs">
      <div
        className={`group flex items-start gap-1 rounded-md px-1 py-0.5 hover:bg-surface2 ${
          hit ? 'bg-warn/25 ring-1 ring-warn/50' : ''
        }`}
      >
        {container ? (
          <button
            type="button"
            aria-label={`${open ? 'Collapse' : 'Expand'} ${name ?? 'root'}`}
            onClick={() => setUserOpen(!open)}
            className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded text-muted hover:text-fg"
          >
            <Icon
              name="chevron"
              size={12}
              className={`transition-transform ${open ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {name !== undefined && (
          <span>
            <span className="font-semibold text-accent">{name}</span>
            <span className="text-muted">:</span>
          </span>
        )}
        {container ? (
          <span className="text-muted">{open ? '' : summary}</span>
        ) : (
          <span className={`break-all ${valueClass(value)}`}>{JSON.stringify(value)}</span>
        )}
        {hint && (
          <span className="ml-1 rounded-full bg-accent/10 px-1.5 font-sans text-[10px] font-medium text-accent">
            {hint}
          </span>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy value of ${name ?? 'root'}`}
          className="ml-auto shrink-0 rounded px-1.5 font-sans text-[10px] font-medium text-muted opacity-0 hover:bg-line hover:text-fg focus:opacity-100 group-hover:opacity-100"
        >
          {copied ? '✓' : 'copy'}
        </button>
      </div>
      {container && open && entries.length > 0 && (
        <ul role="group" className="ml-[11px] border-l border-line pl-2">
          {entries.map(([k, v]) => (
            <Node
              key={k}
              name={k}
              value={v}
              path={Array.isArray(value) ? `${path}[${k}]` : `${path}.${k}`}
              depth={depth + 1}
              matches={matches}
              hints={hints}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function JsonTree({ value, matches, hints }: Props) {
  return (
    <ul role="tree" aria-label="JSON tree">
      <Node value={value} path="$" depth={0} matches={matches} hints={hints} />
    </ul>
  );
}
