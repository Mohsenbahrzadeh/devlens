import type { JsonValue } from '@/lib/json';
import type { DiffEntry, DiffKind } from './diff';

export function parseIgnore(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const escapeRe = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

/** Index/identity segments are normalised to `[*]` so one pattern covers every item. */
const normalize = (path: string) =>
  path.replace(/\[(?:id|_id|key|uuid)=[^\]]*\]/g, '[*]').replace(/\[\d+\]/g, '[*]');

const BRACKET_STAR = '@@BRACKET@@';
const DOUBLE_STAR = '@@DEEP@@';

function toRegExp(pattern: string): RegExp {
  const body = escapeRe(normalize(pattern).split('[*]').join(BRACKET_STAR))
    .split('**')
    .join(DOUBLE_STAR)
    .split('*')
    .join('[^.\\[\\]]*')
    .split(DOUBLE_STAR)
    .join('.*')
    .split(BRACKET_STAR)
    .join('\\[\\*\\]');
  // Match on a dotted boundary, and everything beneath a matched node.
  return new RegExp(`(?:^|\\.)${body}(?:[.\\[].*)?$`);
}

/**
 * Ignore rules: `updatedAt` (any property with that name), `meta.version`,
 * `items[*].id`, `*.timestamp`, `**.id`. A matched node hides everything beneath it.
 */
export function filterIgnored(entries: DiffEntry[], patterns: string[]): DiffEntry[] {
  if (patterns.length === 0) return entries;
  const regexes = patterns.map(toRegExp);
  return entries.filter((e) => {
    const path = normalize(e.path);
    return !regexes.some((r) => r.test(path));
  });
}

const show = (v: JsonValue | undefined) => JSON.stringify(v);

export function diffToMarkdown(entries: DiffEntry[]): string {
  const order: DiffKind[] = ['changed', 'added', 'removed'];
  const lines: string[] = ['# JSON diff', ''];
  for (const kind of order) {
    const items = entries.filter((e) => e.kind === kind);
    if (items.length === 0) continue;
    lines.push(`## ${kind[0].toUpperCase()}${kind.slice(1)} (${items.length})`, '');
    for (const e of items) {
      if (kind === 'changed') {
        lines.push(`- \`${e.path}\`: \`${show(e.before)}\` → \`${show(e.after)}\``);
      } else {
        lines.push(`- \`${e.path}\`: \`${show(kind === 'added' ? e.after : e.before)}\``);
      }
    }
    lines.push('');
  }
  if (lines.length === 2) lines.push('No differences.');
  return lines.join('\n').trimEnd() + '\n';
}

export function diffToJson(entries: DiffEntry[]): string {
  const changes = entries
    .filter((e) => e.kind !== 'unchanged')
    .map(({ kind, path, before, after }) => ({ kind, path, before, after }));
  return JSON.stringify(changes, null, 2);
}
