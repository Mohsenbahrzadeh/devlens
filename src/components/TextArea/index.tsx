import type { TextareaHTMLAttributes } from 'react';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

/** Labelled monospace textarea. Browser spellcheck/autocorrect are disabled. */
export function TextArea({ label, className = '', id, ...rest }: Props) {
  const areaId = id ?? `ta-${label.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <div className="flex min-h-0 flex-col gap-1.5">
      <label htmlFor={areaId} className="section-title">
        {label}
      </label>
      <textarea
        id={areaId}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className={`field resize-none font-mono text-xs leading-relaxed ${className}`}
        {...rest}
      />
    </div>
  );
}
