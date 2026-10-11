import { Fragment, useMemo } from 'react';
import { CopyButton } from '../CopyButton';

export type Language =
  | 'bash'
  | 'csharp'
  | 'javascript'
  | 'python'
  | 'typescript'
  | 'json'
  | 'java'
  | 'go'
  | 'yaml'
  | 'xml'
  | 'text';

const KEYWORDS: Record<Language, string> = {
  bash: 'curl',
  csharp:
    'using|var|new|await|async|null|true|false|class|public|private|static|return|string|object|int|bool',
  javascript: 'const|let|var|await|async|new|null|true|false|function|return|undefined',
  python: 'import|from|as|def|return|None|True|False|print|with|in|not|and|or',
  typescript: 'export|interface|type|string|number|boolean|null|unknown|never|undefined|true|false',
  json: 'true|false|null',
  java: 'public|private|record|class|import|int|double|boolean|null|true|false|new|return|static|final',
  go: 'type|struct|func|package|import|var|const|return|nil|true|false|string|int|int64|float64|bool|any',
  yaml: 'true|false|null',
  xml: '(?!)',
  text: '(?!)',
};

const COMMENT: Record<Language, string> = {
  bash: '#[^\\n]*',
  csharp: '//[^\\n]*',
  javascript: '//[^\\n]*',
  python: '#[^\\n]*',
  typescript: '//[^\\n]*',
  json: '(?!)',
  java: '//[^\\n]*',
  go: '//[^\\n]*',
  yaml: '#[^\\n]*',
  xml: '<!--[\\s\\S]*?-->',
  text: '(?!)',
};

type Kind = 'comment' | 'string' | 'number' | 'keyword' | 'flag' | 'type' | 'plain';

const CLASSES: Record<Kind, string> = {
  comment: 'italic text-muted',
  string: 'text-emerald-700 dark:text-emerald-300',
  number: 'text-sky-700 dark:text-sky-300',
  keyword: 'font-semibold text-accent2',
  flag: 'text-amber-700 dark:text-amber-300',
  type: 'text-cyan-700 dark:text-cyan-300',
  plain: '',
};

/** Splits code into highlighted tokens. Output is rendered as React text, never as HTML. */
export function tokenize(code: string, lang: Language): { text: string; kind: Kind }[] {
  const re = new RegExp(
    [
      `(?<comment>${COMMENT[lang]})`,
      `(?<string>"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\]|\\\\.|'\\\\'')*')`,
      `(?<flag>(?<![\\w-])--?[A-Za-z][\\w-]*(?=[\\s=]))`,
      `(?<number>\\b-?\\d+(?:\\.\\d+)?\\b)`,
      `(?<keyword>\\b(?:${KEYWORDS[lang]})\\b)`,
      `(?<type>\\b[A-Z][A-Za-z0-9_]*\\b)`,
    ].join('|'),
    'g',
  );
  const out: { text: string; kind: Kind }[] = [];
  let last = 0;
  for (const m of code.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: code.slice(last, start), kind: 'plain' });
    const groups = m.groups ?? {};
    let kind: Kind = 'plain';
    for (const k of ['comment', 'string', 'flag', 'number', 'keyword', 'type'] as const) {
      if (groups[k] !== undefined) kind = k;
    }
    // Flags only make sense for shell commands.
    if (kind === 'flag' && lang !== 'bash') kind = 'plain';
    out.push({ text: m[0], kind });
    last = start + m[0].length;
  }
  if (last < code.length) out.push({ text: code.slice(last), kind: 'plain' });
  return out;
}

const LABELS: Record<Language, string> = {
  bash: 'cURL',
  csharp: 'C#',
  javascript: 'JavaScript',
  python: 'Python',
  typescript: 'TypeScript',
  json: 'JSON',
  java: 'Java',
  go: 'Go',
  yaml: 'YAML',
  xml: 'XML',
  text: 'Output',
};

interface Props {
  code: string;
  language: Language;
  /** Overrides the header label. */
  title?: string;
  maxHeight?: number;
}

export function CodeBlock({ code, language, title, maxHeight = 260 }: Props) {
  const tokens = useMemo(() => tokenize(code, language), [code, language]);
  return (
    <figure className="card animate-rise overflow-hidden">
      <figcaption className="flex items-center justify-between border-b border-line bg-surface2/70 px-3 py-1.5">
        <span className="flex items-center gap-1.5">
          <span className="flex gap-1" aria-hidden="true">
            <i className="h-2 w-2 rounded-full bg-bad/70" />
            <i className="h-2 w-2 rounded-full bg-warn/70" />
            <i className="h-2 w-2 rounded-full bg-good/70" />
          </span>
          <span className="ml-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
            {title ?? LABELS[language]}
          </span>
        </span>
        <CopyButton text={code} />
      </figcaption>
      <pre
        className="overflow-auto p-3 font-mono text-xs leading-relaxed"
        style={{ maxHeight }}
        tabIndex={0}
      >
        <code>
          {tokens.map((t, i) => (
            <Fragment key={i}>
              {t.kind === 'plain' ? t.text : <span className={CLASSES[t.kind]}>{t.text}</span>}
            </Fragment>
          ))}
        </code>
      </pre>
    </figure>
  );
}
