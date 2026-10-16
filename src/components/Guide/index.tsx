import { useState } from 'react';
import { Icon } from '../Icon';

export interface GuideSection {
  /** What this tool does, 1-2 sentences. */
  what: string;
  /** Numbered steps for how to use it. */
  steps: string[];
  /** A concrete example: input -> output, or a short scenario. */
  example: string;
  /** When you'd reach for this tool. */
  useCase: string;
}

interface Props {
  en: GuideSection;
  fa: GuideSection;
}

const LABELS = {
  en: {
    title: 'Guide',
    what: 'What it does',
    steps: 'How to use it',
    example: 'Example',
    useCase: 'When to use it',
  },
  fa: {
    title: 'راهنما',
    what: 'این بخش چیکار می‌کند',
    steps: 'نحوه استفاده',
    example: 'مثال',
    useCase: 'چه زمانی به کارتان می‌آید',
  },
} as const;

/** A collapsible, bilingual (English/Persian) help panel: what a tool does, how to use it, and one example. */
export function Guide({ en, fa }: Props) {
  const [lang, setLang] = useState<'en' | 'fa'>('en');
  const s = lang === 'en' ? en : fa;
  const l = LABELS[lang];

  return (
    <details className="card group overflow-hidden">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px] font-semibold hover:bg-surface2/60">
        <Icon name="help" size={14} className="text-accent" />
        {l.title}
        <span className="text-[11px] font-normal text-muted">Guide · راهنما</span>
        <Icon
          name="chevron"
          size={14}
          className="ml-auto text-muted transition-transform group-open:rotate-90"
        />
      </summary>
      <div
        className="flex flex-col gap-3 border-t border-line p-3"
        dir={lang === 'fa' ? 'rtl' : 'ltr'}
      >
        <div className="flex gap-1.5 self-start" dir="ltr">
          <button
            type="button"
            onClick={() => setLang('en')}
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${lang === 'en' ? 'bg-accent text-white' : 'bg-surface2 text-muted'}`}
          >
            English
          </button>
          <button
            type="button"
            onClick={() => setLang('fa')}
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${lang === 'fa' ? 'bg-accent text-white' : 'bg-surface2 text-muted'}`}
          >
            فارسی
          </button>
        </div>
        <p className="text-xs">
          <b className="font-semibold">{l.what}:</b> {s.what}
        </p>
        <div className="text-xs">
          <b className="font-semibold">{l.steps}:</b>
          <ol
            className={`mt-1 flex list-decimal flex-col gap-0.5 ${lang === 'fa' ? 'pr-5' : 'pl-5'}`}
          >
            {s.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="text-xs">
          <b className="font-semibold">{l.example}:</b>
          <pre
            className="mt-1 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface2 p-2 font-mono text-[11px]"
            dir="ltr"
          >
            {s.example}
          </pre>
        </div>
        <p className="text-xs">
          <b className="font-semibold">{l.useCase}:</b> {s.useCase}
        </p>
      </div>
    </details>
  );
}
