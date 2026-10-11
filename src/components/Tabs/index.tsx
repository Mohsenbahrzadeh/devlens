import { useRef, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '../Icon';

export interface TabItem {
  id: string;
  label: string;
  icon?: IconName;
}

interface Props {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  label: string;
  /** `lg` is the main navigation; `sm` is for nested tab groups. */
  size?: 'lg' | 'sm';
}

/** Accessible segmented tablist with arrow-key navigation. Panels use `id="panel-<id>"`. */
export function Tabs({ tabs, active, onChange, label, size = 'lg' }: Props) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[tabs[next].id]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex gap-1 rounded-xl border border-line bg-surface2/70 p-1 backdrop-blur ${size === 'sm' ? 'flex-wrap' : ''}`}
    >
      {tabs.map((t, i) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`flex flex-1 grow items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition ${
              size === 'lg' ? 'px-2 py-1.5 text-[13px]' : 'px-2 py-1 text-xs'
            } ${
              selected
                ? 'bg-surface text-accent shadow-card ring-1 ring-line'
                : 'text-muted hover:bg-surface/60 hover:text-fg'
            }`}
          >
            {t.icon && <Icon name={t.icon} size={size === 'lg' ? 15 : 13} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
