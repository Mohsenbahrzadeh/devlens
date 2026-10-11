import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from '../Icon';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
}

const styles: Record<Variant, string> = {
  primary:
    'bg-gradient-to-br from-accent to-accent2 text-white shadow-glow hover:brightness-110 active:brightness-95 dark:text-[#0b0d1a]',
  secondary:
    'border border-line bg-surface text-fg shadow-sm hover:border-accent/50 hover:bg-surface2 active:bg-surface2',
  ghost: 'text-muted hover:bg-surface2 hover:text-fg',
};

export function Button({
  variant = 'secondary',
  icon,
  className = '',
  type = 'button',
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none ${styles[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}
