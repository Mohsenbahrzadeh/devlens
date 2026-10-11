import { Icon } from '@/components/Icon';
import { AUTHOR, VERSION } from './author';

/** Product and author information shown in the settings panel. */
export function About() {
  return (
    <div className="flex items-center gap-3 border-t border-line pt-3">
      <span
        aria-hidden="true"
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent to-accent2 text-sm font-extrabold text-white shadow-glow dark:text-[#0b0d1a]"
      >
        {AUTHOR.initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Developed by
        </p>
        <p className="text-sm font-bold">{AUTHOR.name}</p>
        <a
          href={`mailto:${AUTHOR.email}`}
          className="block truncate text-xs text-accent underline-offset-2 hover:underline"
        >
          {AUTHOR.email}
        </a>
      </div>
      <div className="text-right text-[11px] text-muted">
        <p className="font-mono">DevLens v{VERSION}</p>
        <p className="mt-0.5 flex items-center justify-end gap-1">
          <Icon name="shield" size={11} className="text-good" /> MIT licensed
        </p>
      </div>
    </div>
  );
}
