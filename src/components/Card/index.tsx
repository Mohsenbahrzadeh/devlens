import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';

interface Props {
  title: string;
  icon?: IconName;
  actions?: ReactNode;
  children: ReactNode;
  /** Remove inner padding (for content that supplies its own). */
  flush?: boolean;
}

/** A titled surface used to group related output. */
export function Card({ title, icon, actions, children, flush }: Props) {
  return (
    <section aria-label={title} className="card animate-rise overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-line bg-surface2/50 px-3 py-1.5">
        <h3 className="section-title">
          {icon && <Icon name={icon} size={13} />}
          {title}
        </h3>
        {actions}
      </header>
      <div className={flush ? '' : 'p-3'}>{children}</div>
    </section>
  );
}
