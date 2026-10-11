import { Icon, type IconName } from '../Icon';

export type BadgeTone = 'good' | 'bad' | 'warn' | 'info';

const tones: Record<BadgeTone, { cls: string; icon: IconName; word: string }> = {
  good: { cls: 'bg-good/15 text-good ring-good/30', icon: 'check', word: '' },
  bad: { cls: 'bg-bad/15 text-bad ring-bad/30', icon: 'x', word: '' },
  warn: { cls: 'bg-warn/15 text-warn ring-warn/30', icon: 'clock', word: '' },
  info: { cls: 'bg-accent/15 text-accent ring-accent/30', icon: 'sparkles', word: '' },
};

/** Status is always conveyed with text and an icon, never colour alone. */
export function StatusBadge({ tone, children }: { tone: BadgeTone; children: string }) {
  const t = tones[tone];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${t.cls}`}
    >
      <Icon name={t.icon} size={12} />
      {children}
    </span>
  );
}
