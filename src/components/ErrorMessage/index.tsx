import { useState } from 'react';
import type { AppError } from '@/types/result';
import { Icon, type IconName } from '../Icon';

export function ErrorMessage({ error }: { error: AppError }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      role="alert"
      className="animate-rise flex gap-2.5 rounded-xl border border-bad/30 bg-bad/10 p-3 text-bad"
    >
      <Icon name="alert" size={18} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">❌ {error.title}</p>
        <p className="mt-0.5 text-fg/90">{error.message}</p>
        {error.details && (
          <div className="mt-1.5">
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className="text-xs font-medium underline underline-offset-2"
            >
              {open ? 'Hide details' : 'Details'}
            </button>
            {open && (
              <pre className="mt-1 whitespace-pre-wrap rounded-md bg-surface/60 p-2 font-mono text-[11px] text-fg/80">
                {error.details}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ children, icon = 'sparkles' }: { children: string; icon?: IconName }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-line bg-surface/40 px-4 py-6 text-center text-muted">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent/10 text-accent">
        <Icon name={icon} size={18} />
      </span>
      <p className="max-w-[300px] text-[13px]">{children}</p>
    </div>
  );
}
