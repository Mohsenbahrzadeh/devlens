import { useEffect, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { Button } from '../Button';

interface Props {
  text: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function CopyButton({ text, label = 'Copy', className, disabled }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      icon={copied ? undefined : 'copy'}
      className={`!px-2.5 !py-1 text-xs ${copied ? '!border-good/50 !text-good' : ''} ${className ?? ''}`}
      aria-live="polite"
    >
      {copied ? '✓ Copied' : label}
    </Button>
  );
}
